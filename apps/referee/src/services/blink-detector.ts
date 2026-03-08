import type { LandmarkSample } from "@blink/shared";

type PlayerState = {
  samples: number[];
  baselineEar?: number;
  thresholdEar?: number;
  closedFrames: number;
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

const CALIBRATION_SAMPLES = 45;
const CONSECUTIVE_BLINK_FRAMES = 3;
const MIN_FACE_CONFIDENCE = 0.8;
const MAX_HEAD_POSE_DEGREES = 18;
const BLINK_COOLDOWN_MS = 700;
const FACE_LOSS_FRAMES = 8;
const LOOK_AWAY_FRAMES = 6;
const MIN_VALID_BASELINE_EAR = 0.16;
const MAX_VALID_BASELINE_EAR = 0.5;

export class EarBlinkDetector {
  private readonly state = new Map<string, MatchState>();

  ingest(matchId: string, sample: LandmarkSample): DetectionHit | null {
    const matchState = this.state.get(matchId) ?? { players: new Map<string, PlayerState>() };
    this.state.set(matchId, matchState);

    const player = matchState.players.get(sample.userId) ?? {
      samples: [],
      closedFrames: 0,
      missingFaceFrames: 0,
      invalidPoseFrames: 0
    };
    matchState.players.set(sample.userId, player);

    if (sample.faceConfidence < MIN_FACE_CONFIDENCE) {
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
    if (!player.baselineEar) {
      player.samples.push(currentEar);
      if (player.samples.length >= CALIBRATION_SAMPLES) {
        const sorted = [...player.samples].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] ?? currentEar;
        if (median < MIN_VALID_BASELINE_EAR || median > MAX_VALID_BASELINE_EAR) {
          return null;
        }
        player.baselineEar = median;
        player.thresholdEar = Math.max(0.14, median * 0.72);
      }
      return null;
    }

    const detectedAtMs = new Date(sample.detectedAt).getTime();
    if (player.lastBlinkAt && detectedAtMs - player.lastBlinkAt < BLINK_COOLDOWN_MS) {
      return null;
    }

    if (currentEar <= (player.thresholdEar ?? 0.14)) {
      player.closedFrames += 1;
    } else {
      player.closedFrames = 0;
    }

    if (player.closedFrames < CONSECUTIVE_BLINK_FRAMES) {
      return null;
    }

    player.closedFrames = 0;
    player.lastBlinkAt = detectedAtMs;

    const confidence = Math.max(0, Math.min(1, 1 - currentEar / (player.baselineEar || currentEar)));

    return {
      userId: sample.userId,
      detectedAt: sample.detectedAt,
      confidence
    };
  }
}
