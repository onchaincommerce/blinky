"use client";

import type { ReactNode } from "react";
import { CDPHooksProvider } from "@coinbase/cdp-hooks";

import { env } from "../lib/env";

export function Providers({ children }: { children: ReactNode }) {
  if (!env.cdpProjectId) {
    return (
      <div className="shell">
        <div className="panel" style={{ maxWidth: 760, margin: "64px auto 0" }}>
          <div className="eyebrow">Configuration Needed</div>
          <h2>CDP is not configured yet</h2>
          <p className="note">
            The Embedded Wallet SDK needs a public CDP project ID before the provider can initialize. Add the missing
            variables below and restart the web server.
          </p>
          <div className="pre">
            Missing web env:
            {"\n"}
            NEXT_PUBLIC_CDP_PROJECT_ID
            {"\n\n"}
            Copy `.env.example` to `.env` and set:
            {"\n"}
            NEXT_PUBLIC_CDP_PROJECT_ID=...
          </div>
        </div>
      </div>
    );
  }

  return (
    <CDPHooksProvider
      config={{
        projectId: env.cdpProjectId,
        ethereum: {
          createOnLogin: "smart"
        }
      }}
    >
      {children}
    </CDPHooksProvider>
  );
}
