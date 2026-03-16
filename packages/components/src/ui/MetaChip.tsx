import './MetaChip.css';

interface MetaChipProps {
    label: string;
    value: string | number;
}

export function MetaChip({ label, value }: MetaChipProps) {
    return (
        <div className="meta-chip">
            <span className="meta-chip__label">{label}</span>
            <span className="meta-chip__value">{value}</span>
        </div>
    );
}
