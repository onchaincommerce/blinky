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

type Patch = Partial<MatchRecord>;
type MatchListener = (payload: { type: MatchStreamEventType; match: MatchRecord }) => void;

export class MatchStore {
  private readonly records = new Map<string, MatchRecord>();
  private readonly storagePath: string;
  private readonly events = new EventEmitter();

  constructor(storagePath = resolveStoragePath()) {
    this.storagePath = storagePath;
    this.loadFromDisk();
  }

  create(input: CreateMatchRequest) {
    const roomId = `blink-${crypto.randomUUID()}`;
    const inviteCode = roomId.split("-").slice(-1)[0] ?? crypto.randomUUID().slice(0, 8);
    const { roomIdHash, matchId } = deriveRoomIds(roomId);
    const now = new Date().toISOString();

    const record = MatchRecordSchema.parse({
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

    this.records.set(matchId, record);
    this.persist();
    this.emit("match.snapshot", record);
    return record;
  }

  get(matchId: string) {
    return this.records.get(matchId) ?? null;
  }

  list() {
    return Array.from(this.records.values()).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }

  listByUser(userId: string) {
    return this.list().filter(
      (match) => match.creatorUserId === userId || match.challengerUserId === userId
    );
  }

  join(matchId: string, input: JoinMatchRequest) {
    const match = this.require(matchId);
    if (match.creatorUserId === input.challengerUserId) {
      throw new Error("Creator cannot join as challenger");
    }
    if (match.challengerUserId && match.challengerUserId !== input.challengerUserId) {
      throw new Error("Challenger already joined");
    }

    return this.patch(matchId, {
      challengerUserId: input.challengerUserId,
      challengerEmail: input.challengerEmail,
      challengerWallet: input.challengerWallet,
      challengerSmartAccount: input.challengerSmartAccount
    }, "match.participant_joined");
  }

  confirmCreateFunding(matchId: string, hash: `0x${string}`) {
    const match = this.require(matchId);
    if (match.createTxHash === hash && match.status === "funded_one_side") {
      return match;
    }

    return this.patch(matchId, {
      createTxHash: hash,
      status: "funded_one_side"
    }, "match.snapshot");
  }

  confirmJoinFunding(matchId: string, hash: `0x${string}`) {
    const match = this.require(matchId);
    if (!match.challengerUserId || !match.challengerWallet || !match.challengerSmartAccount) {
      throw new Error("Challenger has not joined this match yet");
    }

    if (match.joinTxHash === hash && match.status === "ready") {
      return match;
    }

    return this.patch(matchId, {
      joinTxHash: hash,
      status: "ready"
    }, "match.snapshot");
  }

  beginCountdown(matchId: string, endsAt: string) {
    const match = this.require(matchId);
    if (match.status !== "ready" && match.status !== "countdown") {
      throw new Error("Match is not ready to begin countdown");
    }

    return this.patch(matchId, {
      status: "countdown",
      countdownEndsAt: endsAt
    }, "match.countdown_started");
  }

  setConnected(matchId: string, userId: string, connected: boolean) {
    const match = this.require(matchId);
    if (match.creatorUserId === userId) {
      if (!connected && match.status === "ready" && match.creatorReady) {
        return this.patch(matchId, {
          creatorConnected: false,
          creatorReady: false,
          creatorPresence: false
        }, "match.ready_changed");
      }
      return this.patch(matchId, {
        creatorConnected: connected
      }, "match.participant_joined");
    }
    if (match.challengerUserId === userId) {
      if (!connected && match.status === "ready" && match.challengerReady) {
        return this.patch(matchId, {
          challengerConnected: false,
          challengerReady: false,
          challengerPresence: false
        }, "match.ready_changed");
      }
      return this.patch(matchId, {
        challengerConnected: connected
      }, "match.participant_joined");
    }
    throw new Error("User is not part of this match");
  }

  setReady(matchId: string, userId: string, ready: boolean) {
    const match = this.require(matchId);
    if (match.creatorUserId === userId) {
      return this.patch(matchId, {
        creatorReady: ready,
        creatorPresence: ready
      }, "match.ready_changed");
    }
    if (match.challengerUserId === userId) {
      return this.patch(matchId, {
        challengerReady: ready,
        challengerPresence: ready
      }, "match.ready_changed");
    }
    throw new Error("User is not part of this match");
  }

  setCreateTxHash(matchId: string, hash: `0x${string}`) {
    return this.patch(matchId, { createTxHash: hash });
  }

  setJoinTxHash(matchId: string, hash: `0x${string}`) {
    return this.patch(matchId, { joinTxHash: hash });
  }

  setStatus(matchId: string, status: MatchStatus) {
    return this.patch(matchId, { status });
  }

  markStarted(matchId: string, txHash?: `0x${string}`) {
    return this.patch(matchId, {
      status: "live",
      countdownEndsAt: undefined,
      startTxHash: txHash
    }, "match.live");
  }

  markResolved(matchId: string, loserUserId: string, confidence: number, detectedAt: string, txHash?: `0x${string}`) {
    const match = this.require(matchId);
    if (!match.challengerUserId) {
      throw new Error("Cannot resolve a match without a challenger");
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

    return this.patch(matchId, {
      status: "resolved",
      result,
      resolveTxHash: txHash
    }, "match.resolved");
  }

  subscribe(matchId: string, listener: MatchListener) {
    const eventName = this.eventName(matchId);
    this.events.on(eventName, listener);
    return () => {
      this.events.off(eventName, listener);
    };
  }

  private patch(matchId: string, patch: Patch, type: MatchStreamEventType = "match.snapshot") {
    const match = this.require(matchId);
    const updated = MatchRecordSchema.parse({
      ...match,
      ...patch,
      updatedAt: new Date().toISOString()
    });
    this.records.set(matchId, updated);
    this.persist();
    this.emit(type, updated);
    return updated;
  }

  private require(matchId: string) {
    const match = this.get(matchId);
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
        const match = MatchRecordSchema.parse({
          ...item,
          creatorConnected: item.creatorConnected ?? false,
          challengerConnected: item.challengerConnected ?? false,
          creatorReady: item.creatorReady ?? item.creatorPresence ?? false,
          challengerReady: item.challengerReady ?? item.challengerPresence ?? false
        });
        this.records.set(match.id, match);
      }
    } catch (error) {
      console.error("Failed to load persisted matches", error);
    }
  }

  private persist() {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      fs.writeFileSync(
        this.storagePath,
        `${JSON.stringify(this.list(), null, 2)}\n`,
        "utf8"
      );
    } catch (error) {
      console.error("Failed to persist matches", error);
    }
  }

  private emit(type: MatchStreamEventType, match: MatchRecord) {
    this.events.emit(this.eventName(match.id), { type, match });
  }

  private eventName(matchId: string) {
    return `match:${matchId}`;
  }
}

const resolveStoragePath = () => {
  if (process.env.MATCH_STORAGE_PATH) {
    return process.env.MATCH_STORAGE_PATH;
  }

  if (process.env.VERCEL) {
    return "/tmp/blink-duel-matches.json";
  }

  return path.resolve(process.cwd(), "apps/referee/data/matches.json");
};
