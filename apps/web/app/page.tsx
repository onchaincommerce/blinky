import { AuthPanel } from "../components/auth-panel";
import { CreateMatchForm } from "../components/create-match-form";
import { MatchHistory } from "../components/match-history";

const ritual = [
  {
    label: "Set the stake",
    note: "You lock the first side of the pot before anyone else can touch the room."
  },
  {
    label: "Mark one target",
    note: "The link belongs to one challenger. They match your amount or the room stays cold."
  },
  {
    label: "Hold the line",
    note: "Both cameras go live, the countdown drops, and the first blink loses the pot."
  }
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="issue-strip">
        <span>Invite only</span>
        <span>Camera duel</span>
        <span>Winner takes the pot</span>
      </section>
      <section className="masthead">
        <div className="brand-lockup">
          <span className="brand-tag">Blink Duel</span>
          <span className="brand-slash">First blink loses</span>
        </div>
        <span className="masthead-copy">Invite one. Lock the pot. Keep your eyes up.</span>
      </section>

      <section className="landing landing-home">
        <div className="poster">
          <span className="poster-stamp">Invite only</span>
          <p className="poster-kicker">Blink duel</p>
          <h1>
            Stare down.
            <br />
            Cash out.
          </h1>
          <p className="poster-copy">
            Two faces, one live room, one pot waiting for the first crack in focus.
          </p>
          <div className="poster-subhead">
            <span>Invite one</span>
            <span>Match exact stake</span>
            <span>Ready once</span>
          </div>
          <div className="poster-steps">
            {ritual.map((step, index) => (
              <article className="step-card ritual-card" key={step.label}>
                <span className="step-number">0{index + 1}</span>
                <strong>{step.label}</strong>
                <p>{step.note}</p>
              </article>
            ))}
          </div>
          <div className="poster-footer">
            <span>Private room</span>
            <span>Live camera</span>
            <span>Winner takes pot</span>
          </div>
        </div>

        <div className="launch-rail deck-rail">
          <AuthPanel />
          <CreateMatchForm />
        </div>
      </section>
      <MatchHistory />
    </main>
  );
}
