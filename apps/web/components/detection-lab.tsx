"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";

import { env } from "../lib/env";
import { createBlinkAnalyzer, estimateFacePose, type BlinkMetrics, type PoseEstimate } from "../lib/blink";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const FACE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const defaultMetrics: BlinkMetrics = {
  calibrated: false,
  blockedReason: null,
  leftEAR: 0,
  rightEAR: 0,
  averageEAR: 0,
  baselineEAR: null,
  thresholdEAR: null,
  blinkDetected: false,
  blinkCount: 0
};

const formatMetric = (value: number | null, digits = 3) =>
  value === null ? "Calibrating" : value.toFixed(digits);

export function DetectionLab({
  initialMatchId = "",
  initialUserId = ""
}: {
  initialMatchId?: string;
  initialUserId?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const analyzerRef = useRef(createBlinkAnalyzer());
  const lastPostedAtRef = useRef(0);
  const streamEnabledRef = useRef(Boolean(initialMatchId && initialUserId));
  const matchIdRef = useRef(initialMatchId);
  const userIdRef = useRef(initialUserId);

  const [metrics, setMetrics] = useState<BlinkMetrics>(defaultMetrics);
  const [pose, setPose] = useState<PoseEstimate>({ yaw: 0, pitch: 0 });
  const [modelStatus, setModelStatus] = useState<"loading" | "ready" | "error">("loading");
  const [cameraStatus, setCameraStatus] = useState<"starting" | "live" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const [matchId, setMatchId] = useState(initialMatchId);
  const [userId, setUserId] = useState(initialUserId);
  const [streamToReferee, setStreamToReferee] = useState(Boolean(initialMatchId && initialUserId));
  const [events, setEvents] = useState<string[]>([]);
  const [backendStatus, setBackendStatus] = useState<string>("Idle");

  const canStream = Boolean(matchId && userId);

  const streamLabel = useMemo(() => {
    if (!streamToReferee) return "Local only";
    if (!canStream) return "Needs matchId + userId";
    return backendStatus;
  }, [backendStatus, canStream, streamToReferee]);

  useEffect(() => {
    streamEnabledRef.current = streamToReferee;
    matchIdRef.current = matchId;
    userIdRef.current = userId;
  }, [matchId, streamToReferee, userId]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        setError(null);
        setModelStatus("loading");
        setCameraStatus("starting");

        const [{ FilesetResolver, FaceLandmarker }, mediaStream] = await Promise.all([
          import("@mediapipe/tasks-vision"),
          navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "user",
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          })
        ]);

        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = mediaStream;
        const video = videoRef.current;
        if (!video) {
          throw new Error("Video element is missing");
        }

        video.srcObject = mediaStream;
        await video.play();

        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: FACE_LANDMARKER_MODEL_URL
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false
        });

        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        landmarkerRef.current = landmarker;
        setModelStatus("ready");
        setCameraStatus("live");

        const loop = async () => {
          const currentVideo = videoRef.current;
          const currentLandmarker = landmarkerRef.current;

          if (!currentVideo || !currentLandmarker) {
            frameRef.current = window.requestAnimationFrame(loop);
            return;
          }

          if (currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const now = performance.now();
            const result = currentLandmarker.detectForVideo(currentVideo, now);
            const landmarks = result.faceLandmarks?.[0];

            if (landmarks) {
              const nextMetrics = analyzerRef.current(landmarks);
              const nextPose = estimateFacePose(landmarks);
              setMetrics(nextMetrics);
              setPose(nextPose);

              if (nextMetrics.blinkDetected) {
                const stamp = new Date().toLocaleTimeString();
                setEvents((current) => [`Blink detected at ${stamp}`, ...current].slice(0, 8));
              }

              if (
                streamEnabledRef.current &&
                matchIdRef.current &&
                userIdRef.current &&
                Date.now() - lastPostedAtRef.current > 250
              ) {
                lastPostedAtRef.current = Date.now();
                void fetch(`${env.apiBaseUrl}/internal/matches/${encodeURIComponent(matchIdRef.current)}/landmarks`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    userId: userIdRef.current,
                    detectedAt: new Date().toISOString(),
                    leftEAR: nextMetrics.leftEAR,
                    rightEAR: nextMetrics.rightEAR,
                    yaw: nextPose.yaw,
                    pitch: nextPose.pitch,
                    faceConfidence: 0.99
                  })
                })
                  .then(async (response) => {
                    if (!response.ok) {
                      const body = await response.json().catch(() => ({}));
                      throw new Error(body.error ?? `HTTP ${response.status}`);
                    }
                    setBackendStatus("Streaming");
                  })
                  .catch((streamError) => {
                    setBackendStatus(streamError instanceof Error ? streamError.message : "Stream error");
                  });
              }
            }
          }

          frameRef.current = window.requestAnimationFrame(loop);
        };

        frameRef.current = window.requestAnimationFrame(loop);
      } catch (nextError) {
        if (cancelled) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : "Failed to initialize detection");
        setModelStatus("error");
        setCameraStatus("error");
      }
    };

    void boot();

    return () => {
      cancelled = true;
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      landmarkerRef.current = null;
    };
  }, []);

  return (
    <main className="shell detection-shell">
      <section className="panel detection-hero">
        <div>
          <div className="eyebrow">Detection Lab</div>
          <h1 className="match-title">Blink detection before referee automation</h1>
          <p className="note">
            This page runs MediaPipe Face Landmarker locally in the browser, computes eye aspect ratio, and can optionally
            stream samples into the referee backend for a live match.
          </p>
        </div>
        <div className="actions">
          <Link className="secondary" href="/">
            Back home
          </Link>
        </div>
      </section>

      <section className="grid detection-grid">
        <div className="panel detection-stage">
          <div className="stage-head">
            <div>
              <div className="eyebrow">Camera</div>
              <h3>Live preview</h3>
            </div>
            <div className="stack">
              <span className={cameraStatus === "live" ? "status" : "status warn"}>Camera: {cameraStatus}</span>
              <span className={modelStatus === "ready" ? "status" : "status warn"}>Model: {modelStatus}</span>
            </div>
          </div>
          <div className="detection-video-frame">
            <video ref={videoRef} autoPlay className="detection-video" muted playsInline />
            <div className={`detection-flash ${metrics.blinkDetected ? "active" : ""}`}>BLINK</div>
          </div>
          {error && <p className="status danger">{error}</p>}
        </div>

        <div className="grid">
          <div className="panel detection-panel">
            <div className="eyebrow">Metrics</div>
            <h3>EAR and calibration</h3>
            <div className="card-grid">
              <div className="data-card">
                <span className="data-label">Left EAR</span>
                <strong>{metrics.leftEAR.toFixed(3)}</strong>
              </div>
              <div className="data-card">
                <span className="data-label">Right EAR</span>
                <strong>{metrics.rightEAR.toFixed(3)}</strong>
              </div>
              <div className="data-card">
                <span className="data-label">Average EAR</span>
                <strong>{metrics.averageEAR.toFixed(3)}</strong>
              </div>
              <div className="data-card">
                <span className="data-label">Baseline</span>
                <strong>{formatMetric(metrics.baselineEAR)}</strong>
              </div>
              <div className="data-card">
                <span className="data-label">Threshold</span>
                <strong>{formatMetric(metrics.thresholdEAR)}</strong>
              </div>
              <div className="data-card">
                <span className="data-label">Blink count</span>
                <strong>{metrics.blinkCount}</strong>
              </div>
            </div>
            <div className="mini-rail" style={{ marginTop: 16 }}>
              <div className="mini-stat">
                <span className="mini-label">Calibrated</span>
                <strong>{metrics.calibrated ? "Yes" : metrics.blockedReason ? "Blocked" : "Learning baseline"}</strong>
              </div>
              <div className="mini-stat">
                <span className="mini-label">Yaw</span>
                <strong>{pose.yaw.toFixed(1)} deg</strong>
              </div>
              <div className="mini-stat">
                <span className="mini-label">Pitch</span>
                <strong>{pose.pitch.toFixed(1)} deg</strong>
              </div>
            </div>
            {metrics.blockedReason && <p className="status warn" style={{ marginTop: 16 }}>{metrics.blockedReason}</p>}
          </div>

          <div className="panel detection-panel">
            <div className="eyebrow">Backend stream</div>
            <h3>Optional referee feed</h3>
            <p className="note">
              Add a live `matchId` and your `userId` to stream landmark samples into the backend while a duel is running.
            </p>
            <div className="grid">
              <label className="field">
                <span>Match ID</span>
                <input onChange={(event) => setMatchId(event.target.value)} placeholder="Live match id" value={matchId} />
              </label>
              <label className="field">
                <span>User ID</span>
                <input onChange={(event) => setUserId(event.target.value)} placeholder="CDP user id" value={userId} />
              </label>
            </div>
            <div className="actions" style={{ marginTop: 16 }}>
              <button className="cta" onClick={() => setStreamToReferee((current) => !current)} disabled={!canStream}>
                {streamToReferee ? "Stop backend stream" : "Start backend stream"}
              </button>
            </div>
            <p className={streamToReferee ? "status" : "status warn"} style={{ marginTop: 16 }}>
              {streamLabel}
            </p>
          </div>

          <div className="panel detection-panel">
            <div className="eyebrow">Events</div>
            <h3>Recent blink events</h3>
            {events.length === 0 ? (
              <p className="note">No blink detected yet. Hold still for calibration, then blink normally.</p>
            ) : (
              <div className="history-list">
                {events.map((event) => (
                  <div className="history-card" key={event}>
                    <strong>{event}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
