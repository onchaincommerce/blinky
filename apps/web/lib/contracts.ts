import { BLINK_MATCH_ESCROW_ABI } from "@blink/shared";
import { encodeFunctionData } from "viem";

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

export const encodeApproveCall = (token: `0x${string}`, spender: `0x${string}`, amount: bigint) => ({
  to: token,
  value: 0n,
  data: encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount]
  })
});

export const encodeCreateMatchCall = (
  escrow: `0x${string}`,
  stakeToken: `0x${string}`,
  stakeAmount: bigint,
  roomIdHash: `0x${string}`
) => ({
  to: escrow,
  value: 0n,
  data: encodeFunctionData({
    abi: BLINK_MATCH_ESCROW_ABI,
    functionName: "createMatch",
    args: [stakeToken, stakeAmount, roomIdHash]
  })
});

export const encodeJoinMatchCall = (escrow: `0x${string}`, matchId: bigint) => ({
  to: escrow,
  value: 0n,
  data: encodeFunctionData({
    abi: BLINK_MATCH_ESCROW_ABI,
    functionName: "joinMatch",
    args: [matchId]
  })
});

