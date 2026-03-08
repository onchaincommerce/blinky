import { keccak256, stringToHex } from "viem";
import { z } from "zod";

export const MATCH_STATUS_VALUES = [
  "created",
  "funded_one_side",
  "ready",
  "countdown",
  "live",
  "resolved",
  "cancelled",
  "refunded"
] as const;

export type MatchStatus = (typeof MATCH_STATUS_VALUES)[number];

export const BlinkResultSchema = z.object({
  loserUserId: z.string().min(1),
  winnerUserId: z.string().min(1),
  detectedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  resultHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/)
});

export type BlinkResult = z.infer<typeof BlinkResultSchema>;

export const MatchRecordSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  roomIdHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  matchId: z.string().min(1),
  inviteCode: z.string().min(1),
  stakeToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  stakeAmount: z.string().min(1),
  creatorUserId: z.string().min(1),
  creatorEmail: z.string().email().optional(),
  creatorWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  creatorSmartAccount: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  challengerUserId: z.string().optional(),
  challengerEmail: z.string().email().optional(),
  challengerWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  challengerSmartAccount: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  status: z.enum(MATCH_STATUS_VALUES),
  result: BlinkResultSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  livekitRoomName: z.string().min(1),
  creatorConnected: z.boolean().default(false),
  challengerConnected: z.boolean().default(false),
  creatorReady: z.boolean().default(false),
  challengerReady: z.boolean().default(false),
  creatorPresence: z.boolean().default(false),
  challengerPresence: z.boolean().default(false),
  settlementStatus: z.enum(["pending", "settled"]).optional(),
  countdownEndsAt: z.string().datetime().optional(),
  createTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  joinTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  startTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  resolveTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional()
});

export type MatchRecord = z.infer<typeof MatchRecordSchema>;

export const CreateMatchRequestSchema = z.object({
  creatorUserId: z.string().min(1),
  creatorEmail: z.string().email().optional(),
  creatorWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  creatorSmartAccount: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  stakeToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  stakeAmount: z.string().min(1)
});

export type CreateMatchRequest = z.infer<typeof CreateMatchRequestSchema>;

export const JoinMatchRequestSchema = z.object({
  challengerUserId: z.string().min(1),
  challengerEmail: z.string().email().optional(),
  challengerWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  challengerSmartAccount: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
});

export type JoinMatchRequest = z.infer<typeof JoinMatchRequestSchema>;

export const StartMatchRequestSchema = z.object({
  userId: z.string().min(1)
});

export type StartMatchRequest = z.infer<typeof StartMatchRequestSchema>;

export const MatchPresenceRequestSchema = z.object({
  userId: z.string().min(1),
  connected: z.boolean()
});

export type MatchPresenceRequest = z.infer<typeof MatchPresenceRequestSchema>;

export const FundingConfirmationRequestSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/)
});

export type FundingConfirmationRequest = z.infer<typeof FundingConfirmationRequestSchema>;

export const MatchResultRequestSchema = z.object({
  loserUserId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  detectedAt: z.string().datetime(),
  source: z.enum(["mediapipe-livekit-worker", "client-detector", "manual"])
});

export type MatchResultRequest = z.infer<typeof MatchResultRequestSchema>;

export const LandmarkSampleSchema = z.object({
  userId: z.string().min(1),
  detectedAt: z.string().datetime(),
  leftEAR: z.number().positive(),
  rightEAR: z.number().positive(),
  yaw: z.number(),
  pitch: z.number(),
  faceConfidence: z.number().min(0).max(1)
});

export type LandmarkSample = z.infer<typeof LandmarkSampleSchema>;

export const MatchStreamEventTypeSchema = z.enum([
  "match.snapshot",
  "match.participant_joined",
  "match.ready_changed",
  "match.countdown_started",
  "match.live",
  "match.result_detected",
  "match.resolved"
]);

export type MatchStreamEventType = z.infer<typeof MatchStreamEventTypeSchema>;

export const MatchStreamEventSchema = z.object({
  type: MatchStreamEventTypeSchema,
  match: MatchRecordSchema
});

export type MatchStreamEvent = z.infer<typeof MatchStreamEventSchema>;

export const MATCH_COUNTDOWN_SECONDS = 5;

export const deriveRoomIds = (roomId: string) => {
  const roomIdHash = keccak256(stringToHex(roomId));
  return {
    roomIdHash,
    matchId: BigInt(roomIdHash).toString()
  };
};

export const blinkResultHash = (input: {
  matchId: string;
  loserUserId: string;
  winnerUserId: string;
  detectedAt: string;
  confidence: number;
}) =>
  keccak256(
    stringToHex(
      JSON.stringify({
        ...input,
        confidence: Number(input.confidence.toFixed(4))
      })
    )
  );

export const BLINK_MATCH_ESCROW_ABI = [
  {
    type: "function",
    name: "createMatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "stakeToken", type: "address" },
      { name: "stakeAmount", type: "uint256" },
      { name: "roomIdHash", type: "bytes32" }
    ],
    outputs: [{ name: "matchId", type: "uint256" }]
  },
  {
    type: "function",
    name: "joinMatch",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "startMatch",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "resolveMatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "winner", type: "address" },
      { name: "resultHash", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "cancelExpiredMatch",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "refundNoShow",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "getMatch",
    stateMutability: "view",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [
      {
        components: [
          { name: "creator", type: "address" },
          { name: "challenger", type: "address" },
          { name: "stakeToken", type: "address" },
          { name: "stakeAmount", type: "uint256" },
          { name: "roomIdHash", type: "bytes32" },
          { name: "createdAt", type: "uint64" },
          { name: "startedAt", type: "uint64" },
          { name: "resultHash", type: "bytes32" },
          { name: "winner", type: "address" },
          { name: "status", type: "uint8" }
        ],
        name: "",
        type: "tuple"
      }
    ]
  }
] as const;
