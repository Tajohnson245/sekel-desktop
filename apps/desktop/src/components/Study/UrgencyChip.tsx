import { useTranslation } from 'react-i18next';
import { isExamDateSet } from '../../lib/queries';
import './UrgencyChip.css';

interface UrgencyChipProps {
    examDate: string;
    sessionMode: string;
}

const THRESHOLDS = [180, 90, 30, 7];

function computeTier(daysUntilExam: number): { multiplier: number; emoji: string; labelKey: string } {
    if (daysUntilExam < 7)        return { multiplier: 2.5, emoji: '\uD83D\uDD34', labelKey: 'study.urgency.final_sprint' };
    if (daysUntilExam < 30)       return { multiplier: 2.0, emoji: '\uD83D\uDD34', labelKey: 'study.urgency.intensive_mode' };
    if (daysUntilExam < 90)       return { multiplier: 1.5, emoji: '\uD83D\uDFE1', labelKey: 'study.urgency.focused_mode' };
    if (daysUntilExam <= 180)     return { multiplier: 1.2, emoji: '\uD83D\uDFE1', labelKey: 'study.urgency.active_mode' };
    return { multiplier: 1.0, emoji: '\uD83D\uDFE2', labelKey: 'study.urgency.standard_mode' };
}

function daysUntilNextShift(daysUntilExam: number): number | null {
    for (const boundary of THRESHOLDS) {
        if (daysUntilExam > boundary) return daysUntilExam - boundary;
    }
    return null; // already at max urgency
}

export default function UrgencyChip({ examDate, sessionMode }: UrgencyChipProps) {
    const { t } = useTranslation();

    if (!isExamDateSet(examDate)) return null;

    const daysUntilExam = Math.floor((new Date(examDate).getTime() - Date.now()) / 86_400_000);

    // Override for fixed-mode profiles
    if (sessionMode === 'triage') {
        return (
            <span className="urgency-chip">
                <span className="urgency-chip__emoji">{'\uD83D\uDD34'}</span>
                <span className="urgency-chip__label">{t('study.urgency.final_sprint')}</span>
                <span className="urgency-chip__sep">{'\u00B7'}</span>
                <span className="urgency-chip__shift">{t('study.urgency.max_urgency')}</span>
            </span>
        );
    }

    if (sessionMode === 'mixed') {
        return (
            <span className="urgency-chip">
                <span className="urgency-chip__emoji">{'\uD83D\uDFE2'}</span>
                <span className="urgency-chip__label">{t('study.urgency.standard_mode')}</span>
            </span>
        );
    }

    // Auto mode — compute from step function
    const tier = computeTier(daysUntilExam);
    const shiftDays = daysUntilNextShift(daysUntilExam);

    return (
        <span className="urgency-chip">
            <span className="urgency-chip__emoji">{tier.emoji}</span>
            <span className="urgency-chip__label">{t(tier.labelKey)}</span>
            <span className="urgency-chip__sep">{'\u00B7'}</span>
            <span className="urgency-chip__shift">
                {shiftDays !== null
                    ? t('study.urgency.next_shift', { days: shiftDays })
                    : t('study.urgency.max_urgency')
                }
            </span>
        </span>
    );
}
