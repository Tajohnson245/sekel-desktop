import { Timer, BarChart2, BrainCircuit } from 'lucide-react';
import './Problem.css';

export default function Problem() {
  return (
    <section id="problem" className="problem-section">
      <div className="container">
        <span className="section-label">The Problem with Flashcard Apps</span>

        <h2 className="problem-headline reveal">
          You have 500 cards due today.<br />
          <em>Which 50 actually matter?</em>
        </h2>

        <div className="problem-grid">
          <div className="problem-body reveal">
            <p>
              In dedicated study, every hour counts. Traditional flashcard apps treat every card
              the same — no exam awareness, no blueprint weighting, no urgency. Sekel does.
            </p>
          </div>

          <div className="problem-cards">
            <div className="problem-card reveal reveal-delay-1">
              <div className="problem-icon rose-icon"><Timer size={20} /></div>
              <div className="problem-card-content">
                <h3>Exam blindness</h3>
                <p>
                  Anki treats every card equally. Your exam doesn&apos;t. Cardiology is 30% of Step 1.
                  Biochemistry is 14%. Your deck doesn&apos;t know that — Sekel does.
                </p>
              </div>
            </div>

            <div className="problem-card reveal reveal-delay-2">
              <div className="problem-icon amber-icon"><BarChart2 size={20} /></div>
              <div className="problem-card-content">
                <h3>Content overload</h3>
                <p>
                  Second year means hundreds of new cards every week. Without prioritization,
                  you&apos;re grinding through low-yield content when high-yield topics are slipping.
                </p>
              </div>
            </div>

            <div className="problem-card reveal reveal-delay-3">
              <div className="problem-icon mist-icon"><BrainCircuit size={20} /></div>
              <div className="problem-card-content">
                <h3>No urgency signal</h3>
                <p>
                  Six weeks out vs. six months out should feel completely different. Traditional
                  spaced repetition has no concept of your exam date. Sekel builds its whole
                  session queue around it.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
