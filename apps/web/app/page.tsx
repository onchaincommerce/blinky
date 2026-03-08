import { AuthPanel } from "../components/auth-panel";
import { CreateMatchForm } from "../components/create-match-form";
import { MatchHistory } from "../components/match-history";

export default function HomePage() {
  return (
    <main className="shell home-shell">
      <section className="landing landing-home home-layout">
        <div className="panel home-hero">
          <div className="home-mark">
            <span className="eyebrow">Blink duel</span>
            <h1>Blinky</h1>
          </div>
        </div>

        <div className="launch-rail deck-rail home-rail">
          <AuthPanel />
          <CreateMatchForm />
        </div>
      </section>
      <MatchHistory />
    </main>
  );
}
