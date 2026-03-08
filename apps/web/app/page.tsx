import Image from "next/image";

import { AuthPanel } from "../components/auth-panel";
import { CreateMatchForm } from "../components/create-match-form";
import { MatchHistory } from "../components/match-history";

export default function HomePage() {
  return (
    <main className="shell home-shell">
      <section className="home-stage">
        <div className="home-brand">
          <Image
            alt="Blinky logo"
            className="home-logo"
            height={388}
            priority
            src="/blinky_logo.png"
            width={643}
          />
          <div className="home-brand-copy">
            <h1>Blinky</h1>
          </div>
        </div>

        <div className="home-panels">
          <AuthPanel />
          <CreateMatchForm />
        </div>
      </section>
      <MatchHistory />
    </main>
  );
}
