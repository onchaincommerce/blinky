import type { Request, Response } from "express";
import { Router } from "express";
import {
  CreateMatchRequestSchema,
  FundingConfirmationRequestSchema,
  JoinMatchRequestSchema,
  MatchPresenceRequestSchema,
  MATCH_COUNTDOWN_SECONDS,
  type MatchRecord,
  type MatchStreamEventType,
  StartMatchRequestSchema
} from "@blink/shared";

import { CdpRefereeService } from "../services/cdp-referee.js";
import { LiveKitService } from "../services/livekit.js";
import { MatchStore } from "../services/match-store.js";

export const createMatchesRouter = (
  matches: MatchStore,
  livekit: LiveKitService,
  cdpReferee: CdpRefereeService
) => {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
      res.json({ matches: userId ? await matches.listByUser(userId) : await matches.list() });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post("/", async (req, res) => {
    try {
      const body = CreateMatchRequestSchema.parse(req.body);
      const match = await matches.create(body);
      res.status(201).json({ match });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const baseMatch = await requireMatch(matches, req);
      const match = await syncMatchLifecycle(baseMatch);
      const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
      const roomToken = await createRoomToken(livekit, match, userId);
      res.json({ match, roomToken });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get("/:id/stream", async (req, res) => {
    try {
      const match = await syncMatchLifecycle(await requireMatch(matches, req));
      const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
      if (!userId) {
        throw new Error("userId is required");
      }

      const isParticipant = userId === match.creatorUserId || userId === match.challengerUserId;
      if (!isParticipant) {
        throw new Error("Only participants can subscribe to this match");
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });
      res.flushHeaders?.();
      req.socket.setNoDelay(true);

      const writeEvent = (type: MatchStreamEventType, nextMatch: MatchRecord, id?: string) => {
        if (id) {
          res.write(`id: ${id}\n`);
        }
        res.write(`event: ${type}\n`);
        res.write(`data: ${JSON.stringify({ type, match: nextMatch })}\n\n`);
        (res as Response & { flush?: () => void }).flush?.();
      };

      writeEvent("match.snapshot", match);

      const unsubscribe = await matches.subscribe(
        match.id,
        ({ id, type, match: nextMatch }) => {
          writeEvent(type, nextMatch, id);
        },
        {
          afterId: req.get("Last-Event-ID") ?? undefined
        }
      );

      const keepAlive = setInterval(() => {
        res.write(": ping\n\n");
      }, 15000);

      req.on("close", () => {
        clearInterval(keepAlive);
        unsubscribe();
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post("/:id/join", async (req, res) => {
    try {
      const match = await matches.join(req.params.id, JoinMatchRequestSchema.parse(req.body));
      res.json({ match });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post("/:id/funding/create", async (req, res) => {
    try {
      const confirmation = FundingConfirmationRequestSchema.parse(req.body);
      const match = await matches.confirmCreateFunding(req.params.id, confirmation.txHash as `0x${string}`);
      res.json({ match });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post("/:id/funding/join", async (req, res) => {
    try {
      const confirmation = FundingConfirmationRequestSchema.parse(req.body);
      const match = await matches.confirmJoinFunding(req.params.id, confirmation.txHash as `0x${string}`);
      res.json({ match });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post("/:id/presence", async (req, res) => {
    try {
      const payload = MatchPresenceRequestSchema.parse(req.body);
      const match = await syncMatchLifecycle(await requireMatch(matches, req));
      if (match.status === "resolved" || match.status === "cancelled" || match.status === "refunded") {
        return res.json({ match, roomToken: await createRoomToken(livekit, match, payload.userId) });
      }

      const updated = await matches.setConnected(match.id, payload.userId, payload.connected);
      const roomToken = await createRoomToken(livekit, updated, payload.userId);
      res.json({ match: updated, roomToken });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  const readyHandler = async (req: Request, res: Response) => {
    try {
      const start = StartMatchRequestSchema.parse(req.body);
      const match = await syncMatchLifecycle(await requireMatch(matches, req));

      if (match.status === "live") {
        const roomToken = await createRoomToken(livekit, match, start.userId);
        return res.json({ match, ready: true, roomToken });
      }

      if (match.status === "countdown") {
        const roomToken = await createRoomToken(livekit, match, start.userId);
        return res.json({
          match,
          ready: true,
          roomToken,
          message: "Countdown already started"
        });
      }

      if (match.status !== "ready") {
        const roomToken = await createRoomToken(livekit, match, start.userId);
        return res.json({
          match,
          ready: false,
          roomToken,
          message: "Both players must finish funding escrow before the duel can arm"
        });
      }

      const withReady = await matches.setReady(match.id, start.userId, true, {
        connected: true,
        countdownEndsAt: new Date(Date.now() + MATCH_COUNTDOWN_SECONDS * 1000).toISOString()
      });
      const roomToken = await createRoomToken(livekit, withReady, start.userId);

      if (withReady.status === "countdown") {
        return res.json({
          match: withReady,
          ready: true,
          roomToken,
          message: "Countdown started"
        });
      }

      return res.json({
        match: withReady,
        ready: false,
        roomToken,
        message: "Waiting for the second player to get ready"
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  };

  router.post("/:id/ready", readyHandler);
  router.post("/:id/start", readyHandler);

  return router;

  async function syncMatchLifecycle(match: MatchRecord) {
    if (match.status !== "countdown" || !match.countdownEndsAt) {
      return match;
    }

    if (new Date(match.countdownEndsAt).getTime() > Date.now()) {
      return match;
    }

    const latest = (await matches.get(match.id)) ?? match;
    if (latest.status !== "countdown" || !latest.countdownEndsAt) {
      return latest;
    }
    if (new Date(latest.countdownEndsAt).getTime() > Date.now()) {
      return latest;
    }

    const lock = await matches.acquireLock(matchStartLockKey(latest.id), 30);
    if (!lock.acquired) {
      return (await matches.get(latest.id)) ?? latest;
    }

    try {
      const current = (await matches.get(latest.id)) ?? latest;
      if (current.status !== "countdown" || !current.countdownEndsAt) {
        return current;
      }
      if (new Date(current.countdownEndsAt).getTime() > Date.now()) {
        return current;
      }

      const txHash = await cdpReferee.startMatch(BigInt(current.matchId));
      const startedMatch = await matches.markStarted(current.id, txHash ?? undefined);
      return startedMatch;
    } finally {
      await matches.releaseLock(lock);
    }
  }
};

const requireMatch = async (matches: MatchStore, req: Request) => {
  const matchId = req.params.id as string;
  const match = await matches.get(matchId);
  if (!match) {
    throw new Error(`Match ${matchId} not found`);
  }
  return match;
};

const createRoomToken = async (
  livekit: LiveKitService,
  match: MatchRecord,
  userId?: string
) => {
  if (!userId) {
    return null;
  }

  const isParticipant = userId === match.creatorUserId || userId === match.challengerUserId;
  if (!isParticipant) {
    return null;
  }

  return livekit.createParticipantToken(match.livekitRoomName, `${match.id}:${userId}`, userId);
};

const matchStartLockKey = (matchId: string) => `match_start_lock:${matchId}`;

const handleRouteError = (res: Response, error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  let status = 400;

  if (/not found/i.test(message)) {
    status = 404;
  } else if (/only participants/i.test(message)) {
    status = 403;
  }

  res.status(status).json({ error: message });
};
