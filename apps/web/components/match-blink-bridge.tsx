"use client";

import { useEffect, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { MatchStatus } from "@blink/shared";

import { env } from "../lib/env";
import { createBlinkAnalyzer, estimateFacePose } from "../lib/blink";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const FACE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export function MatchBlinkBridge({
  matchId,
  userId,
  matchStatus,
  onDetectorStateChange,
  onCameraStateChange
}: {
  matchId: string;
  userId: string;
  matchStatus: MatchStatus;
  onDetectorStateChange?: (state: { calibrated: boolean; blockedReason: string | null }) => void;
  onCameraStateChange?: (state: { detectorReady: boolean; cameraEnabled: boolean }) => void;
}) {
  const { cameraTrack, isCameraEnabled } = useLocalParticipant();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const analyzerRef = useRef(createBlinkAnalyzer());
  const frameRef = useRef<number | null>(null);
  const postThrottleRef = useRef(0);

  const [detectorReady, setDetectorReady] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [baseline, setBaseline] = useState<number | null>(null);
  const [streamStatus, setStreamStatus] = useState("Idle");
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  useEffect(() => {
    onCameraStateChange?.({
      detectorReady,
      cameraEnabled: isCameraEnabled
    });
  }, [detectorReady, isCameraEnabled, onCameraStateChange]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL_URL },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false
        });

        if (cancelled) {
          return;
        }

        landmarkerRef.current = landmarker;
        setDetectorReady(true);
      } catch (error) {
        if (!cancelled) {
          setStreamStatus(error instanceof Error ? error.message : "Detector init failed");
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
      landmarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mediaTrack = (cameraTrack?.track as { mediaStreamTrack?: MediaStreamTrack } | undefined)?.mediaStreamTrack;
    const video = videoRef.current;

    if (!video || !mediaTrack) {
      return;
    }

    const stream = new MediaStream([mediaTrack]);
    video.srcObject = stream;
    void video.play().catch(() => {
      setStreamStatus("Preview attach failed");
    });

    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [cameraTrack]);

  useEffect(() => {
    const loop = () => {
      const currentVideo = videoRef.current;
      const currentLandmarker = landmarkerRef.current;

      if (currentVideo && currentLandmarker && currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const result = currentLandmarker.detectForVideo(currentVideo, performance.now());
        const landmarks = result.faceLandmarks?.[0];

        if (landmarks) {
          const metrics = analyzerRef.current(landmarks);
          setBlinkCount(metrics.blinkCount);
          setBaseline(metrics.baselineEAR);
          setBlockedReason(metrics.blockedReason);
          onDetectorStateChange?.({
            calibrated: metrics.calibrated,
            blockedReason: metrics.blockedReason
          });

          if (matchStatus === "live" && Date.now() - postThrottleRef.current > 250) {
            postThrottleRef.current = Date.now();
            const pose = estimateFacePose(landmarks);

            void fetch(`${env.apiBaseUrl}/internal/matches/${encodeURIComponent(matchId)}/landmarks`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId,
                detectedAt: new Date().toISOString(),
                leftEAR: metrics.leftEAR,
                rightEAR: metrics.rightEAR,
                yaw: pose.yaw,
                pitch: pose.pitch,
                faceConfidence: 0.99
              })
            })
              .then(async (response) => {
                if (!response.ok) {
                  const body = await response.json().catch(() => ({}));
                  throw new Error(body.error ?? `HTTP ${response.status}`);
                }
                setStreamStatus("Streaming to referee");
              })
              .catch((error) => {
                setStreamStatus(error instanceof Error ? error.message : "Stream failed");
              });
          } else if (matchStatus !== "live") {
            setStreamStatus(
              metrics.blockedReason ? metrics.blockedReason : metrics.calibrated ? "Calibrated locally" : "Calibrating"
            );
          }
        } else {
          onDetectorStateChange?.({
            calibrated: false,
            blockedReason: "Face lost. Keep eyes visible and centered."
          });

          if (matchStatus === "live" && Date.now() - postThrottleRef.current > 250) {
            postThrottleRef.current = Date.now();
            void fetch(`${env.apiBaseUrl}/internal/matches/${encodeURIComponent(matchId)}/landmarks`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId,
                detectedAt: new Date().toISOString(),
                leftEAR: 1,
                rightEAR: 1,
                yaw: 0,
                pitch: 0,
                faceConfidence: 0
              })
            }).catch(() => {
              setStreamStatus("Face lost");
            });
          }
        }
      }

      frameRef.current = window.requestAnimationFrame(loop);
    };

    frameRef.current = window.requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [matchId, matchStatus, onDetectorStateChange, userId]);

  return (
    <div className="detector-chip-rail">
      <span className={detectorReady && isCameraEnabled ? "status" : "status warn"}>
        Detector: {detectorReady && isCameraEnabled ? "armed" : "waiting"}
      </span>
      <span className="pill">Baseline: {baseline === null ? "..." : baseline.toFixed(3)}</span>
      <span className="pill">Blinks: {blinkCount}</span>
      <span className="pill">Feed: {streamStatus}</span>
      {blockedReason ? <span className="status warn">{blockedReason}</span> : null}
      <video ref={videoRef} className="hidden-video" muted playsInline />
    </div>
  );
}
