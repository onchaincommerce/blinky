"use client";

import { useMemo, useState } from "react";
import {
  useCurrentUser,
  useEvmAddress,
  useSignInWithEmail,
  useVerifyEmailOTP
} from "@coinbase/cdp-hooks";

import { getSmartAccount, getUserEmail } from "../lib/current-user";
import { shortAddress } from "../lib/format";
import { CopyButton } from "./copy-button";
import { WalletBalanceCard } from "./wallet-balance-card";

export function AuthPanel() {
  const { currentUser } = useCurrentUser();
  const { evmAddress } = useEvmAddress();
  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();

  const smartAccount = useMemo(() => getSmartAccount(currentUser), [currentUser]);
  const emailLabel = useMemo(() => getUserEmail(currentUser), [currentUser]);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [flowId, setFlowId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startFlow = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await signInWithEmail({ email });
      setFlowId(response.flowId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to send OTP");
    } finally {
      setBusy(false);
    }
  };

  const finishFlow = async () => {
    if (!flowId) return;
    setBusy(true);
    setError(null);
    try {
      await verifyEmailOTP({ flowId, otp });
      setOtp("");
      setFlowId(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "OTP verification failed");
    } finally {
      setBusy(false);
    }
  };

  if (currentUser) {
    return (
      <div className="panel spotlight-panel identity-panel deck-card">
        <div className="identity-head">
          <div className="identity-copy">
            <div className="eyebrow">Wallet</div>
            <h3 className="identity-email">{emailLabel ?? "Unknown player"}</h3>
            <p className="note">Funding account for duels.</p>
          </div>
          <details className="info-drawer">
            <summary>Wallets</summary>
            <div className="info-drawer-body">
              <div className="info-row">
                <span className="data-label">Wallet</span>
                <strong>{shortAddress(evmAddress)}</strong>
              </div>
              <div className="info-row">
                <span className="data-label">Duel wallet</span>
                <strong>{shortAddress(smartAccount)}</strong>
              </div>
              <div className="info-row">
                <span className="data-label">User ID</span>
                <strong>{currentUser.userId}</strong>
              </div>
              <div className="actions">
                {smartAccount ? <CopyButton value={smartAccount} label="Copy duel wallet" /> : null}
                {evmAddress ? <CopyButton value={evmAddress} label="Copy owner wallet" /> : null}
                <a
                  className="secondary"
                  href="https://faucet.circle.com/"
                  rel="noreferrer"
                  target="_blank"
                >
                  Get test USDC
                </a>
              </div>
            </div>
          </details>
        </div>
        {smartAccount ? <WalletBalanceCard address={smartAccount} /> : <p className="status warn">No duel wallet found yet.</p>}
      </div>
    );
  }

  return (
    <div className="panel spotlight-panel deck-card">
      <div className="eyebrow">Wallet</div>
      <h3>Enter email</h3>
      <p className="note">Sign in to fund or join a duel.</p>
      <div className="grid">
        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        {flowId ? (
          <label className="field">
            <span>Code</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
            />
          </label>
        ) : null}
      </div>
      <div className="actions" style={{ marginTop: 16 }}>
        {!flowId ? (
          <button className="cta" onClick={startFlow} disabled={busy || !email}>
            {busy ? "Sending..." : "Send code"}
          </button>
        ) : (
          <button className="cta" onClick={finishFlow} disabled={busy || otp.length !== 6}>
            {busy ? "Verifying..." : "Verify code"}
          </button>
        )}
      </div>
      {error ? <p className="status danger">{error}</p> : null}
    </div>
  );
}
