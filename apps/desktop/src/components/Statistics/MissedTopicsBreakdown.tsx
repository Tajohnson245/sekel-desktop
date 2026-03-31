import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { MissedCardStats } from '../../lib/queries';
import './MissedTopicsBreakdown.css';

interface MissedTopicsBreakdownProps {
    data: MissedCardStats;
    isLoading: boolean;
}

export function MissedTopicsBreakdown({ data, isLoading }: MissedTopicsBreakdownProps) {
    const { t } = useTranslation();
    const [expandedSystems, setExpandedSystems] = useState<Set<string>>(new Set());

    if (isLoading) return null;

    const { systems, unclassifiedMissCount, totalMissCount } = data;

    if (totalMissCount === 0) {
        return (
            <div className="missed-topics-breakdown analytics-chart">
                <h4>{t('stats.missed_by_system')}</h4>
                <p className="text-muted">{t('study.analytics.no_forgotten')}</p>
            </div>
        );
    }

    function toggleSystem(systemKey: string) {
        setExpandedSystems(prev => {
            const next = new Set(prev);
            if (next.has(systemKey)) {
                next.delete(systemKey);
            } else {
                next.add(systemKey);
            }
            return next;
        });
    }

    return (
        <div className="missed-topics-breakdown analytics-chart">
            <h4>{t('stats.missed_by_system')}</h4>

            <ul className="missed-system-list">
                {systems.map(sys => {
                    const isExpanded = expandedSystems.has(sys.systemKey);
                    const hasTopics = sys.topics.length > 0;
                    return (
                        <li key={sys.systemKey} className="missed-system-item">
                            <button
                                className="missed-system-row"
                                onClick={() => hasTopics && toggleSystem(sys.systemKey)}
                                aria-expanded={hasTopics ? isExpanded : undefined}
                                disabled={!hasTopics}
                            >
                                <span className="missed-system-chevron">
                                    {hasTopics
                                        ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
                                        : <span className="missed-system-chevron-spacer" />
                                    }
                                </span>
                                <span className="missed-system-label">{sys.systemLabel}</span>
                                <span className="missed-system-meta">
                                    <span className="missed-system-count">{t('stats.missed_count', { count: sys.missCount })}</span>
                                    <span className="missed-system-rate text-muted">{t('stats.miss_rate', { rate: sys.missRate.toFixed(1) })}</span>
                                </span>
                            </button>

                            {isExpanded && hasTopics && (
                                <ul className="missed-topic-list">
                                    {sys.topics.map(topic => (
                                        <li key={topic.topicKey} className="missed-topic-item">
                                            <span className="missed-topic-label">{topic.topicLabel}</span>
                                            <span className="missed-topic-meta">
                                                <span className="missed-topic-count">{t('stats.missed_count', { count: topic.missCount })}</span>
                                                <span className="missed-topic-rate text-muted">{t('stats.miss_rate', { rate: topic.missRate.toFixed(1) })}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    );
                })}

                {unclassifiedMissCount > 0 && (
                    <li className="missed-system-item missed-system-item--unclassified">
                        <div className="missed-system-row missed-system-row--static">
                            <span className="missed-system-chevron-spacer" />
                            <span className="missed-system-label text-muted">{t('stats.unclassified')}</span>
                            <span className="missed-system-meta">
                                <span className="missed-system-count">{t('stats.missed_count', { count: unclassifiedMissCount })}</span>
                            </span>
                        </div>
                    </li>
                )}
            </ul>
        </div>
    );
}
