import { FileText, Youtube, CheckCircle, ChevronRight } from 'lucide-react';
import './AIGeneration.css';

const sources = [
  { icon: <FileText size={16} />, label: 'First Aid for Step 1', type: 'PDF' },
  { icon: <FileText size={16} />, label: 'Pathoma Chapter 4', type: 'PDF' },
  { icon: <Youtube size={16} />, label: 'Boards & Beyond — Cardio', type: 'YouTube' },
];

const draftCards = [
  {
    q: 'What is the most common cause of restrictive cardiomyopathy?',
    a: 'Amyloidosis (AL type in developed countries).',
  },
  {
    q: 'Troponin I vs. T: which is more cardiac-specific?',
    a: 'Both are cardiac-specific; troponin T is also expressed in skeletal muscle during fetal development.',
  },
];

export default function AIGeneration() {
  return (
    <section id="ai-cards" className="aigen-section">
      <div className="container aigen-inner">
        {/* Left: copy */}
        <div className="aigen-text">
          <span className="section-label">AI Card Generation</span>
          <h2 className="aigen-headline reveal">
            Turn First Aid into flashcards.<br />
            <em>In seconds.</em>
          </h2>
          <p className="aigen-body reveal reveal-delay-1">
            Upload a PDF or drop a YouTube link. Sekel reads it, extracts the key concepts, and
            generates cards for your review. Works with your lecture slides, Pathoma chapters,
            Boards &amp; Beyond videos — any source you already use.
          </p>
          <p className="aigen-body reveal reveal-delay-2">
            Cards land in your <strong>Drafts inbox</strong> first. You approve each one before it
            ever hits your deck. No auto-spam, no garbage cards — you stay in control.
          </p>

          <div className="aigen-sources reveal reveal-delay-3">
            {sources.map((s, i) => (
              <div key={i} className="aigen-source">
                <span className="source-icon">{s.icon}</span>
                <span className="source-label">{s.label}</span>
                <span className="source-type">{s.type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: flow mockup */}
        <div className="aigen-mockup reveal reveal-delay-1">
          <div className="flow-step">
            <div className="flow-badge">Upload</div>
            <div className="flow-card">
              <span className="flow-file-icon"><FileText size={18} /></span>
              <div className="flow-file-info">
                <span className="flow-file-name">First Aid — Cardiology.pdf</span>
                <span className="flow-file-meta">48 pages · 12 MB</span>
              </div>
            </div>
          </div>

          <div className="flow-arrow"><ChevronRight size={16} /></div>

          <div className="flow-step">
            <div className="flow-badge">Summarize</div>
            <div className="flow-card flow-card-dim">
              <span className="flow-summary-text">
                Detected <strong>6 sections</strong> · Estimated <strong>42 cards</strong>
              </span>
            </div>
          </div>

          <div className="flow-arrow"><ChevronRight size={16} /></div>

          <div className="flow-step">
            <div className="flow-badge flow-badge-teal">Drafts</div>
            <div className="flow-drafts">
              {draftCards.map((card, i) => (
                <div key={i} className="draft-card">
                  <p className="draft-q">{card.q}</p>
                  <p className="draft-a">{card.a}</p>
                  <div className="draft-actions">
                    <button className="draft-btn draft-btn-approve">
                      <CheckCircle size={12} /> Approve
                    </button>
                    <button className="draft-btn draft-btn-skip">Skip</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
