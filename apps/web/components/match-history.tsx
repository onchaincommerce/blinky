"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentUser } from "@coinbase/cdp-hooks";

import type { MatchRecord } from "@blink/shared";

import { listMatches } from "../lib/api";
import { formatDuration, formatTimestamp, formatUsdcDisplay } from "../lib/format";
import { isRecordOnlyMatch, isStaleLiveMatch } from "../lib/match-presenter";

const opponentLabel = (match: MatchRecord, currentUserId: string) => {
  const isCreator = match.creatorUserId === currentUserId;
  const email = isCreator ? match.challengerEmail : match.creatorEmail;
  return email ?? (isCreator ? "Waiting on challenger" : "Creator");
};

const formatState = (value: string) => value.replaceAll("_", " ");
const getActivityAt = (match: MatchRecord) => match.result?.detectedAt ?? match.updatedAt ?? match.createdAt;

const getDurationLabel = (match: MatchRecord) => {
  if (!match.result?.detectedAt) {
    return "In progress";
  }

  const startAt = match.liveStartedAt ?? match.createdAt;
  const startTime = Date.parse(startAt);
  const endTime = Date.parse(match.result.detectedAt);
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
    return "Unknown";
  }

  return formatDuration(endTime - startTime);
};

const getSummary = (match: MatchRecord, currentUserId: string) => {
  const stakeLabel = `${formatUsdcDisplay(match.stakeAmount)} USDC`;
  const potLabel = `${formatUsdcDisplay((BigInt(match.stakeAmount) * 2n).toString())} USDC`;

  if (match.result) {
    const won = match.result.winnerUserId === currentUserId;
    return {
      label: won ? "Won" : "Lost",
      amount: `${won ? "+" : "-"}${won ? potLabel : stakeLabel}`,
      tone: won ? "win" : "loss"
    };
  }

  if (match.status === "refunded") {
    return {
      label: "Refunded",
      amount: `+${stakeLabel}`,
      tone: "refund"
    };
  }

  if (match.status === "cancelled" || isStaleLiveMatch(match)) {
    return {
      label: "Closed",
      amount: potLabel,
      tone: "neutral"
    };
  }

  return {
    label: formatState(match.status),
    amount: potLabel,
    tone: "live"
  };
};

export function MatchHistory() {
  const { currentUser } = useCurrentUser();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      setMatches([]);
      setError(null);
      return;
    }

    let mounted = true;

    const load = async () => {
      try {
        const nextMatches = await listMatches(currentUser.userId);
        if (!mounted) return;
        setMatches(nextMatches);
        setError(null);
      } catch (nextError) {
        if (!mounted) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load matches");
      }
    };

    void load();
    const timer = window.setInterval(load, 4000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [currentUser]);

  if (!currentUser) {
    return null;
  }

  const orderedMatches = [...matches].sort((left, right) => getActivityAt(right).localeCompare(getActivityAt(left)));

  return (
    <section className="panel history-panel">
      <div className="history-heading">
        <div className="eyebrow">History</div>
        <h3>Recent duels</h3>
      </div>
      {error ? <p className="status danger">{error}</p> : null}
      {orderedMatches.length === 0 ? (
        <p className="note">No rooms yet.</p>
      ) : (
        <div className="history-feed">
          {orderedMatches.map((match) => {
            const recordOnly = isRecordOnlyMatch(match);
            const opponent = opponentLabel(match, currentUser.userId);
            const summary = getSummary(match, currentUser.userId);
            const stakeLabel = `${formatUsdcDisplay(match.stakeAmount)} USDC`;
            const potLabel = `${formatUsdcDisplay((BigInt(match.stakeAmount) * 2n).toString())} USDC`;

            return (
              <article className={`history-card ${recordOnly ? "history-card-record" : "active-card"}`.trim()} key={match.id}>
                <div className="history-card-head">
                  <div className="history-copy">
                    <div className="history-inline">
                      <span className="data-label">{formatTimestamp(getActivityAt(match))}</span>
                      <span className={`history-tone ${summary.tone}`}>{summary.label}</span>
                    </div>
                    <strong>{opponent}</strong>
                    <p className="note">{recordOnly ? `${getDurationLabel(match)} duel` : `${formatState(match.status)} room`}</p>
                  </div>
                  <div className={`history-amount ${summary.tone}`}>{summary.amount}</div>
                </div>

                <div className="history-detail-grid">
                  <div>
                    <span className="mini-label">Stake</span>
                    <strong>{stakeLabel}</strong>
                  </div>
                  <div>
                    <span className="mini-label">Pot</span>
                    <strong>{potLabel}</strong>
                  </div>
                  <div>
                    <span className="mini-label">Length</span>
                    <strong>{getDurationLabel(match)}</strong>
                  </div>
                </div>

                {!recordOnly ? (
                  <div className="actions">
                    <Link className="cta" href={`/match/${match.id}`}>
                      Duel
                    </Link>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
