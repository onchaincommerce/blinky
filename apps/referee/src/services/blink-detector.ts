import type { LandmarkSample } from "@blink/shared";

type PlayerState = {
  samples: number[];
  baselineEar?: number;
  thresholdEar?: number;
  closedStartedAt?: number;
  lowestClosedEar?: number;
  lastBlinkAt?: number;
  missingFaceFrames: number;
  invalidPoseFrames: number;
};

type MatchState = {
  players: Map<string, PlayerState>;
};

export type DetectionHit = {
  userId: string;
  detectedAt: string;
  confidence: number;
};

type IngestOptions = {
  allowDetections?: boolean;
};

const CALIBRATION_SAMPLES = 12;
const MIN_FACE_CONFIDENCE = 0.8;
const MAX_HEAD_POSE_DEGREES = 18;
const BLINK_COOLDOWN_MS = 700;
const MIN_BLINK_DURATION_MS = 100;
const MIN_BLINK_DROP_RATIO = 0.18;
const FACE_LOSS_FRAMES = 8;
const LOOK_AWAY_FRAMES = 6;
const MIN_VALID_BASELINE_EAR = 0.16;
const MAX_VALID_BASELINE_EAR = 0.5;

export class EarBlinkDetector {
  private readonly state = new Map<string, MatchState>();

  ingest(matchId: string, sample: LandmarkSample, options?: IngestOptions): DetectionHit | null {
    const allowDetections = options?.allowDetections ?? true;
    const matchState = this.state.get(matchId) ?? { players: new Map<string, PlayerState>() };
    this.state.set(matchId, matchState);

    const player = matchState.players.get(sample.userId) ?? {
      samples: [],
      missingFaceFrames: 0,
      invalidPoseFrames: 0
    };
    matchState.players.set(sample.userId, player);

    const detectedAtMs = Date.parse(sample.detectedAt);
    if (Number.isNaN(detectedAtMs)) {
      return null;
    }

    if (sample.faceConfidence < MIN_FACE_CONFIDENCE) {
      this.resetClosedState(player);

      if (!allowDetections) {
        player.missingFaceFrames = 0;
        player.invalidPoseFrames = 0;
        return null;
      }

      player.missingFaceFrames += 1;
      player.invalidPoseFrames = 0;

      if (player.missingFaceFrames >= FACE_LOSS_FRAMES) {
        return {
          userId: sample.userId,
          detectedAt: sample.detectedAt,
          confidence: 0.99
        };
      }

      return null;
    }

    player.missingFaceFrames = 0;

    if (Math.abs(sample.yaw) > MAX_HEAD_POSE_DEGREES || Math.abs(sample.pitch) > MAX_HEAD_POSE_DEGREES) {
      this.resetClosedState(player);

      if (!allowDetections) {
        player.invalidPoseFrames = 0;
        return null;
      }

      player.invalidPoseFrames += 1;

      if (player.invalidPoseFrames >= LOOK_AWAY_FRAMES) {
        return {
          userId: sample.userId,
          detectedAt: sample.detectedAt,
          confidence: 0.98
        };
      }

      return null;
    }

    player.invalidPoseFrames = 0;

    const currentEar = (sample.leftEAR + sample.rightEAR) / 2;
    if (player.baselineEar === undefined) {
      player.samples.push(currentEar);
      if (player.samples.length >= CALIBRATION_SAMPLES) {
        const sorted = [...player.samples].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] ?? currentEar;
        if (median < MIN_VALID_BASELINE_EAR || median > MAX_VALID_BASELINE_EAR) {
          return null;
        }
        player.baselineEar = median;
        player.thresholdEar = Math.max(0.14, median * 0.72);
        player.samples = [];
      }
      return null;
    }

    if (player.lastBlinkAt && detectedAtMs - player.lastBlinkAt < BLINK_COOLDOWN_MS) {
      this.resetClosedState(player);
      return null;
    }

    if (!allowDetections) {
      this.resetClosedState(player);
      return null;
    }

    const thresholdEar = player.thresholdEar ?? 0.14;
    const isClosed = currentEar <= thresholdEar;

    if (isClosed) {
      player.closedStartedAt ??= detectedAtMs;
      player.lowestClosedEar =
        player.lowestClosedEar === undefined ? currentEar : Math.min(player.lowestClosedEar, currentEar);

      if (detectedAtMs - player.closedStartedAt < MIN_BLINK_DURATION_MS) {
        return null;
      }

      return this.completeBlink(player, sample, detectedAtMs);
    }

    if (player.closedStartedAt === undefined) {
      return null;
    }

    const closedDurationMs = detectedAtMs - player.closedStartedAt;
    if (closedDurationMs < MIN_BLINK_DURATION_MS) {
      this.resetClosedState(player);
      return null;
    }

    return this.completeBlink(player, sample, detectedAtMs);
  }

  private completeBlink(
    player: PlayerState,
    sample: LandmarkSample,
    detectedAtMs: number
  ): DetectionHit | null {
    const baselineEar = player.baselineEar;
    const lowestClosedEar = player.lowestClosedEar;

    this.resetClosedState(player);

    if (baselineEar === undefined || lowestClosedEar === undefined) {
      return null;
    }

    const confidence = Math.max(0, Math.min(1, 1 - lowestClosedEar / baselineEar));
    if (confidence < MIN_BLINK_DROP_RATIO) {
      return null;
    }

    player.lastBlinkAt = detectedAtMs;
    return {
      userId: sample.userId,
      detectedAt: sample.detectedAt,
      confidence
    };
  }

  private resetClosedState(player: PlayerState) {
    player.closedStartedAt = undefined;
    player.lowestClosedEar = undefined;
  }
}
