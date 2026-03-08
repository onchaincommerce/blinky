import type { ReactNode } from "react";
import type { Metadata } from "next";
import "@livekit/components-styles";

import { Providers } from "../components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blinky",
  description: "Private 1v1 blink duels.",
  icons: {
    icon: "/blinky_logo.png",
    shortcut: "/blinky_logo.png",
    apple: "/blinky_logo.png"
  }
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
