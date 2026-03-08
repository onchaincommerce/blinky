import type {
  CreateMatchRequest,
  FundingConfirmationRequest,
  JoinMatchRequest,
  MatchPresenceRequest,
  MatchRecord,
  MatchStreamEvent,
  StartMatchRequest
} from "@blink/shared";
import { MatchRecordSchema, MatchStreamEventSchema } from "@blink/shared";

import { env } from "./env";

type RoomToken = {
  roomName: string;
  wsUrl: string;
  token: string;
} | null;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type WalletBalancesResponse = {
  address: string;
  balances: Array<{
    symbol: string;
    name: string;
    contractAddress: string;
    amountAtomic: string;
    decimals: number;
    formatted: string;
  }>;
  summary: {
    usdc: string;
    eth: string;
    readyForTestMatch: boolean;
  };
};

const json = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed: ${response.status}`, response.status);
  }

  return response.json() as Promise<T>;
};

export const createMatch = async (payload: CreateMatchRequest) => {
  const data = await json<{ match: MatchRecord }>("/matches", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return MatchRecordSchema.parse(data.match);
};

export const getMatch = async (matchId: string, userId?: string) => {
  const search = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const data = await json<{ match: MatchRecord; roomToken: RoomToken }>(`/matches/${matchId}${search}`);
  return {
    match: MatchRecordSchema.parse(data.match),
    roomToken: data.roomToken
  };
};

export const joinMatch = async (matchId: string, payload: JoinMatchRequest) => {
  const data = await json<{ match: MatchRecord }>(`/matches/${matchId}/join`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return MatchRecordSchema.parse(data.match);
};

export const confirmCreateFunding = async (matchId: string, payload: FundingConfirmationRequest) => {
  const data = await json<{ match: MatchRecord }>(`/matches/${matchId}/funding/create`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return MatchRecordSchema.parse(data.match);
};

export const confirmJoinFunding = async (matchId: string, payload: FundingConfirmationRequest) => {
  const data = await json<{ match: MatchRecord }>(`/matches/${matchId}/funding/join`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return MatchRecordSchema.parse(data.match);
};

export const startMatch = async (matchId: string, payload: StartMatchRequest) =>
  json<{ match: MatchRecord; ready: boolean; message?: string; roomToken: RoomToken }>(`/matches/${matchId}/ready`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

export const setMatchPresence = async (matchId: string, payload: MatchPresenceRequest) =>
  json<{ match: MatchRecord; roomToken: RoomToken }>(`/matches/${matchId}/presence`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

export const subscribeToMatch = (
  matchId: string,
  userId: string,
  handlers: {
    onEvent: (event: MatchStreamEvent) => void;
    onOpen?: () => void;
    onError?: () => void;
  }
) => {
  const source = new EventSource(`${env.apiBaseUrl}/matches/${encodeURIComponent(matchId)}/stream?userId=${encodeURIComponent(userId)}`);
  const eventTypes: MatchStreamEvent["type"][] = [
    "match.snapshot",
    "match.participant_joined",
    "match.ready_changed",
    "match.countdown_started",
    "match.live",
    "match.result_detected",
    "match.resolved"
  ];

  source.onopen = () => {
    handlers.onOpen?.();
  };

  source.onerror = () => {
    handlers.onError?.();
  };

  for (const eventType of eventTypes) {
    source.addEventListener(eventType, (event) => {
      try {
        const parsed = MatchStreamEventSchema.parse(JSON.parse((event as MessageEvent<string>).data));
        handlers.onEvent(parsed);
      } catch {
        handlers.onError?.();
      }
    });
  }

  return () => {
    source.close();
  };
};

export const getWalletBalances = async (address: string) =>
  json<WalletBalancesResponse>(`/wallets/${address}/balances`);

export const listMatches = async (userId?: string) => {
  const search = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const data = await json<{ matches: MatchRecord[] }>(`/matches${search}`);
  return data.matches.map((match) => MatchRecordSchema.parse(match));
};
