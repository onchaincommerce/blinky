"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCurrentUser, useEvmAddress, useSendUserOperation } from "@coinbase/cdp-hooks";

import type { MatchRecord } from "@blink/shared";

import {
  ApiError,
  confirmJoinFunding,
  getMatch,
  joinMatch,
  setMatchPresence,
  startMatch,
  subscribeToMatch
} from "../lib/api";
import { encodeApproveCall, encodeJoinMatchCall } from "../lib/contracts";
import { getSmartAccount, getUserEmail } from "../lib/current-user";
import { env } from "../lib/env";
import { formatDuration, formatTimestamp, formatUsdc, formatUsdcDisplay } from "../lib/format";
import { isRecordOnlyMatch, isStaleLiveMatch, matchRecordLabel } from "../lib/match-presenter";
import { extractOperationHash } from "../lib/user-operation";
import { AuthPanel } from "./auth-panel";
import { CopyButton } from "./copy-button";
import { RoomVideoShell } from "./room-video-shell";

type RoomToken = Awaited<ReturnType<typeof getMatch>>["roomToken"];

type RoomState = {
  connected: boolean;
  cameraEnabled: boolean;
  detectorReady: boolean;
  blockedReason: string | null;
};

const defaultRoomState: RoomState = {
  connected: false,
  cameraEnabled: false,
  detectorReady: false,
  blockedReason: null
};

const statusCopy: Record<MatchRecord["status"], string> = {
  created: "Waiting for the first stake.",
  funded_one_side: "Waiting for the challenger to match the stake.",
  ready: "Both stakes are locked. Join the room and ready up.",
  countdown: "Countdown running.",
  live: "Match live.",
  resolved: "Result locked.",
  cancelled: "Match expired before start.",
  refunded: "Stake refunded."
};

const syncLabel = (mode: "stream" | "polling" | "offline") => {
  switch (mode) {
    case "stream":
      return "Live";
    case "polling":
      return "Retrying";
    default:
      return "Offline";
  }
};

export function MatchView({ matchId }: { matchId: string }) {
  const { currentUser } = useCurrentUser();
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation, status, data, error } = useSendUserOperation();

  const [match, setMatch] = useState<MatchRecord | null>(null);
  const [roomToken, setRoomToken] = useState<RoomToken>(null);
  const [busy, setBusy] = useState<"ready" | null>(null);
  const [joinStage, setJoinStage] = useState<"idle" | "preparing" | "signing" | "confirming">("idle");
  const [apiError, setApiError] = useState<string | null>(null);
  const [clientOrigin, setClientOrigin] = useState("");
  const [roomState, setRoomState] = useState<RoomState>(defaultRoomState);
  const [syncMode, setSyncMode] = useState<"stream" | "polling" | "offline">("offline");
  const [showResolvedOverlay, setShowResolvedOverlay] = useState(false);
  const [missingMatch, setMissingMatch] = useState(false);

  const smartAccount = useMemo(() => getSmartAccount(currentUser), [currentUser]);
  const currentEmail = useMemo(() => getUserEmail(currentUser), [currentUser]);
  const userId = currentUser?.userId;
  const presenceRef = useRef<boolean | null>(null);
  const previousStatusRef = useRef<MatchRecord["status"] | null>(null);
  const previousResultHashRef = useRef<string | null>(null);

  useEffect(() => {
    setClientOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!userId) {
      setSyncMode("offline");
      return;
    }

    let mounted = true;
    let fallbackTimer: number | null = null;

    const loadSnapshot = async () => {
      try {
        const response = await getMatch(matchId, userId);
        if (!mounted) return;
        setMatch(response.match);
        setRoomToken(response.roomToken);
        setApiError(null);
        setMissingMatch(false);
      } catch (nextError) {
        if (!mounted) return;
        if (nextError instanceof ApiError && nextError.status === 404) {
          setMissingMatch(true);
          setApiError("This duel does not exist in the live production referee store anymore.");
          return;
        }
        setApiError(nextError instanceof Error ? nextError.message : "Failed to load duel");
      }
    };

    const startFallback = () => {
      setSyncMode("polling");
      if (fallbackTimer) return;
      void loadSnapshot();
      fallbackTimer = window.setInterval(loadSnapshot, 1500);
    };

    void loadSnapshot();

    const unsubscribe = subscribeToMatch(matchId, userId, {
      onOpen: () => {
        setSyncMode("stream");
        if (fallbackTimer) {
          window.clearInterval(fallbackTimer);
          fallbackTimer = null;
        }
      },
      onError: () => {
        startFallback();
      },
      onEvent: ({ match: nextMatch }) => {
        setMatch(nextMatch);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
      if (fallbackTimer) {
        window.clearInterval(fallbackTimer);
      }
    };
  }, [matchId, userId]);

  const isCreator = userId === match?.creatorUserId;
  const isChallenger = userId === match?.challengerUserId;
  const isParticipant = isCreator || isChallenger;
  const recordOnly = match ? isRecordOnlyMatch(match) : false;
  const staleLive = match ? isStaleLiveMatch(match) : false;
  const recordMode = recordOnly && !showResolvedOverlay;

  const yourReady = isCreator ? Boolean(match?.creatorReady) : isChallenger ? Boolean(match?.challengerReady) : false;
  const opponentReady = isCreator
    ? Boolean(match?.challengerReady)
    : isChallenger
      ? Boolean(match?.creatorReady)
      : false;
  const opponentJoined = Boolean(match?.challengerUserId);
  const guestCanClaimSeat = Boolean(!currentUser && match && !match.challengerUserId);
  const currentUserCanClaimSeat = Boolean(currentUser && !isParticipant && match && !match.challengerUserId);
  const showCreatorInvite = Boolean(currentUser && isCreator && !opponentJoined);
  const showCreatorClaimed = Boolean(currentUser && isCreator && opponentJoined);
  const showChallengerPanel = Boolean((currentUser && isChallenger) || guestCanClaimSeat || currentUserCanClaimSeat);

  const stakeLabel = match ? `${formatUsdc(match.stakeAmount)} USDC` : "0.00 USDC";
  const potLabel = match ? `${formatUsdc((BigInt(match.stakeAmount) * 2n).toString())} USDC` : "0.00 USDC";
  const heroTitle = match ? `${potLabel} pot` : "Loading duel";
  const creatorLabel = match?.creatorEmail ?? "Creator";
  const challengerLabel = match?.challengerEmail ?? (match?.challengerUserId ? "Challenger" : "Waiting");
  const opponentLabel = isCreator ? challengerLabel : creatorLabel;

  const invitePath = `/match/${matchId}`;
  const inviteUrl = clientOrigin ? `${clientOrigin}${invitePath}` : invitePath;

  useEffect(() => {
    if (!match) {
      previousStatusRef.current = null;
      return;
    }

    if (match.status === "resolved" && previousStatusRef.current && previousStatusRef.current !== "resolved") {
      setShowResolvedOverlay(true);
      const timer = window.setTimeout(() => setShowResolvedOverlay(false), 8000);
      previousStatusRef.current = match.status;
      return () => window.clearTimeout(timer);
    }

    previousStatusRef.current = match.status;
  }, [match]);

  useEffect(() => {
    if (!match?.result?.resultHash) {
      previousResultHashRef.current = null;
      return;
    }

    if (!previousResultHashRef.current) {
      previousResultHashRef.current = match.result.resultHash;
      return;
    }

    if (previousResultHashRef.current === match.result.resultHash) {
      return;
    }

    previousResultHashRef.current = match.result.resultHash;
    setShowResolvedOverlay(true);
    const timer = window.setTimeout(() => setShowResolvedOverlay(false), 8000);
    return () => window.clearTimeout(timer);
  }, [match?.result?.resultHash]);

  useEffect(() => {
    if (!match || !userId || !isParticipant || recordOnly) {
      presenceRef.current = null;
      return;
    }

    if (presenceRef.current === roomState.connected) {
      return;
    }

    presenceRef.current = roomState.connected;
    void setMatchPresence(match.id, {
      userId,
      connected: roomState.connected
    }).catch(() => {
      // The SSE/polling snapshot will recover room state if this transient update fails.
    });
  }, [isParticipant, match, recordOnly, roomState.connected, userId]);

  useEffect(() => {
    if (!userId || !match || (match.status !== "countdown" && match.status !== "live")) {
      return;
    }

    let mounted = true;
    const timer = window.setInterval(async () => {
      try {
        const response = await getMatch(matchId, userId);
        if (!mounted) return;
        setMatch(response.match);
        setRoomToken(response.roomToken);
        setMissingMatch(false);
      } catch {
        if (!mounted) return;
        setSyncMode((current) => (current === "offline" ? current : "polling"));
      }
    }, 650);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [match, matchId, userId]);

  const canJoin = Boolean(
    match &&
      userId &&
      !isCreator &&
      (!match.challengerUserId || match.challengerUserId === userId) &&
      evmAddress &&
      smartAccount &&
      match.status !== "ready" &&
      match.status !== "countdown" &&
      match.status !== "live" &&
      match.status !== "resolved"
  );

  const canReady = Boolean(
    match &&
      userId &&
      isParticipant &&
      match.status === "ready" &&
      !yourReady &&
      roomState.connected &&
      roomState.cameraEnabled &&
      roomState.detectorReady
  );

  const ctaState = (() => {
    if (recordOnly) return "resolved";
    if (!currentUser) return "sign_in";
    if (!isParticipant && match?.challengerUserId) return "invite_only";
    if (currentUserCanClaimSeat) return "join";
    if (canJoin) return "join";
    if (!opponentJoined) return "wait_for_opponent";
    if (match?.status === "ready" && !roomState.connected) return "join_room";
    if (match?.status === "ready" && roomState.connected && (!roomState.cameraEnabled || !roomState.detectorReady)) return "fix_camera";
    if (canReady) return "ready";
    if (match?.status === "ready") return "wait_ready";
    if (match?.status === "countdown") return "countdown";
    if (match?.status === "live") return "live";
    if (match?.status === "resolved") return "resolved";
    return "funding";
  })();

  const primaryTitle = (() => {
    switch (ctaState) {
      case "sign_in":
        return guestCanClaimSeat ? "Sign in to claim the seat" : "Sign in to join";
      case "invite_only":
        return "This duel is full";
      case "join":
        return `Match ${stakeLabel}`;
      case "wait_for_opponent":
        return isCreator ? "Invite challenger" : "Waiting on room";
      case "join_room":
        return "Connect camera";
      case "fix_camera":
        return "Clear camera check";
      case "ready":
        return "Ready";
      case "wait_ready":
        return "Waiting on opponent";
      case "countdown":
        return "Countdown running";
      case "live":
        return "Match live";
      case "resolved":
        return "Result locked";
      default:
        return "Funding";
    }
  })();

  const primaryNote = (() => {
    if (recordOnly) {
      return match?.result
        ? "This duel is closed and remains here as a record."
        : "This room is record-only and no longer connects to live video.";
    }

    switch (ctaState) {
      case "sign_in":
        return guestCanClaimSeat ? "Sign in to claim this invite." : "Only signed-in players can enter.";
      case "invite_only":
        return "Creator and challenger only.";
      case "join":
        return "Lock the same stake to claim the second seat.";
      case "wait_for_opponent":
        return isCreator
          ? "Share the link. The room moves on when the challenger funds."
          : "The creator still needs to finish funding the room.";
      case "join_room":
        return "Allow camera access in the browser.";
      case "fix_camera":
        return roomState.blockedReason ?? "Keep your face centered until the detector clears.";
      case "ready":
        return "Countdown starts automatically when both players are ready.";
      case "wait_ready":
        return opponentReady ? "Countdown is about to start." : "You are ready. Waiting on the other player.";
      case "countdown":
        return "Hold still.";
      case "live":
        return "Stay locked in.";
      default:
        return match ? statusCopy[match.status] : "Loading duel state...";
    }
  })();

  const resultView = useMemo(() => {
    if (!match?.result || !currentUser) {
      return null;
    }

    const youWon = match.result.winnerUserId === currentUser.userId;
    const payoutSettled = match.status === "resolved" || match.settlementStatus === "settled";
    return {
      title: youWon ? "You won" : "You lost",
      note: payoutSettled
        ? youWon
          ? "Payout has been sent."
          : "The pot has already been released."
        : "Blink detected. Settlement is in progress.",
      stakeLabel,
      potLabel,
      opponentLabel,
      confidence: match.result.confidence.toFixed(2)
    };
  }, [currentUser, match, opponentLabel, potLabel, stakeLabel]);

  const roleLabel = isCreator
    ? "Creator"
    : isChallenger
      ? "Challenger"
      : guestCanClaimSeat || currentUserCanClaimSeat
        ? "Invite"
        : "Viewer";
  const roleDeck = isCreator
    ? "Host seat"
    : isChallenger
      ? "Challenger seat"
      : guestCanClaimSeat || currentUserCanClaimSeat
        ? "Open seat"
        : "Viewer";
  const presenceLabel = roomState.connected
    ? yourReady
      ? "Ready locked"
      : "Camera live"
    : match?.status === "ready"
      ? "Waiting for camera"
      : "Stand by";
  const recordClosedAt = match ? formatTimestamp(match.result?.detectedAt ?? match.updatedAt ?? match.createdAt) : "Unknown";
  const recordDuration = (() => {
    if (!match?.result?.detectedAt) {
      return "Unknown";
    }

    const startAt = match.liveStartedAt ?? match.createdAt;
    const startTime = Date.parse(startAt);
    const endTime = Date.parse(match.result.detectedAt);
    if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
      return "Unknown";
    }

    return formatDuration(endTime - startTime);
  })();
  const recordAmountLabel = (() => {
    if (!match) return "0.00 USDC";
    const stakeDisplay = `${formatUsdcDisplay(match.stakeAmount)} USDC`;
    const potDisplay = `${formatUsdcDisplay((BigInt(match.stakeAmount) * 2n).toString())} USDC`;

    if (!match.result) {
      return potDisplay;
    }

    if (!currentUser) {
      return potDisplay;
    }

    const won = match.result.winnerUserId === currentUser.userId;
    return `${won ? "+" : "-"}${won ? potDisplay : stakeDisplay}`;
  })();
  const recordAmountTone = (() => {
    if (!match?.result || !currentUser) {
      return "neutral";
    }

    return match.result.winnerUserId === currentUser.userId ? "win" : "loss";
  })();
  const joinInFlight = joinStage !== "idle" || status === "pending";
  const joinProgress =
    joinStage === "preparing" ? 22 : joinStage === "signing" ? 66 : joinStage === "confirming" ? 88 : 0;
  const joinLabel =
    joinStage === "preparing"
      ? "Preparing stake"
      : joinStage === "signing"
        ? "Confirm in wallet"
        : joinStage === "confirming"
          ? "Locking stake"
          : `Match ${stakeLabel}`;

  if (missingMatch) {
    return (
      <div className="shell">
        <div className="match-shell">
          <section className="panel">
            <div className="eyebrow">Missing match</div>
            <h1>Duel not found</h1>
            <p className="note">This match ID is not present in the current backend.</p>
            <div className="actions">
              <Link className="cta" href="/">
                Back home
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const handleJoin = async () => {
    if (!match || !currentUser || !evmAddress || !smartAccount) return;
    setJoinStage("preparing");
    setApiError(null);
    try {
      await joinMatch(match.id, {
        challengerUserId: currentUser.userId,
        challengerEmail: currentEmail ?? undefined,
        challengerWallet: evmAddress as `0x${string}`,
        challengerSmartAccount: smartAccount
      });

      const stakeAmount = BigInt(match.stakeAmount);
      setJoinStage("signing");
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: "base-sepolia",
        useCdpPaymaster: true,
        calls: [
          encodeApproveCall(
            env.stakeTokenAddress as `0x${string}`,
            env.escrowAddress as `0x${string}`,
            stakeAmount
          ),
          encodeJoinMatchCall(env.escrowAddress as `0x${string}`, BigInt(match.matchId))
        ]
      });

      const txHash = extractOperationHash(result);
      if (!txHash) {
        throw new Error("Join operation was sent, but no operation hash was returned");
      }

      setJoinStage("confirming");
      await confirmJoinFunding(match.id, { txHash: txHash as `0x${string}` });

      const response = await getMatch(match.id, currentUser.userId);
      setMatch(response.match);
      setRoomToken(response.roomToken);
    } catch (nextError) {
      setJoinStage("idle");
      setApiError(nextError instanceof Error ? nextError.message : "Join failed");
    }
  };

  const handleReady = async () => {
    if (!match || !userId) return;
    setBusy("ready");
    setApiError(null);
    try {
      const response = await startMatch(match.id, { userId });
      setMatch(response.match);
      setRoomToken(response.roomToken);
      if (!response.ready && response.message) {
        setApiError(response.message);
      }
    } catch (nextError) {
      setApiError(nextError instanceof Error ? nextError.message : "Failed to get ready");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="shell">
      <div className="match-shell">
        {recordMode ? (
          <section className="panel archive-panel">
            <div className="archive-head">
              <div>
                <div className="eyebrow">{staleLive ? "Closed" : "Settled"}</div>
                <h1>{resultView?.title ?? matchRecordLabel(match!)}</h1>
                <p className="note">{recordClosedAt}</p>
              </div>
              <div className={`archive-amount ${recordAmountTone}`}>{recordAmountLabel}</div>
            </div>

            <div className="archive-grid">
              <div className="metric metric-identity">
                <span className="muted">Creator</span>
                <strong>{creatorLabel}</strong>
              </div>
              <div className="metric metric-identity">
                <span className="muted">Challenger</span>
                <strong>{challengerLabel}</strong>
              </div>
              <div className="metric">
                <span className="muted">Length</span>
                <strong>{recordDuration}</strong>
              </div>
              <div className="metric">
                <span className="muted">Pot</span>
                <strong>{potLabel}</strong>
              </div>
            </div>

            <div className="actions">
              <Link className="secondary" href="/">
                Back home
              </Link>
            </div>
          </section>
        ) : (
          <>
            <div className="match-banner panel match-hero">
              <div className="banner-copy">
                <div className="eyebrow">Match</div>
                <h1 className="match-title">{heroTitle}</h1>
                <p className="note">{match ? statusCopy[match.status] : "Loading duel state..."}</p>
              </div>
              <div className="banner-meta match-hero-meta">
                {match ? (
                  <div className="banner-stat">
                    <span>Stake</span>
                    <strong>{stakeLabel}</strong>
                  </div>
                ) : null}
                {match ? (
                  <div className="banner-stat">
                    <span>Pot</span>
                    <strong>{potLabel}</strong>
                  </div>
                ) : null}
                {match ? <span className="pill">{matchRecordLabel(match)}</span> : null}
                <span className={`pill ${syncMode === "polling" ? "warn" : ""}`}>{syncLabel(syncMode)}</span>
                <Link className="secondary" href="/">
                  Back home
                </Link>
              </div>
            </div>

            <div className="grid match">
              <div className="grid room-column">
                <RoomVideoShell
                  countdownEndsAt={match?.countdownEndsAt}
                  isParticipant={Boolean(isParticipant)}
                  matchId={matchId}
                  matchStatus={match?.status ?? "created"}
                  onRoomStateChange={setRoomState}
                  resultView={showResolvedOverlay ? resultView : null}
                  roomToken={roomToken}
                  userId={currentUser?.userId}
                />
              </div>

              <div className="grid side-column duel-sidebar">
                {!currentUser ? <AuthPanel /> : null}

                <div className="panel duel-brief">
                  <div className="eyebrow">{roleLabel}</div>
                  <h3>{primaryTitle}</h3>
                  <p className="note">{primaryNote}</p>

                  <div className="room-role-row">
                    <span className="pill">{roleDeck}</span>
                    <span className={roomState.detectorReady ? "status" : "pill"}>{presenceLabel}</span>
                  </div>

                  <div className="compact-metrics">
                    <div className="metric">
                      <span className="muted">Pot</span>
                      <strong>{potLabel}</strong>
                    </div>
                    <div className="metric">
                      <span className="muted">Stake</span>
                      <strong>{stakeLabel}</strong>
                    </div>
                    <div className="metric metric-identity">
                      <span className="muted">{isCreator ? "Challenger" : "Host"}</span>
                      <strong>{opponentLabel}</strong>
                    </div>
                  </div>

                  <div className="duel-status-strip">
                    <span className={opponentJoined ? "status" : "pill"}>{opponentJoined ? "Opponent in" : "Seat open"}</span>
                    <span className={roomState.connected ? "status" : "pill"}>{roomState.connected ? "Camera on" : "Camera off"}</span>
                    <span className={yourReady ? "status" : "pill"}>{yourReady ? "You ready" : "You waiting"}</span>
                    <span className={opponentReady ? "status" : "pill"}>{opponentReady ? "They ready" : "They waiting"}</span>
                  </div>
                </div>

                {showCreatorInvite ? (
                  <div className="panel invite-panel">
                    <div className="eyebrow">Invite</div>
                    <h3>Send this link</h3>
                    <p className="note">One challenger can claim this room.</p>
                    <div className="pre">{inviteUrl}</div>
                    <div className="actions" style={{ marginTop: 16 }}>
                      <CopyButton value={inviteUrl} label="Copy invite" />
                    </div>
                  </div>
                ) : null}

                {showCreatorClaimed ? (
                  <div className="panel invite-panel">
                    <div className="eyebrow">Claimed</div>
                    <h3>{challengerLabel}</h3>
                    <p className="note">Second seat claimed. Next step is camera and Ready.</p>
                  </div>
                ) : null}

                {showChallengerPanel ? (
                  <div className="panel invite-panel">
                    <div className="eyebrow">{isChallenger ? "Joined" : "Seat open"}</div>
                    <h3>{isChallenger ? creatorLabel : "Claim this duel"}</h3>
                    <p className="note">
                      {isChallenger
                        ? "Match the stake, clear camera check, then hit Ready."
                        : "Sign in and match the stake to take this seat."}
                    </p>
                  </div>
                ) : null}

                <div className="panel action-panel">
                  <div className="eyebrow">Actions</div>
                  <h3>{primaryTitle}</h3>
                  <p className="note">{primaryNote}</p>
                  <div className="actions">
                    {canJoin ? (
                      <button
                        className={`cta cta-progress ${joinInFlight ? "is-loading" : ""}`.trim()}
                        disabled={joinInFlight}
                        onClick={handleJoin}
                        type="button"
                      >
                        <span className="cta-progress-fill" style={{ width: `${joinProgress}%` }} />
                        <span className="cta-label">{joinLabel}</span>
                      </button>
                    ) : null}
                    {canReady ? (
                      <button className="cta" onClick={handleReady} disabled={busy === "ready"}>
                        {busy === "ready" ? "Locking ready..." : "Ready"}
                      </button>
                    ) : null}
                    {currentUser ? (
                      <Link
                        className="secondary"
                        href={`/detection?matchId=${encodeURIComponent(matchId)}&userId=${encodeURIComponent(currentUser.userId)}`}
                      >
                        Check camera
                      </Link>
                    ) : null}
                  </div>
                  {apiError ? <p className="status danger">{apiError}</p> : null}
                  {error ? <p className="status danger">{error.message}</p> : null}
                  {data?.transactionHash ? <p className="status">Latest tx: {data.transactionHash}</p> : null}
                  {!data?.transactionHash && data?.userOpHash ? <p className="status">Latest user op: {data.userOpHash}</p> : null}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
