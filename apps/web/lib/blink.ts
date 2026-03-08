const LEFT_EYE = [33, 160, 158, 133, 153, 144] as const;
const RIGHT_EYE = [362, 385, 387, 263, 373, 380] as const;
const CALIBRATION_SAMPLES = 45;
const CONSECUTIVE_BLINK_FRAMES = 3;
const BLINK_COOLDOWN_MS = 700;
const MIN_VALID_BASELINE_EAR = 0.16;
const MAX_VALID_BASELINE_EAR = 0.5;

type Point = {
  x: number;
  y: number;
};

export type BlinkMetrics = {
  calibrated: boolean;
  blockedReason: string | null;
  leftEAR: number;
  rightEAR: number;
  averageEAR: number;
  baselineEAR: number | null;
  thresholdEAR: number | null;
  blinkDetected: boolean;
  blinkCount: number;
};

export type PoseEstimate = {
  yaw: number;
  pitch: number;
};

const distance = (left: Point, right: Point) => Math.hypot(left.x - right.x, left.y - right.y);

const eyeAspectRatio = (landmarks: Point[], indices: readonly number[]) => {
  const [p1, p2, p3, p4, p5, p6] = indices.map((index) => landmarks[index] ?? { x: 0, y: 0 });
  const horizontal = distance(p1, p4);
  if (horizontal === 0) {
    return 0;
  }

  return (distance(p2, p6) + distance(p3, p5)) / (2 * horizontal);
};

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

export const createBlinkAnalyzer = () => {
  const calibration: number[] = [];
  let baselineEAR: number | null = null;
  let thresholdEAR: number | null = null;
  let closedFrames = 0;
  let blinkCount = 0;
  let lastBlinkAt = 0;

  return (landmarks: Point[]): BlinkMetrics => {
    const leftEAR = eyeAspectRatio(landmarks, LEFT_EYE);
    const rightEAR = eyeAspectRatio(landmarks, RIGHT_EYE);
    const averageEAR = (leftEAR + rightEAR) / 2;

    if (baselineEAR === null) {
      calibration.push(averageEAR);
      if (calibration.length >= CALIBRATION_SAMPLES) {
        const nextBaseline = median(calibration);
        if (nextBaseline < MIN_VALID_BASELINE_EAR || nextBaseline > MAX_VALID_BASELINE_EAR) {
          return {
            calibrated: false,
            blockedReason: "Eyes not readable. Remove sunglasses or visors and face the camera.",
            leftEAR,
            rightEAR,
            averageEAR,
            baselineEAR: null,
            thresholdEAR: null,
            blinkDetected: false,
            blinkCount
          };
        }
        baselineEAR = nextBaseline;
        thresholdEAR = Math.max(0.14, baselineEAR * 0.72);
      }
      return {
        calibrated: false,
        blockedReason: null,
        leftEAR,
        rightEAR,
        averageEAR,
        baselineEAR,
        thresholdEAR,
        blinkDetected: false,
        blinkCount
      };
    }

    if (Date.now() - lastBlinkAt < BLINK_COOLDOWN_MS) {
      return {
        calibrated: true,
        blockedReason: null,
        leftEAR,
        rightEAR,
        averageEAR,
        baselineEAR,
        thresholdEAR,
        blinkDetected: false,
        blinkCount
      };
    }

    if (averageEAR <= (thresholdEAR ?? 0.14)) {
      closedFrames += 1;
    } else {
      closedFrames = 0;
    }

    const blinkDetected = closedFrames >= CONSECUTIVE_BLINK_FRAMES;
    if (blinkDetected) {
      blinkCount += 1;
      lastBlinkAt = Date.now();
      closedFrames = 0;
    }

    return {
      calibrated: true,
      blockedReason: null,
      leftEAR,
      rightEAR,
      averageEAR,
      baselineEAR,
      thresholdEAR,
      blinkDetected,
      blinkCount
    };
  };
};

export const estimateFacePose = (landmarks: Point[]): PoseEstimate => {
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const nose = landmarks[1];
  const forehead = landmarks[10];
  const chin = landmarks[152];

  if (!leftEye || !rightEye || !nose || !forehead || !chin) {
    return { yaw: 0, pitch: 0 };
  }

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeSpan = Math.abs(rightEye.x - leftEye.x) || 1;
  const verticalMidY = (forehead.y + chin.y) / 2;
  const verticalSpan = Math.abs(chin.y - forehead.y) || 1;

  return {
    yaw: ((nose.x - eyeMidX) / eyeSpan) * 120,
    pitch: ((nose.y - verticalMidY) / verticalSpan) * 180
  };
};
