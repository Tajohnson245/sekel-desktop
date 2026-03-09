import { Sparkles, Check, Zap, HardDrive, Image as ImageIcon } from 'lucide-react';
import './Features.css';

export default function Features() {
  return (
    <section id="features" className="features-section">
      <div className="container">
        <span className="section-label">Features</span>
        <h2 className="features-headline reveal">Everything a flashcard app should be.</h2>

        <div className="features-grid">
          {/* Featured card — full width */}
          <div className="feature-card-featured reveal">
            <div className="featured-left">
              <div className="feat-icon-box"><Sparkles size={20} /></div>
              <span className="feat-label">Core Feature</span>
              <h3 className="feat-title">AI-Driven Study Prioritization</h3>
              <p className="feat-body">
                This is what SEKEL was built for. Before every session, an AI reasoning layer combines three
                signals — your personal performance history, the official exam blueprint, and days until your
                exam — to generate a ranked study queue.
              </p>
              <ul className="feat-list">
                <li><Check className="feat-bullet" size={14} /> Blueprint weights from USMLE, NBME shelf exams, and NCLEX</li>
                <li><Check className="feat-bullet" size={14} /> Adapts as your performance changes and exam date approaches</li>
                <li><Check className="feat-bullet" size={14} /> Every card shows its yield level so you always know why it matters</li>
              </ul>
            </div>
            <div className="featured-right">
              <div className="feat-demo-box">
                <div className="feat-demo-header">
                  <div className="feat-demo-icon"><Sparkles size={12} /></div>
                  <span className="feat-demo-label">SEKEL Intelligence · IM Shelf · 14 days</span>
                </div>
                <p className="feat-demo-body">
                  Prioritizing <strong>38 cards</strong> from Cardiology and Nephrology. These are your
                  weakest areas and together account for <strong>25–35%</strong> of your IM shelf score.
                  212 cards deprioritized — low yield for this exam.
                </p>
                <div className="feat-demo-chips">
                  <span className="chip chip-teal">Cardiology · High Yield</span>
                  <span className="chip chip-teal">Nephrology · High Yield</span>
                  <span className="chip chip-dim">GI · Medium Yield</span>
                  <span className="chip chip-dim">Derm · Low Yield</span>
                </div>
              </div>
            </div>
          </div>

          {/* Standard cards */}
          <div className="feature-card reveal reveal-delay-1">
            <div className="feat-icon-box teal-box"><Zap size={20} /></div>
            <span className="feat-label">Algorithm</span>
            <h3 className="feat-title feat-title-dark">FSRS Scheduling</h3>
            <p className="feat-body feat-body-dark">
              The Free Spaced Repetition Scheduler is the most accurate scheduling algorithm available —
              significantly better than SM-2. It models your memory precisely so you review cards at exactly
              the right moment, not too early or too late.
            </p>
          </div>

          <div className="feature-card reveal reveal-delay-2">
            <div className="feat-icon-box violet-box"><HardDrive size={20} /></div>
            <span className="feat-label">Architecture</span>
            <h3 className="feat-title feat-title-dark">Local-First, Always Fast</h3>
            <p className="feat-body feat-body-dark">
              Your data lives on your machine in a local SQLite database. Review sessions are instant — no
              network latency, no spinners. Works fully offline. Syncs to the cloud in the background when
              you&apos;re connected.
            </p>
          </div>

          <div className="feature-card reveal reveal-delay-3">
            <div className="feat-icon-box amber-box"><ImageIcon size={20} /></div>
            <span className="feat-label">Card Types</span>
            <h3 className="feat-title feat-title-dark">Rich Cards with Images</h3>
            <p className="feat-body feat-body-dark">
              Create cards with text, images, and image occlusion. Perfect for anatomy, ECG interpretation,
              radiology, and pathology slides. Images are stored locally for instant loading — no cloud
              dependency during review.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
