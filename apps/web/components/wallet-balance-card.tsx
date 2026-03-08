"use client";

import { useEffect, useState } from "react";

import { getWalletBalances, type WalletBalancesResponse } from "../lib/api";

export function WalletBalanceCard({ address }: { address: string }) {
  const [data, setData] = useState<WalletBalancesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await getWalletBalances(address);
        if (!mounted) return;
        setData(response);
        setError(null);
      } catch (nextError) {
        if (!mounted) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load balances");
      }
    };

    void load();
    const timer = window.setInterval(load, 10000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [address]);

  return (
    <div className="wallet-balance-shell">
      <div className="eyebrow">Stake balance</div>
      {!data && !error ? <p className="note">Checking your duel cash…</p> : null}
      {error ? <p className="status danger">{error}</p> : null}
      {data ? (
        <div className="balance-focus">
          <div>
            <strong>{Number(data.summary.usdc).toFixed(2)} USDC</strong>
            <p className="note">
              {data.summary.readyForTestMatch
                ? "Loaded and ready for the next duel."
                : "Add more test USDC before you open another room."}
            </p>
          </div>
          <a className="secondary" href="https://faucet.circle.com/" rel="noreferrer" target="_blank">
            Top up
          </a>
        </div>
      ) : null}
    </div>
  );
}
