"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentUser } from "@coinbase/cdp-hooks";

import type { MatchRecord } from "@blink/shared";

import { listMatches } from "../lib/api";
import { formatUsdc } from "../lib/format";
import { isRecordOnlyMatch, matchRecordLabel } from "../lib/match-presenter";

const opponentLabel = (match: MatchRecord, currentUserId: string) => {
  const isCreator = match.creatorUserId === currentUserId;
  const email = isCreator ? match.challengerEmail : match.creatorEmail;
  return email ?? (isCreator ? "Waiting on challenger" : "Creator");
};

const formatState = (value: string) => value.replaceAll("_", " ");

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

  const active = matches.filter((match) => !isRecordOnlyMatch(match));
  const archive = matches.filter((match) => isRecordOnlyMatch(match));

  return (
    <section className="panel history-panel">
      <div className="history-heading">
        <div className="eyebrow">History</div>
        <h3>Your rooms</h3>
        <p className="note">Open and settled duels.</p>
      </div>
      {error ? <p className="status danger">{error}</p> : null}
      {matches.length === 0 ? (
        <p className="note">No rooms yet.</p>
      ) : (
        <>
          {active.length > 0 ? (
            <div className="history-block">
              <div className="history-section-head">
                <span className="data-label">Active</span>
                <span className="pill">{active.length}</span>
              </div>
              <div className="history-list">
                {active.map((match) => {
                  const role = match.creatorUserId === currentUser.userId ? "Creator" : "Challenger";

                  return (
                    <article className="history-card active-card" key={match.id}>
                      <div className="history-row">
                        <div>
                          <span className="data-label">{role}</span>
                          <strong>{formatUsdc(match.stakeAmount)} USDC stake</strong>
                          <p className="note">Against {opponentLabel(match, currentUser.userId)}</p>
                        </div>
                        <span className="pill">{formatState(match.status)}</span>
                      </div>
                      <div className="actions">
                        <Link className="cta" href={`/match/${match.id}`}>
                          Open room
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          {archive.length > 0 ? (
            <div className="history-block">
              <div className="history-section-head">
                <span className="data-label">Closed</span>
                <span className="pill">{archive.length}</span>
              </div>
              <div className="history-list">
                {archive.map((match) => {
                  const role = match.creatorUserId === currentUser.userId ? "Creator" : "Challenger";

                  return (
                    <article className="history-card" key={match.id}>
                      <div className="history-row">
                        <div>
                          <span className="data-label">{role}</span>
                          <strong>{formatUsdc(match.stakeAmount)} USDC stake</strong>
                          <p className="note">Against {opponentLabel(match, currentUser.userId)}</p>
                        </div>
                        <span className="pill">{matchRecordLabel(match)}</span>
                      </div>
                      <div className="actions">
                        <Link className="secondary" href={`/match/${match.id}`}>
                          View record
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
