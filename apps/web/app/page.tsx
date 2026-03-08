import { AuthPanel } from "../components/auth-panel";
import { CreateMatchForm } from "../components/create-match-form";
import { MatchHistory } from "../components/match-history";

const homeFacts = [
  {
    label: "Invite",
    value: "1 open seat"
  },
  {
    label: "Stake",
    value: "Matched pot"
  },
  {
    label: "Start",
    value: "Both ready"
  }
];

const ritual = [
  {
    label: "Sign in",
    note: "Use email once and fund your wallet."
  },
  {
    label: "Open duel",
    note: "Set the stake and lock your side."
  },
  {
    label: "Send link",
    note: "One challenger joins and matches it."
  }
];

export default function HomePage() {
  return (
    <main className="shell home-shell">
      <section className="landing landing-home home-layout">
        <div className="panel home-hero">
          <div className="hero-frame">
            <p className="poster-kicker">Blink duel</p>
            <span className="hero-caption">One link. Matched stake.</span>
          </div>
          <h1>
            Private 1v1.
            <br />
            Matched pot.
          </h1>
          <p className="hero-copy">Open a room, fund one side, and send one link.</p>

          <div className="hero-metrics">
            {homeFacts.map((fact) => (
              <article className="hero-metric" key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </article>
            ))}
          </div>

          <div className="hero-steps">
            {ritual.map((step, index) => (
              <article className="hero-step" key={step.label}>
                <span className="step-number">0{index + 1}</span>
                <strong>{step.label}</strong>
                <p>{step.note}</p>
              </article>
            ))}
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
