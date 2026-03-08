import type { MatchRecord } from "@blink/shared";

const RECORD_STATUSES = new Set<MatchRecord["status"]>(["resolved", "cancelled", "refunded"]);
const STALE_LIVE_MS = 1000 * 60 * 20;

export const isStaleLiveMatch = (match: MatchRecord) => {
  if (match.status !== "live" || match.result) {
    return false;
  }

  const updatedAt = Date.parse(match.updatedAt);
  if (Number.isNaN(updatedAt)) {
    return false;
  }

  return Date.now() - updatedAt > STALE_LIVE_MS;
};

export const isRecordOnlyMatch = (match: MatchRecord) => RECORD_STATUSES.has(match.status) || isStaleLiveMatch(match);

export const matchRecordTone = (match: MatchRecord) => {
  if (match.result) {
    return "settled";
  }

  if (isStaleLiveMatch(match)) {
    return "legacy";
  }

  if (match.status === "cancelled" || match.status === "refunded") {
    return "closed";
  }

  return "live";
};

export const matchRecordLabel = (match: MatchRecord) => {
  if (match.result) {
    return "Payout closed";
  }

  if (isStaleLiveMatch(match)) {
    return "Legacy room";
  }

  if (match.status === "cancelled") {
    return "Cancelled";
  }

  if (match.status === "refunded") {
    return "Refunded";
  }

  return match.status;
};
