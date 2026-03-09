import './Comparison.css';

const rows = [
  { feature: 'Spaced repetition algorithm', anki: { type: 'amber', text: 'SM-2 (dated)' }, quizlet: { type: 'cross' }, sekel: { type: 'check', note: 'FSRS' } },
  { feature: 'Exam-specific blueprint data', anki: { type: 'cross' }, quizlet: { type: 'cross' }, sekel: { type: 'check' } },
  { feature: 'AI study prioritization', anki: { type: 'cross' }, quizlet: { type: 'cross' }, sekel: { type: 'check' } },
  { feature: 'Card yield tagging per exam', anki: { type: 'cross' }, quizlet: { type: 'cross' }, sekel: { type: 'check' } },
  { feature: 'Works fully offline', anki: { type: 'check' }, quizlet: { type: 'cross' }, sekel: { type: 'check' } },
  { feature: 'Modern desktop UI', anki: { type: 'cross' }, quizlet: { type: 'amber', text: 'Web only' }, sekel: { type: 'check' } },
  { feature: 'Import from Anki (.apkg)', anki: { type: 'dash' }, quizlet: { type: 'cross' }, sekel: { type: 'check' } },
  { feature: 'Cloud sync', anki: { type: 'amber', text: 'AnkiWeb only' }, quizlet: { type: 'check' }, sekel: { type: 'check', note: 'Supabase' } },
  { feature: 'Price', anki: { type: 'teal', text: 'Free' }, quizlet: { type: 'plain', text: '$35/yr' }, sekel: { type: 'teal', text: 'Free beta' } },
];

type CellValue = { type: string; text?: string; note?: string };

function Cell({ val, sekel = false }: { val: CellValue; sekel?: boolean }) {
  if (val.type === 'check') return (
    <td className={`cmp-td${sekel ? ' sekel-col' : ''}`}>
      <span className="cmp-check">✓</span>
      {val.note && <span className="cmp-note">{val.note}</span>}
    </td>
  );
  if (val.type === 'cross') return <td className={`cmp-td${sekel ? ' sekel-col' : ''}`}><span className="cmp-cross">✕</span></td>;
  if (val.type === 'dash')  return <td className={`cmp-td${sekel ? ' sekel-col' : ''}`}><span className="cmp-muted">—</span></td>;
  if (val.type === 'amber') return <td className={`cmp-td${sekel ? ' sekel-col' : ''}`}><span className="cmp-amber">{val.text}</span></td>;
  if (val.type === 'teal')  return <td className={`cmp-td${sekel ? ' sekel-col' : ''}`}><span className="cmp-teal-text">{val.text}</span></td>;
  return <td className={`cmp-td${sekel ? ' sekel-col' : ''}`}><span className="cmp-muted">{val.text}</span></td>;
}

export default function Comparison() {
  return (
    <section id="compare" className="cmp-section">
      <div className="container">
        <span className="section-label">Comparison</span>
        <h2 className="cmp-headline reveal">How SEKEL stacks up.</h2>

        <div className="cmp-table-wrap reveal reveal-delay-1">
          <table className="cmp-table">
            <thead>
              <tr>
                <th scope="col" className="cmp-th">Feature</th>
                <th scope="col" className="cmp-th">Anki</th>
                <th scope="col" className="cmp-th">Quizlet</th>
                <th scope="col" className="cmp-th sekel-header">
                  SEKEL
                  <span className="sekel-recommended">Recommended</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="cmp-row">
                  <td className="cmp-td cmp-feature">{row.feature}</td>
                  <Cell val={row.anki} />
                  <Cell val={row.quizlet} />
                  <Cell val={row.sekel} sekel />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
