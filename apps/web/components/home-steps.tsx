const steps = [
  {
    step: "01",
    title: "Fund the embedded smart account",
    copy: "Each player signs in with email OTP and deposits at least 1 test USDC into the smart account shown in the app."
  },
  {
    step: "02",
    title: "Create and share the duel",
    copy: "The creator locks 1 USDC, then sends the invite URL to exactly one opponent."
  },
  {
    step: "03",
    title: "Opponent joins and matches stake",
    copy: "The second player opens the invite link, signs in, and funds the same 1 USDC amount."
  },
  {
    step: "04",
    title: "Both arm cameras, first blink loses",
    copy: "Once both players are present, the referee starts the room and resolves escrow when blink detection fires."
  }
];

export function HomeSteps() {
  return (
    <section className="steps-section">
      <div className="section-heading">
        <div className="eyebrow">Flow</div>
        <h2>How two people actually compete</h2>
      </div>
      <div className="steps-grid">
        {steps.map((item) => (
          <article className="step-card" key={item.step}>
            <div className="step-number">{item.step}</div>
            <h3>{item.title}</h3>
            <p className="note">{item.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
