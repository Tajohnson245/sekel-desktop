import { Eye, EyeOff, Layers } from 'lucide-react';
import './ImageOcclusion.css';

const modes = [
  {
    icon: <EyeOff size={18} />,
    label: 'Hide All / Guess One',
    desc: 'All structures hidden. Identify one at a time.',
  },
  {
    icon: <Eye size={18} />,
    label: 'Hide One / Guess One',
    desc: 'One structure hidden. Context remains visible.',
  },
  {
    icon: <Layers size={18} />,
    label: 'Reveal All',
    desc: 'Walk through every structure in sequence.',
  },
];

export default function ImageOcclusion() {
  return (
    <section className="occlusion-section">
      <div className="container">
        <span className="section-label">Image Occlusion</span>

        <div className="occlusion-header reveal">
          <h2 className="occlusion-headline">
            Draw a box. Make a card.<br />
            <em>Study anatomy the way it appears on exams.</em>
          </h2>
          <p className="occlusion-body">
            Upload any image — anatomy diagrams, histology slides, nerve maps, ECG strips — and
            draw shapes over the structures you need to learn. Each shape becomes its own card.
            Group related structures to reveal them together.
          </p>
        </div>

        <div className="occlusion-modes">
          {modes.map((m, i) => (
            <div key={i} className={`mode-card reveal reveal-delay-${i + 1}`}>
              <span className="mode-icon">{m.icon}</span>
              <h3 className="mode-name">{m.label}</h3>
              <p className="mode-desc">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
