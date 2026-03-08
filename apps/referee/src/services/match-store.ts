import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";

import type {
  BlinkResult,
  CreateMatchRequest,
  JoinMatchRequest,
  MatchRecord,
  MatchStreamEventType,
  MatchStatus
} from "@blink/shared";
import { MatchRecordSchema, blinkResultHash, deriveRoomIds } from "@blink/shared";

import { config } from "../config.js";
import { getRedisClient, hasRedis } from "./redis.js";

type Patch = Partial<MatchRecord>;
type MatchListener = (payload: { id?: string; type: MatchStreamEventType; match: MatchRecord }) => void;
type MutationPlan =
  | {
      patch: Patch;
      type?: MatchStreamEventType;
    }
  | null;
type LockHandle = {
  key: string;
  token: string;
  acquired: boolean;
};

const ALL_MATCHES_KEY = "matches:all";
const MAX_EVENT_STREAM_LENGTH = 200;
const WATCH_RETRY_LIMIT = 8;

export class MatchStore {
  private readonly records = new Map<string, MatchRecord>();
  private readonly storagePath: string;
  private readonly events = new EventEmitter();
  private readonly useRedis: boolean;

  constructor(storagePath = resolveStoragePath()) {
    this.storagePath = storagePath;
    this.useRedis = hasRedis();

    if (process.env.VERCEL && !this.useRedis) {
      throw new Error("REDIS_URL is required on Vercel");
    }

    if (!this.useRedis) {
      this.loadFromDisk();
    }
  }

  async create(input: CreateMatchRequest) {
    const roomId = `blink-${crypto.randomUUID()}`;
    const inviteCode = roomId.split("-").slice(-1)[0] ?? crypto.randomUUID().slice(0, 8);
    const { roomIdHash, matchId } = deriveRoomIds(roomId);
    const now = new Date().toISOString();

    const record = normalizeMatchRecord({
      id: matchId,
      roomId,
      roomIdHash,
      matchId,
      inviteCode,
      stakeToken: input.stakeToken,
      stakeAmount: input.stakeAmount,
      creatorUserId: input.creatorUserId,
      creatorEmail: input.creatorEmail,
      creatorWallet: input.creatorWallet,
      creatorSmartAccount: input.creatorSmartAccount,
      status: "created",
      createdAt: now,
      updatedAt: now,
      livekitRoomName: roomId,
      creatorConnected: false,
      challengerConnected: false,
      creatorReady: false,
      challengerReady: false,
      creatorPresence: false,
      challengerPresence: false
    });

    if (!this.useRedis) {
      this.records.set(matchId, record);
      this.persist();
      this.emitLocal("match.snapshot", record);
      return record;
    }

    const client = await getRedisClient();
    const multi = client.multi();
    this.queueRedisWrite(multi, record, "match.snapshot");
    await multi.exec();
    return record;
  }

  async get(matchId: string) {
    if (!this.useRedis) {
      return this.records.get(matchId) ?? null;
    }

    const client = await getRedisClient();
    const raw = await client.get(matchKey(matchId));
    if (!raw) {
      return null;
    }

    return normalizeMatchRecord(JSON.parse(raw) as MatchRecord);
  }

  async list() {
    if (!this.useRedis) {
      return Array.from(this.records.values()).sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
      );
    }

    return this.listFromIndex(ALL_MATCHES_KEY);
  }

  async listByUser(userId: string) {
    if (!this.useRedis) {
      return (await this.list()).filter(
        (match) => match.creatorUserId === userId || match.challengerUserId === userId
      );
    }

    return this.listFromIndex(userMatchesKey(userId));
  }

  async join(matchId: string, input: JoinMatchRequest) {
    if (!this.useRedis) {
      const match = this.requireLocal(matchId);
      if (match.creatorUserId === input.challengerUserId) {
        throw new Error("Creator cannot join as challenger");
      }
      if (match.challengerUserId && match.challengerUserId !== input.challengerUserId) {
        throw new Error("Challenger already joined");
      }

      return this.patchLocal(
        matchId,
        {
          challengerUserId: input.challengerUserId,
          challengerEmail: input.challengerEmail,
          challengerWallet: input.challengerWallet,
          challengerSmartAccount: input.challengerSmartAccount
        },
        "match.participant_joined"
      );
    }

    return this.patchRedis(matchId, (match) => {
      if (match.creatorUserId === input.challengerUserId) {
        throw new Error("Creator cannot join as challenger");
      }

      if (match.challengerUserId && match.challengerUserId !== input.challengerUserId) {
        throw new Error("Challenger already joined");
      }

      if (
        match.challengerUserId === input.challengerUserId &&
        match.challengerWallet === input.challengerWallet &&
        match.challengerSmartAccount === input.challengerSmartAccount &&
        match.challengerEmail === input.challengerEmail
      ) {
        return null;
      }

      return {
        patch: {
          challengerUserId: input.challengerUserId,
          challengerEmail: input.challengerEmail,
          challengerWallet: input.challengerWallet,
          challengerSmartAccount: input.challengerSmartAccount
        },
        type: "match.participant_joined"
      };
    });
  }

  async confirmCreateFunding(matchId: string, hash: `0x${string}`) {
    if (!this.useRedis) {
      const match = this.requireLocal(matchId);
      if (match.createTxHash === hash && match.status === "funded_one_side") {
        return match;
      }

      return this.patchLocal(
        matchId,
        {
          createTxHash: hash,
          status: match.status === "created" ? "funded_one_side" : match.status
        },
        "match.snapshot"
      );
    }

    return this.patchRedis(matchId, (match) => {
      if (match.createTxHash === hash && match.status !== "created") {
        return null;
      }

      return {
        patch: {
          createTxHash: hash,
          status: match.status === "created" ? "funded_one_side" : match.status
        },
        type: "match.snapshot"
      };
    });
  }

  async confirmJoinFunding(matchId: string, hash: `0x${string}`) {
    if (!this.useRedis) {
      const match = this.requireLocal(matchId);
      if (!match.challengerUserId || !match.challengerWallet || !match.challengerSmartAccount) {
        throw new Error("Challenger has not joined this match yet");
      }

      if (match.joinTxHash === hash && match.status === "ready") {
        return match;
      }

      return this.patchLocal(
        matchId,
        {
          joinTxHash: hash,
          status: isTerminalOrStartedStatus(match.status) ? match.status : "ready"
        },
        "match.snapshot"
      );
    }

    return this.patchRedis(matchId, (match) => {
      if (!match.challengerUserId || !match.challengerWallet || !match.challengerSmartAccount) {
        throw new Error("Challenger has not joined this match yet");
      }

      if (match.joinTxHash === hash && match.status !== "funded_one_side") {
        return null;
      }

      return {
        patch: {
          joinTxHash: hash,
          status: isTerminalOrStartedStatus(match.status) ? match.status : "ready"
        },
        type: "match.snapshot"
      };
    });
  }

  async beginCountdown(matchId: string, endsAt: string) {
    if (!this.useRedis) {
      const match = this.requireLocal(matchId);
      if (match.status !== "ready" && match.status !== "countdown") {
        throw new Error("Match is not ready to begin countdown");
      }

      if (match.status === "countdown" && match.countdownEndsAt === endsAt) {
        return match;
      }

      return this.patchLocal(
        matchId,
        {
          status: "countdown",
          countdownEndsAt: endsAt
        },
        "match.countdown_started"
      );
    }

    return this.patchRedis(matchId, (match) => {
      if (match.status !== "ready" && match.status !== "countdown") {
        throw new Error("Match is not ready to begin countdown");
      }

      if (match.status === "countdown" && match.countdownEndsAt === endsAt) {
        return null;
      }

      return {
        patch: {
          status: "countdown",
          countdownEndsAt: endsAt
        },
        type: "match.countdown_started"
      };
    });
  }

  async setConnected(matchId: string, userId: string, connected: boolean) {
    if (!this.useRedis) {
      const match = this.requireLocal(matchId);
      if (match.creatorUserId === userId) {
        if (!connected && match.status === "ready" && match.creatorReady) {
          return this.patchLocal(
            matchId,
            {
              creatorConnected: false,
              creatorReady: false,
              creatorPresence: false
            },
            "match.ready_changed"
          );
        }

        return this.patchLocal(matchId, { creatorConnected: connected }, "match.participant_joined");
      }

      if (match.challengerUserId === userId) {
        if (!connected && match.status === "ready" && match.challengerReady) {
          return this.patchLocal(
            matchId,
            {
              challengerConnected: false,
              challengerReady: false,
              challengerPresence: false
            },
            "match.ready_changed"
          );
        }

        return this.patchLocal(matchId, { challengerConnected: connected }, "match.participant_joined");
      }

      throw new Error("User is not part of this match");
    }

    return this.patchRedis(matchId, (match) => {
      if (match.creatorUserId === userId) {
        if (!connected && match.status === "ready" && match.creatorReady) {
          return {
            patch: {
              creatorConnected: false,
              creatorReady: false,
              creatorPresence: false
            },
            type: "match.ready_changed"
          };
        }

        if (match.creatorConnected === connected) {
          return null;
        }

        return {
          patch: { creatorConnected: connected },
          type: "match.participant_joined"
        };
      }

      if (match.challengerUserId === userId) {
        if (!connected && match.status === "ready" && match.challengerReady) {
          return {
            patch: {
              challengerConnected: false,
              challengerReady: false,
              challengerPresence: false
            },
            type: "match.ready_changed"
          };
        }

        if (match.challengerConnected === connected) {
          return null;
        }

        return {
          patch: { challengerConnected: connected },
          type: "match.participant_joined"
        };
      }

      throw new Error("User is not part of this match");
    });
  }

  async setReady(
    matchId: string,
    userId: string,
    ready: boolean,
    options?: {
      countdownEndsAt?: string;
      connected?: boolean;
    }
  ) {
    if (!this.useRedis) {
      const match = this.requireLocal(matchId);
      const endsAt = options?.countdownEndsAt;

      if (match.creatorUserId === userId) {
        const nextCreatorReady = ready;
        const nextChallengerReady = match.challengerReady;
        const shouldCountdown = ready && Boolean(endsAt) && nextCreatorReady && nextChallengerReady;
        return this.patchLocal(
          matchId,
          {
            creatorConnected: options?.connected ?? match.creatorConnected,
            creatorReady: ready,
            creatorPresence: ready,
            status: shouldCountdown ? "countdown" : match.status,
            countdownEndsAt: shouldCountdown ? endsAt : match.countdownEndsAt
          },
          shouldCountdown ? "match.countdown_started" : "match.ready_changed"
        );
      }

      if (match.challengerUserId === userId) {
        const nextCreatorReady = match.creatorReady;
        const nextChallengerReady = ready;
        const shouldCountdown = ready && Boolean(endsAt) && nextCreatorReady && nextChallengerReady;
        return this.patchLocal(
          matchId,
          {
            challengerConnected: options?.connected ?? match.challengerConnected,
            challengerReady: ready,
            challengerPresence: ready,
            status: shouldCountdown ? "countdown" : match.status,
            countdownEndsAt: shouldCountdown ? endsAt : match.countdownEndsAt
          },
          shouldCountdown ? "match.countdown_started" : "match.ready_changed"
        );
      }

      throw new Error("User is not part of this match");
    }

    return this.patchRedis(matchId, (match) => {
      if (match.status === "countdown" || match.status === "live") {
        return null;
      }

      if (match.status !== "ready") {
        throw new Error("Match is not ready for player ready-up");
      }

      const endsAt = options?.countdownEndsAt;

      if (match.creatorUserId === userId) {
        const nextCreatorReady = ready;
        const nextChallengerReady = match.challengerReady;
        const shouldCountdown = ready && Boolean(endsAt) && nextCreatorReady && nextChallengerReady;

        if (
          match.creatorReady === ready &&
          (options?.connected === undefined || match.creatorConnected === options.connected)
        ) {
          return null;
        }

        return {
          patch: {
            creatorConnected: options?.connected ?? match.creatorConnected,
            creatorReady: ready,
            creatorPresence: ready,
            status: shouldCountdown ? "countdown" : match.status,
            countdownEndsAt: shouldCountdown ? endsAt : match.countdownEndsAt
          },
          type: shouldCountdown ? "match.countdown_started" : "match.ready_changed"
        };
      }

      if (match.challengerUserId === userId) {
        const nextCreatorReady = match.creatorReady;
        const nextChallengerReady = ready;
        const shouldCountdown = ready && Boolean(endsAt) && nextCreatorReady && nextChallengerReady;

        if (
          match.challengerReady === ready &&
          (options?.connected === undefined || match.challengerConnected === options.connected)
        ) {
          return null;
        }

        return {
          patch: {
            challengerConnected: options?.connected ?? match.challengerConnected,
            challengerReady: ready,
            challengerPresence: ready,
            status: shouldCountdown ? "countdown" : match.status,
            countdownEndsAt: shouldCountdown ? endsAt : match.countdownEndsAt
          },
          type: shouldCountdown ? "match.countdown_started" : "match.ready_changed"
        };
      }

      throw new Error("User is not part of this match");
    });
  }

  async setCreateTxHash(matchId: string, hash: `0x${string}`) {
    return this.patchAny(matchId, { createTxHash: hash });
  }

  async setJoinTxHash(matchId: string, hash: `0x${string}`) {
    return this.patchAny(matchId, { joinTxHash: hash });
  }

  async setStatus(matchId: string, status: MatchStatus) {
    return this.patchAny(matchId, { status });
  }

  async markStarted(matchId: string, txHash?: `0x${string}`) {
    if (!this.useRedis) {
      const match = this.requireLocal(matchId);
      if (match.status === "live" && (!txHash || match.startTxHash === txHash)) {
        return match;
      }
      if (match.status !== "countdown" && match.status !== "live") {
        throw new Error("Match is not ready to start");
      }

      const liveStartedAt = match.liveStartedAt ?? new Date().toISOString();
      return this.patchLocal(
        matchId,
        {
          status: "live",
          liveStartedAt,
          countdownEndsAt: undefined,
          startTxHash: txHash
        },
        "match.live"
      );
    }

    return this.patchRedis(matchId, (match) => {
      if (match.status === "live" && (!txHash || match.startTxHash === txHash)) {
        return null;
      }

      if (match.status !== "countdown" && match.status !== "live") {
        throw new Error("Match is not ready to start");
      }

      const liveStartedAt = match.liveStartedAt ?? new Date().toISOString();
      return {
        patch: {
          status: "live",
          liveStartedAt,
          countdownEndsAt: undefined,
          startTxHash: txHash
        },
        type: "match.live"
      };
    });
  }

  async markResultDetected(matchId: string, loserUserId: string, confidence: number, detectedAt: string) {
    if (!this.useRedis) {
      const match = this.requireLocal(matchId);
      if (!match.challengerUserId) {
        throw new Error("Cannot detect a result without a challenger");
      }

      if (match.result) {
        return match;
      }

      if (match.status !== "live") {
        throw new Error("Match is not live");
      }

      const winnerUserId = loserUserId === match.creatorUserId ? match.challengerUserId : match.creatorUserId;
      const result: BlinkResult = {
        loserUserId,
        winnerUserId,
        detectedAt,
        confidence,
        resultHash: blinkResultHash({
          matchId,
          loserUserId,
          winnerUserId,
          detectedAt,
          confidence
        })
      };

      return this.patchLocal(
        matchId,
        {
          result,
          settlementStatus: "pending"
        },
        "match.result_detected"
      );
    }

    return this.patchRedis(matchId, (match) => {
      if (!match.challengerUserId) {
        throw new Error("Cannot detect a result without a challenger");
      }

      if (match.result) {
        return null;
      }

      if (match.status !== "live") {
        throw new Error("Match is not live");
      }

      const winnerUserId = loserUserId === match.creatorUserId ? match.challengerUserId : match.creatorUserId;
      const result: BlinkResult = {
        loserUserId,
        winnerUserId,
        detectedAt,
        confidence,
        resultHash: blinkResultHash({
          matchId,
          loserUserId,
          winnerUserId,
          detectedAt,
          confidence
        })
      };

      return {
        patch: {
          result,
          settlementStatus: "pending"
        },
        type: "match.result_detected"
      };
    });
  }

  async markResolved(
    matchId: string,
    loserUserId: string,
    confidence: number,
    detectedAt: string,
    txHash?: `0x${string}`
  ) {
    if (!this.useRedis) {
      const match = this.requireLocal(matchId);
      if (!match.challengerUserId) {
        throw new Error("Cannot resolve a match without a challenger");
      }

      if (match.status === "resolved" && (!txHash || match.resolveTxHash === txHash)) {
        return match;
      }

      const winnerUserId = loserUserId === match.creatorUserId ? match.challengerUserId : match.creatorUserId;
      const result: BlinkResult = {
        loserUserId,
        winnerUserId,
        detectedAt,
        confidence,
        resultHash: blinkResultHash({
          matchId,
          loserUserId,
          winnerUserId,
          detectedAt,
          confidence
        })
      };

      return this.patchLocal(
        matchId,
        {
          status: "resolved",
          result,
          settlementStatus: "settled",
          resolveTxHash: txHash
        },
        "match.resolved"
      );
    }

    return this.patchRedis(matchId, (match) => {
      if (!match.challengerUserId) {
        throw new Error("Cannot resolve a match without a challenger");
      }

      if (match.status === "resolved" && (!txHash || match.resolveTxHash === txHash)) {
        return null;
      }

      if (match.status !== "live" && match.status !== "resolved") {
        throw new Error("Match is not ready for resolution");
      }

      const winnerUserId = loserUserId === match.creatorUserId ? match.challengerUserId : match.creatorUserId;
      const result: BlinkResult = {
        loserUserId,
        winnerUserId,
        detectedAt,
        confidence,
        resultHash: blinkResultHash({
          matchId,
          loserUserId,
          winnerUserId,
          detectedAt,
          confidence
        })
      };

      return {
        patch: {
          status: "resolved",
          result: match.result ?? result,
          settlementStatus: "settled",
          resolveTxHash: txHash ?? match.resolveTxHash
        },
        type: "match.resolved"
      };
    });
  }

  async subscribe(
    matchId: string,
    listener: MatchListener,
    options?: {
      afterId?: string;
    }
  ) {
    if (!this.useRedis) {
      const eventName = this.eventName(matchId);
      this.events.on(eventName, listener);
      return () => {
        this.events.off(eventName, listener);
      };
    }

    let closed = false;
    let currentId = options?.afterId ?? "$";
    const baseClient = await getRedisClient();
    const streamClient = baseClient.duplicate();
    await streamClient.connect();

    const loop = async () => {
      while (!closed) {
        try {
          const response = await (streamClient as any).xRead(
            [{ key: matchEventsKey(matchId), id: currentId }],
            { BLOCK: 15000, COUNT: 20 }
          );

          if (closed || !response) {
            continue;
          }

          for (const stream of response) {
            for (const message of stream.messages) {
              currentId = message.id;
              const type = message.message.type as MatchStreamEventType;
              const match = normalizeMatchRecord(JSON.parse(message.message.match) as MatchRecord);
              listener({
                id: message.id,
                type,
                match
              });
            }
          }
        } catch (error) {
          if (!closed) {
            console.error("Failed to read Redis match stream", error);
            await sleep(1000);
          }
        }
      }
    };

    void loop();

    return () => {
      closed = true;
      void streamClient.close().catch(() => undefined);
    };
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<LockHandle> {
    if (!this.useRedis) {
      return {
        key,
        token: crypto.randomUUID(),
        acquired: true
      };
    }

    const client = await getRedisClient();
    const token = crypto.randomUUID();
    const result = await client.set(key, token, {
      NX: true,
      EX: ttlSeconds
    });

    return {
      key,
      token,
      acquired: result === "OK"
    };
  }

  async releaseLock(lock: LockHandle) {
    if (!this.useRedis || !lock.acquired) {
      return;
    }

    const client = await getRedisClient();
    await (client as any).eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
      {
        keys: [lock.key],
        arguments: [lock.token]
      }
    );
  }

  private async patchAny(matchId: string, patch: Patch) {
    if (!this.useRedis) {
      return this.patchLocal(matchId, patch);
    }

    return this.patchRedis(matchId, () => ({
      patch,
      type: "match.snapshot"
    }));
  }

  private async patchRedis(matchId: string, mutate: (match: MatchRecord) => MutationPlan): Promise<MatchRecord> {
    for (let attempt = 0; attempt < WATCH_RETRY_LIMIT; attempt += 1) {
      const baseClient = await getRedisClient();
      const isolated = baseClient.duplicate();
      await isolated.connect();

      let updated: MatchRecord | null = null;
      try {
        await isolated.watch(matchKey(matchId));
        const raw = await isolated.get(matchKey(matchId));
        if (!raw) {
          throw new Error(`Match ${matchId} not found`);
        }

        const current = normalizeMatchRecord(JSON.parse(raw) as MatchRecord);
        const plan = mutate(current);
        if (!plan) {
          await isolated.unwatch();
          updated = current;
        } else {
          const next = normalizeMatchRecord({
            ...current,
            ...plan.patch,
            updatedAt: new Date().toISOString()
          });

          const multi = isolated.multi();
          this.queueRedisWrite(multi, next, plan.type ?? "match.snapshot");
          const result = await multi.exec();
          updated = result ? next : null;
        }
      } finally {
        await isolated.close().catch(() => undefined);
      }

      if (updated) {
        return updated;
      }
    }

    throw new Error("Concurrent match update failed after multiple retries");
  }

  private queueRedisWrite(multi: any, match: MatchRecord, type: MatchStreamEventType) {
    const score = Date.parse(match.updatedAt);
    multi.set(matchKey(match.id), JSON.stringify(match));
    multi.zAdd(ALL_MATCHES_KEY, [{ score, value: match.id }]);
    multi.zAdd(userMatchesKey(match.creatorUserId), [{ score, value: match.id }]);
    if (match.challengerUserId) {
      multi.zAdd(userMatchesKey(match.challengerUserId), [{ score, value: match.id }]);
    }
    multi.xAdd(
      matchEventsKey(match.id),
      "*",
      {
        type,
        match: JSON.stringify(match)
      },
      {
        TRIM: {
          strategy: "MAXLEN",
          strategyModifier: "~",
          threshold: MAX_EVENT_STREAM_LENGTH
        }
      }
    );
  }

  private async listFromIndex(indexKey: string) {
    const client = await getRedisClient();
    const ids = await client.zRange(indexKey, 0, -1, { REV: true });
    if (ids.length === 0) {
      return [];
    }

    const raws = await client.mGet(ids.map((id: string) => matchKey(id)));
    const matches: MatchRecord[] = [];
    for (const raw of raws) {
      if (!raw) continue;
      matches.push(normalizeMatchRecord(JSON.parse(raw) as MatchRecord));
    }

    return matches.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  private patchLocal(matchId: string, patch: Patch, type: MatchStreamEventType = "match.snapshot") {
    const match = this.requireLocal(matchId);
    const updated = normalizeMatchRecord({
      ...match,
      ...patch,
      updatedAt: new Date().toISOString()
    });
    this.records.set(matchId, updated);
    this.persist();
    this.emitLocal(type, updated);
    return updated;
  }

  private requireLocal(matchId: string) {
    const match = this.records.get(matchId);
    if (!match) {
      throw new Error(`Match ${matchId} not found`);
    }
    return match;
  }

  private loadFromDisk() {
    try {
      if (!fs.existsSync(this.storagePath)) {
        return;
      }

      const raw = fs.readFileSync(this.storagePath, "utf8");
      if (!raw.trim()) {
        return;
      }

      const parsed = JSON.parse(raw) as MatchRecord[];
      for (const item of parsed) {
        const match = normalizeMatchRecord(item);
        this.records.set(match.id, match);
      }
    } catch (error) {
      console.error("Failed to load persisted matches", error);
    }
  }

  private persist() {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      fs.writeFileSync(this.storagePath, `${JSON.stringify(this.recordsAsList(), null, 2)}\n`, "utf8");
    } catch (error) {
      console.error("Failed to persist matches", error);
    }
  }

  private recordsAsList() {
    return Array.from(this.records.values()).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }

  private emitLocal(type: MatchStreamEventType, match: MatchRecord) {
    this.events.emit(this.eventName(match.id), { type, match });
  }

  private eventName(matchId: string) {
    return `match:${matchId}`;
  }
}

const normalizeMatchRecord = (input: MatchRecord | Record<string, unknown>) =>
  MatchRecordSchema.parse({
    ...input,
    creatorConnected: input.creatorConnected ?? false,
    challengerConnected: input.challengerConnected ?? false,
    creatorReady: input.creatorReady ?? input.creatorPresence ?? false,
    challengerReady: input.challengerReady ?? input.challengerPresence ?? false
  });

const isTerminalOrStartedStatus = (status: MatchStatus) =>
  status === "countdown" || status === "live" || status === "resolved" || status === "cancelled" || status === "refunded";

const matchKey = (matchId: string) => `match:${matchId}`;
const userMatchesKey = (userId: string) => `user_matches:${userId}`;
const matchEventsKey = (matchId: string) => `match_events:${matchId}`;

const sleep = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const resolveStoragePath = () => {
  if (process.env.MATCH_STORAGE_PATH) {
    return process.env.MATCH_STORAGE_PATH;
  }

  if (process.env.VERCEL) {
    return "/tmp/blink-duel-matches.json";
  }

  return path.resolve(process.cwd(), "apps/referee/data/matches.json");
};
