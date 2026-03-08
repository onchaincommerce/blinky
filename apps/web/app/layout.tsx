import type { ReactNode } from "react";
import type { Metadata } from "next";
import "@livekit/components-styles";

import { Providers } from "../components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blink Duel",
  description: "Real-time blink duels with CDP Embedded Wallets on Base Sepolia"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
