import { AuthPanel } from "../components/auth-panel";
import { CreateMatchForm } from "../components/create-match-form";
import { EyeLogo } from "../components/eye-logo";
import { MatchHistory } from "../components/match-history";

export default function HomePage() {
  return (
    <main className="shell home-shell">
      <section className="home-stage">
        <div className="home-brand">
          <EyeLogo className="home-logo" />
          <div className="home-brand-copy">
            <h1>Blinky</h1>
          </div>
        </div>

        <section className="panel home-intro" aria-label="About Blinky">
          <div className="home-intro-copy">
            <div className="eyebrow">What it is</div>
            <h2>A staring contest where both players lock the same stake.</h2>
            <p className="note">
              Blinky is a two-player staring contest. Each player puts in test USDC, joins the same camera room, and
              the first blink loses.
            </p>
          </div>

          <div className="home-start">
            <h3>Start here</h3>
            <ol className="home-start-list">
              <li>Sign in with email and fund your duel wallet.</li>
              <li>Create a staring contest or open the invite link from the other player.</li>
              <li>Check camera, join the room, and start when both players are ready.</li>
            </ol>
          </div>
        </section>

        <div className="home-panels">
          <AuthPanel />
          <CreateMatchForm />
        </div>
      </section>
      <MatchHistory />
    </main>
  );
}
