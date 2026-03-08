"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser, useEvmAddress, useSendUserOperation } from "@coinbase/cdp-hooks";
import { parseUnits } from "viem";

import { confirmCreateFunding, createMatch } from "../lib/api";
import { encodeApproveCall, encodeCreateMatchCall } from "../lib/contracts";
import { getSmartAccount, getUserEmail } from "../lib/current-user";
import { env, missingEnv } from "../lib/env";
import { extractOperationHash } from "../lib/user-operation";

const presets = ["0.10", "0.25", "1.00"];

export function CreateMatchForm() {
  const router = useRouter();
  const { currentUser } = useCurrentUser();
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation, status, data, error } = useSendUserOperation();

  const smartAccount = useMemo(() => getSmartAccount(currentUser), [currentUser]);
  const email = useMemo(() => getUserEmail(currentUser), [currentUser]);
  const [stake, setStake] = useState("0.10");
  const [backendError, setBackendError] = useState<string | null>(null);
  const [createStage, setCreateStage] = useState<"idle" | "preparing" | "signing" | "confirming">("idle");

  const disabled = !currentUser || !evmAddress || !smartAccount || missingEnv.length > 0;
  const stakeAmount = Number.parseFloat(stake || "0");
  const pot = stakeAmount * 2;
  const stakeLabel = Number.isFinite(stakeAmount) ? stakeAmount.toFixed(2) : "0.00";
  const potLabel = Number.isFinite(pot) ? pot.toFixed(2) : "0.00";
  const isLocking = createStage !== "idle" || status === "pending";
  const progressValue =
    createStage === "preparing" ? 22 : createStage === "signing" ? 64 : createStage === "confirming" ? 88 : 0;
  const progressLabel =
    createStage === "preparing"
      ? "Preparing duel"
      : createStage === "signing"
        ? "Confirm in wallet"
        : createStage === "confirming"
          ? "Locking stake"
          : "Duel";

  const handleCreate = async () => {
    if (!currentUser || !evmAddress || !smartAccount) return;
    setBackendError(null);
    setCreateStage("preparing");

    try {
      const stakeAmount = parseUnits(stake, 6);
      const match = await createMatch({
        creatorUserId: currentUser.userId,
        creatorEmail: email ?? undefined,
        creatorWallet: evmAddress as `0x${string}`,
        creatorSmartAccount: smartAccount,
        stakeToken: env.stakeTokenAddress as `0x${string}`,
        stakeAmount: stakeAmount.toString()
      });

      setCreateStage("signing");
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
          encodeCreateMatchCall(
            env.escrowAddress as `0x${string}`,
            env.stakeTokenAddress as `0x${string}`,
            stakeAmount,
            match.roomIdHash as `0x${string}`
          )
        ]
      });

      const txHash = extractOperationHash(result);
      if (!txHash) {
        throw new Error("Funding operation was sent, but no operation hash was returned");
      }

      setCreateStage("confirming");
      await confirmCreateFunding(match.id, { txHash: txHash as `0x${string}` });

      router.push(`/match/${match.matchId}`);
    } catch (nextError) {
      setCreateStage("idle");
      setBackendError(nextError instanceof Error ? nextError.message : "Failed to create match");
    }
  };

  return (
    <div className="panel spotlight-panel challenge-panel deck-card">
      <div className="challenge-head">
        <div className="eyebrow">Duel</div>
        <h3>Set stake</h3>
      </div>
      <label className="field">
        <span>Stake (USDC)</span>
        <input
          inputMode="decimal"
          placeholder="0.10"
          value={stake}
          onChange={(event) => setStake(event.target.value)}
        />
      </label>
      <div className="preset-row">
        {presets.map((preset) => (
          <button
            className={`preset-chip ${stake === preset ? "active" : ""}`.trim()}
            key={preset}
            onClick={() => setStake(preset)}
            type="button"
          >
            {preset} USDC
          </button>
        ))}
      </div>
      <div className="split-metrics challenge-metrics">
        <div className="metric">
          <span className="data-label">Your stake</span>
          <strong>{stakeLabel} USDC</strong>
        </div>
        <div className="metric">
          <span className="data-label">Pot</span>
          <strong>{potLabel} USDC</strong>
        </div>
      </div>
      <div className="actions" style={{ marginTop: 16 }}>
        <button
          className={`cta cta-progress ${isLocking ? "is-loading" : ""}`.trim()}
          disabled={disabled || isLocking}
          onClick={handleCreate}
          type="button"
        >
          <span className="cta-progress-fill" style={{ width: `${progressValue}%` }} />
          <span className="cta-label">{progressLabel}</span>
        </button>
        <a className="secondary" href="/detection">
          Check camera
        </a>
      </div>
      {!currentUser ? <p className="status warn">Sign in first.</p> : null}
      {missingEnv.length > 0 ? <p className="status danger">Missing env: {missingEnv.join(", ")}</p> : null}
      {backendError ? <p className="status danger">{backendError}</p> : null}
      {error ? <p className="status danger">{error.message}</p> : null}
      {data?.transactionHash ? <p className="status">Create tx: {data.transactionHash}</p> : null}
    </div>
  );
}
