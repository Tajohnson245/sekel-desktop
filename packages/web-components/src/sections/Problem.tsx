import { Timer, BarChart2, BrainCircuit } from 'lucide-react';
import './Problem.css';

export default function Problem() {
  return (
    <section id="problem" className="problem-section">
      <div className="container">
        <span className="section-label">The Problem with Flashcard Apps</span>

        <h2 className="problem-headline reveal">
          They tell you <em>when</em> to review.<br />
          Never <em>what&apos;s worth reviewing.</em>
        </h2>

        <div className="problem-grid">
          <div className="problem-body reveal">
            <p>
              Medical students have hundreds of cards due every day and an exam in two weeks.
              Traditional flashcard apps surface them all equally. SEKEL doesn&apos;t.
            </p>
          </div>

          <div className="problem-cards">
            <div className="problem-card reveal reveal-delay-1">
              <div className="problem-icon rose-icon"><Timer size={20} /></div>
              <div className="problem-card-content">
                <h3>No exam awareness</h3>
                <p>
                  Standard flashcard apps have no idea your IM shelf is in 14 days. They treat a card
                  about rare tropical diseases the same as a Cardiology card worth 20% of your score.
                </p>
              </div>
            </div>

            <div className="problem-card reveal reveal-delay-2">
              <div className="problem-icon amber-icon"><BarChart2 size={20} /></div>
              <div className="problem-card-content">
                <h3>No yield intelligence</h3>
                <p>
                  Not all cards are equal for your next exam. Some are high-yield. Most aren&apos;t.
                  Traditional schedulers can&apos;t tell the difference. SEKEL is built around that distinction.
                </p>
              </div>
            </div>

            <div className="problem-card reveal reveal-delay-3">
              <div className="problem-icon mist-icon"><BrainCircuit size={20} /></div>
              <div className="problem-card-content">
                <h3>No prioritization logic</h3>
                <p>
                  With limited hours and a real exam approaching, you need a study partner that reasons
                  about your time — not an algorithm that just counts days since last review.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
