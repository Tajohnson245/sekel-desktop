import './RetentionTable.css';
import { useTranslation } from 'react-i18next';

export interface RetentionByMaturityData {
    youngRetention: number | null;
    matureRetention: number | null;
    overallRetention: number | null;
}

interface RetentionTableProps {
    data: RetentionByMaturityData;
}

function retentionClass(value: number | null): string {
    if (value === null) return 'retention-value retention-value--none';
    if (value >= 85) return 'retention-value retention-value--good';
    if (value >= 70) return 'retention-value retention-value--warning';
    return 'retention-value retention-value--danger';
}

function formatRetention(value: number | null): string {
    if (value === null) return '--';
    return `${value}%`;
}

export function RetentionTable({ data }: RetentionTableProps) {
    const { t } = useTranslation();

    return (
        <div className="retention-table-card">
            <h4>{t('stats.true_retention')}</h4>
            <p className="chart-desc">{t('stats.true_retention_desc')}</p>

            <table className="retention-table">
                <thead>
                    <tr>
                        <th>{t('stats.card_type')}</th>
                        <th>{t('stats.retention_rate')}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>{t('stats.young')} (&lt;21d)</td>
                        <td className={retentionClass(data.youngRetention)}>
                            {formatRetention(data.youngRetention)}
                        </td>
                    </tr>
                    <tr>
                        <td>{t('stats.mature')} (&ge;21d)</td>
                        <td className={retentionClass(data.matureRetention)}>
                            {formatRetention(data.matureRetention)}
                        </td>
                    </tr>
                    <tr>
                        <td><strong>{t('stats.overall')}</strong></td>
                        <td className={retentionClass(data.overallRetention)}>
                            <strong>{formatRetention(data.overallRetention)}</strong>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
