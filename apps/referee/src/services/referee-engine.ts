import type { LandmarkSample, MatchResultRequest } from "@blink/shared";

import { CdpRefereeService } from "./cdp-referee.js";
import { EarBlinkDetector } from "./blink-detector.js";
import { MatchStore } from "./match-store.js";

export class RefereeEngine {
  constructor(
    private readonly matches: MatchStore,
    private readonly detector: EarBlinkDetector,
    private readonly cdpReferee: CdpRefereeService
  ) {}

  async ingestLandmarkSample(matchId: string, sample: LandmarkSample) {
    const match = this.matches.get(matchId);
    if (!match || match.status !== "live") {
      return null;
    }

    const hit = this.detector.ingest(matchId, sample);
    if (!hit || match.result) {
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
    const match = this.matches.get(matchId);
    if (!match || !match.challengerUserId || !match.challengerWallet) {
      throw new Error("Match is not ready for resolution");
    }

    const resolved = this.matches.markResolved(matchId, input.loserUserId, input.confidence, input.detectedAt);
    const winnerWallet =
      input.loserUserId === match.creatorUserId ? match.challengerWallet : match.creatorWallet;

    const txHash = await this.cdpReferee.resolveMatch(
      BigInt(match.matchId),
      winnerWallet as `0x${string}`,
      resolved.result!.resultHash as `0x${string}`
    );

    return txHash ? this.matches.markResolved(matchId, input.loserUserId, input.confidence, input.detectedAt, txHash) : resolved;
  }
}

