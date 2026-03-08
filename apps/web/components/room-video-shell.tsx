"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useConnectionState,
  useTracks
} from "@livekit/components-react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import type { MatchStatus } from "@blink/shared";
import { Track } from "livekit-client";

import { MatchBlinkBridge } from "./match-blink-bridge";

type RoomToken = {
  roomName: string;
  wsUrl: string;
  token: string;
} | null;

type ResultView = {
  title: string;
  note: string;
  stakeLabel: string;
  potLabel: string;
  opponentLabel: string;
  confidence?: string;
};

const stageCopy: Record<MatchStatus, { title: string; note: string }> = {
  created: {
    title: "Waiting on first lock",
    note: "The room exists, but the first side of the pot is not funded yet."
  },
  funded_one_side: {
    title: "Waiting on challenger",
    note: "One side is locked. The challenger still needs to match it."
  },
  ready: {
    title: "Get camera live",
    note: "Join the room, stay centered, and tap Ready when the detector clears you."
  },
  countdown: {
    title: "Countdown",
    note: "Both players are locked in. Hold still."
  },
  live: {
    title: "Live duel",
    note: "Eyes forward. First blink loses."
  },
  resolved: {
    title: "Duel resolved",
    note: "The room is now a record."
  },
  cancelled: {
    title: "Room cancelled",
    note: "This duel never made it live."
  },
  refunded: {
    title: "Room refunded",
    note: "Escrow went back because the duel never launched."
  }
};

const byLocalFirst = (left: TrackReferenceOrPlaceholder, right: TrackReferenceOrPlaceholder) => {
  if (left.participant.isLocal === right.participant.isLocal) {
    return left.participant.identity.localeCompare(right.participant.identity);
  }

  return left.participant.isLocal ? -1 : 1;
};

function DuelStage({
  matchId,
  userId,
  matchStatus,
  onRoomStateChange
}: {
  matchId: string;
  userId: string;
  matchStatus: MatchStatus;
  onRoomStateChange?: (state: {
    connected: boolean;
    cameraEnabled: boolean;
    detectorReady: boolean;
    blockedReason: string | null;
  }) => void;
}) {
  const connection = useConnectionState();
  const trackRefs = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false
  });
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [detectorReady, setDetectorReady] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  const orderedTracks = useMemo(() => [...trackRefs].sort(byLocalFirst).slice(0, 2), [trackRefs]);
  const connected = connection === "connected";

  useEffect(() => {
    onRoomStateChange?.({
      connected,
      cameraEnabled,
      detectorReady,
      blockedReason
    });
  }, [blockedReason, cameraEnabled, connected, detectorReady, onRoomStateChange]);

  return (
    <div className="duel-stage-stack">
      <MatchBlinkBridge
        matchId={matchId}
        matchStatus={matchStatus}
        onCameraStateChange={({ detectorReady: nextDetectorReady, cameraEnabled: nextCameraEnabled }) => {
          setDetectorReady(nextDetectorReady);
          setCameraEnabled(nextCameraEnabled);
        }}
        onDetectorStateChange={({ calibrated, blockedReason: nextBlockedReason }) => {
          setDetectorReady(calibrated);
          setBlockedReason(nextBlockedReason);
        }}
        userId={userId}
      />
      <div className="duel-feed-list">
        {orderedTracks.length === 0 ? (
          <div className="duel-feed empty-feed">
            <div className="duel-feed-copy">
              <span className="duel-feed-label">Camera</span>
              <strong>Allow camera access and wait for the second player to show up.</strong>
            </div>
          </div>
        ) : (
          orderedTracks.map((trackRef) => (
            <div className="duel-feed" key={`${trackRef.participant.identity}-${trackRef.source}`}>
              <div className="duel-feed-meta">
                <span className="duel-feed-label">{trackRef.participant.isLocal ? "You" : "Opponent"}</span>
              </div>
              <ParticipantTile className="duel-tile" disableSpeakingIndicator trackRef={trackRef} />
            </div>
          ))
        )}
      </div>
      {connected ? <RoomAudioRenderer muted /> : null}
    </div>
  );
}

export function RoomVideoShell({
  roomToken,
  matchStatus,
  isParticipant,
  countdownEndsAt,
  matchId,
  userId,
  resultView,
  onRoomStateChange
}: {
  roomToken: RoomToken;
  matchStatus: MatchStatus;
  isParticipant: boolean;
  countdownEndsAt?: string;
  matchId: string;
  userId?: string;
  resultView?: ResultView | null;
  onRoomStateChange?: (state: {
    connected: boolean;
    cameraEnabled: boolean;
    detectorReady: boolean;
    blockedReason: string | null;
  }) => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const connectNow = Boolean(
    roomToken &&
      isParticipant &&
      (matchStatus === "ready" || matchStatus === "countdown" || matchStatus === "live")
  );

  useEffect(() => {
    if (!countdownEndsAt || matchStatus !== "countdown") {
      setSecondsLeft(null);
      return;
    }

    const tick = () => {
      const delta = Math.max(0, Math.ceil((new Date(countdownEndsAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(delta);
    };

    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [countdownEndsAt, matchStatus]);

  if (!roomToken) {
    return (
      <div className="panel stage">
        <div className="eyebrow">Live Room</div>
        <h3>{stageCopy[matchStatus].title}</h3>
        <p className="note">{stageCopy[matchStatus].note}</p>
      </div>
    );
  }

  return (
    <div className="panel stage duel-stage">
      <div className="stage-head">
        <div>
          <div className="eyebrow">Live Room</div>
          <h3>{stageCopy[matchStatus].title}</h3>
          <p className="note">{stageCopy[matchStatus].note}</p>
        </div>
      </div>

      <div className="room-canvas">
        <LiveKitRoom
          token={roomToken.token}
          serverUrl={roomToken.wsUrl}
          connect={connectNow}
          video={connectNow}
          audio={false}
          style={{ height: "100%", minHeight: 560 }}
        >
          {userId ? (
            <DuelStage
              matchId={matchId}
              matchStatus={matchStatus}
              onRoomStateChange={onRoomStateChange}
              userId={userId}
            />
          ) : null}
        </LiveKitRoom>

        {matchStatus === "countdown" && secondsLeft !== null ? (
          <div className="stage-overlay countdown-overlay">
            <div className="overlay-kicker">Duel starts in</div>
            <div className="overlay-number">{secondsLeft}</div>
            <p>Hold still. Eyes forward.</p>
          </div>
        ) : null}

        {resultView ? (
          <div className="stage-overlay result-overlay">
            <div className="overlay-kicker">Result</div>
            <h2>{resultView.title}</h2>
            <p>{resultView.note}</p>
            <div className="overlay-grid">
              <div>
                <span>Stake</span>
                <strong>{resultView.stakeLabel}</strong>
              </div>
              <div>
                <span>Pot</span>
                <strong>{resultView.potLabel}</strong>
              </div>
              <div>
                <span>Opponent</span>
                <strong>{resultView.opponentLabel}</strong>
              </div>
              {resultView.confidence ? (
                <div>
                  <span>Confidence</span>
                  <strong>{resultView.confidence}</strong>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
