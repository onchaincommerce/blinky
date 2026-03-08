import assert from "node:assert/strict";
import test from "node:test";

import type { LandmarkSample } from "@blink/shared";

import { EarBlinkDetector } from "./blink-detector.js";

const sampleAt = (
  userId: string,
  detectedAtMs: number,
  overrides: Partial<LandmarkSample> = {}
): LandmarkSample => ({
  userId,
  detectedAt: new Date(detectedAtMs).toISOString(),
  leftEAR: 0.29,
  rightEAR: 0.28,
  yaw: 0,
  pitch: 0,
  faceConfidence: 0.99,
  ...overrides
});

test("warms calibration during countdown and catches a normal blink once live", () => {
  const detector = new EarBlinkDetector();
  const matchId = "match-1";
  const userId = "user-1";
  let detectedAtMs = Date.parse("2026-03-08T18:00:00.000Z");

  for (let index = 0; index < 12; index += 1) {
    const hit = detector.ingest(matchId, sampleAt(userId, detectedAtMs), {
      allowDetections: false
    });
    assert.equal(hit, null);
    detectedAtMs += 100;
  }

  const closedSample = detector.ingest(
    matchId,
    sampleAt(userId, detectedAtMs, {
      leftEAR: 0.08,
      rightEAR: 0.09
    }),
    { allowDetections: true }
  );
  assert.equal(closedSample, null);

  detectedAtMs += 250;
  const reopenedHit = detector.ingest(matchId, sampleAt(userId, detectedAtMs), {
    allowDetections: true
  });

  assert.ok(reopenedHit);
  assert.equal(reopenedHit.userId, userId);
  assert.ok(reopenedHit.confidence > 0.6);
});

test("ignores face loss during warmup and only trips it once the duel is live", () => {
  const detector = new EarBlinkDetector();
  const matchId = "match-2";
  const userId = "user-2";
  let detectedAtMs = Date.parse("2026-03-08T18:05:00.000Z");

  for (let index = 0; index < 10; index += 1) {
    const hit = detector.ingest(
      matchId,
      sampleAt(userId, detectedAtMs, {
        faceConfidence: 0
      }),
      {
        allowDetections: false
      }
    );
    assert.equal(hit, null);
    detectedAtMs += 100;
  }

  for (let index = 0; index < 12; index += 1) {
    detector.ingest(matchId, sampleAt(userId, detectedAtMs), {
      allowDetections: false
    });
    detectedAtMs += 100;
  }

  let hit: ReturnType<EarBlinkDetector["ingest"]> = null;
  for (let index = 0; index < 8; index += 1) {
    hit = detector.ingest(
      matchId,
      sampleAt(userId, detectedAtMs, {
        faceConfidence: 0
      }),
      {
        allowDetections: true
      }
    );
    detectedAtMs += 100;
  }

  assert.ok(hit);
  assert.equal(hit.userId, userId);
});
