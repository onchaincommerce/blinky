import { blinkResultHash, type LandmarkSample, type MatchResultRequest } from "@blink/shared";

import { CdpRefereeService } from "./cdp-referee.js";
import { EarBlinkDetector } from "./blink-detector.js";
import { MatchStore } from "./match-store.js";

const WARM_STATUSES = new Set(["ready", "countdown", "live"]);

export class RefereeEngine {
  constructor(
    private readonly matches: MatchStore,
    private readonly detector: EarBlinkDetector,
    private readonly cdpReferee: CdpRefereeService
  ) {}

  async ingestLandmarkSample(matchId: string, sample: LandmarkSample) {
    const match = await this.matches.get(matchId);
    if (!match || match.result || !WARM_STATUSES.has(match.status)) {
      return null;
    }

    const live = match.status === "live";
    const hit = this.detector.ingest(matchId, sample, {
      allowDetections: live
    });

    if (!live || !hit) {
      return null;
    }

    return this.resolve(matchId, {
      loserUserId: hit.userId,
      confidence: hit.confidence,
      detectedAt: hit.detectedAt,
      source: "mediapipe-livekit-worker"
    });
  }

  async resolve(matchId: string, input: MatchResultRequest) {
    const match = await this.matches.get(matchId);
    if (!match || !match.challengerUserId || !match.challengerWallet) {
      throw new Error("Match is not ready for resolution");
    }

    if (match.status === "resolved") {
      return match;
    }

    const lock = await this.matches.acquireLock(`match_resolve_lock:${matchId}`, 60);
    if (!lock.acquired) {
      return (await this.matches.get(matchId)) ?? match;
    }

    try {
      const latest = (await this.matches.get(matchId)) ?? match;
      if (!latest.challengerUserId || !latest.challengerWallet) {
        throw new Error("Match is not ready for resolution");
      }
      if (latest.status === "resolved") {
        return latest;
      }
      if (latest.status !== "live") {
        throw new Error("Match is not ready for resolution");
      }

      const winnerUserId =
        input.loserUserId === latest.creatorUserId ? latest.challengerUserId : latest.creatorUserId;
      const winnerWallet =
        input.loserUserId === latest.creatorUserId ? latest.challengerWallet : latest.creatorWallet;
      const resultHash = blinkResultHash({
        matchId,
        loserUserId: input.loserUserId,
        winnerUserId,
        detectedAt: input.detectedAt,
        confidence: input.confidence
      });

      await this.matches.markResultDetected(matchId, input.loserUserId, input.confidence, input.detectedAt);

      const txHash = await this.cdpReferee.resolveMatch(
        BigInt(latest.matchId),
        winnerWallet as `0x${string}`,
        resultHash as `0x${string}`
      );

      const resolved = await this.matches.markResolved(
        matchId,
        input.loserUserId,
        input.confidence,
        input.detectedAt,
        txHash ?? undefined
      );
      return resolved;
    } finally {
      await this.matches.releaseLock(lock);
    }
  }
}
