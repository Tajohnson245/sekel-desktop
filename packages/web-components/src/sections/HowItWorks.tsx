import './HowItWorks.css';

const steps = [
  {
    number: '1',
    title: 'Register your exam',
    body: (
      <>
        Tell SEKEL which exam you&apos;re studying for and when it is. SEKEL loads the{' '}
        <strong>official blueprint</strong> — real topic weightings from USMLE, NBME, or NCSBN — and uses
        it to score every card you own.
      </>
    ),
  },
  {
    number: '2',
    title: 'Study as normal',
    body: (
      <>
        Review cards using the <strong>FSRS algorithm</strong> — the most accurate spaced repetition
        scheduler available. Every rating you give builds a picture of your real weak areas.
      </>
    ),
  },
  {
    number: '3',
    title: 'SEKEL prioritizes for you',
    body: (
      <>
        Before each session, SEKEL combines your performance data, the blueprint weightings, and
        time-to-exam to surface the <strong>highest-leverage cards first</strong>. You always know why a
        card is being shown.
      </>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="hiw-section">
      <div className="container">
        <span className="section-label">How It Works</span>

        <h2 className="hiw-headline reveal">Three inputs. One intelligent queue.</h2>

        <p className="hiw-subheadline reveal reveal-delay-1">
          SEKEL doesn&apos;t replace spaced repetition — it makes it smarter by adding context that
          traditional flashcard apps were never designed to have.
        </p>

        <div className="hiw-steps">
          {steps.map((step, i) => (
            <div key={i} className={`hiw-step reveal reveal-delay-${i + 1}`}>
              <div className="step-number-badge">{step.number}</div>
              <h3 className="step-title">{step.title}</h3>
              <p className="step-body">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
