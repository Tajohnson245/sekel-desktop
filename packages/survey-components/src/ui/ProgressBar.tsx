import "./ProgressBar.css";

interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
}

export default function ProgressBar({ current, total, label }: ProgressBarProps) {
  const pct = Math.round((current / total) * 100);

  return (
    <div className="progress-bar">
      {label && (
        <div className="progress-bar__meta">
          <span className="progress-bar__label">{label}</span>
          <span className="progress-bar__step">
            {current} / {total}
          </span>
        </div>
      )}
      <div className="progress-bar__track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
