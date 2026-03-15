import "./StatCard.css";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
}

export default function StatCard({ label, value, subtitle }: StatCardProps) {
  return (
    <div className="stat-card">
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value">{value}</span>
      {subtitle && <span className="stat-card__subtitle">{subtitle}</span>}
      <div className="stat-card__accent" />
    </div>
  );
}
