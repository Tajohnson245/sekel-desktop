import { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { computeTier, daysUntilNextShift } from '../Study/UrgencyChip';
import { isExamDateSet } from '../../lib/queries';
import type { UserExamProfile } from '../../hooks/useExamProfile';
import './SessionModeBriefing.css';

interface Props {
    deckName: string;
    dueCount: number;
    examProfile: UserExamProfile | null | undefined;
    onDismiss: () => void;
    onBegin: () => void;
}

export function getTierKey(examProfile: UserExamProfile | null | undefined): string {
    if (!examProfile || !isExamDateSet(examProfile.exam_date)) return 'standard';
    if (examProfile.session_mode === 'mixed') return 'mixed';
    if (examProfile.session_mode === 'triage') return 'triage';
    const days = Math.floor((new Date(examProfile.exam_date).getTime() - Date.now()) / 86_400_000);
    if (days < 7)    return 'final_sprint';
    if (days < 30)   return 'intensive';
    if (days < 90)   return 'focused';
    if (days <= 180) return 'active';
    return 'standard';
}

const MODE_DESCRIPTIONS: Record<string, { headline: string; body: string; color: string }> = {
    standard:     { headline: 'Standard Mode', color: 'var(--success, var(--teal))', body: 'Cards are scheduled at normal intervals. Study at a comfortable, consistent pace.' },
    active:       { headline: 'Active Mode · 1.2×', color: 'var(--warning, var(--amber))', body: 'Scheduling intervals are tightened slightly as your exam draws closer. Stay consistent.' },
    focused:      { headline: 'Focused Mode · 1.5×', color: 'var(--warning, var(--amber))', body: 'Elevated urgency. Cards are reviewed more frequently to solidify your knowledge in the final stretch.' },
    intensive:    { headline: 'Intensive Mode · 2.0×', color: 'var(--danger, var(--rose))', body: 'Your exam is under a month away. Cards are scheduled for rapid reinforcement — prioritize weak areas.' },
    final_sprint: { headline: 'Final Sprint · 2.5×', color: 'var(--danger, var(--rose))', body: 'Maximum urgency. Your exam is days away — every card counts. Stay focused.' },
    mixed:        { headline: 'Standard Mode', color: 'var(--success, var(--teal))', body: 'Fixed to standard scheduling regardless of your exam date.' },
    triage:       { headline: 'Final Sprint · 2.5×', color: 'var(--danger, var(--rose))', body: 'Fixed to maximum urgency. Every review session is high-stakes.' },
};

export default function SessionModeBriefing({ deckName, dueCount, examProfile, onDismiss, onBegin }: Props) {
    const { t } = useTranslation();
    const [dontShowAgain, setDontShowAgain] = useState(false);

    const tierKey = getTierKey(examProfile);
    const mode = MODE_DESCRIPTIONS[tierKey] ?? MODE_DESCRIPTIONS.standard;

    // Compute shift info for auto mode
    let shiftLine: string | null = null;
    if (examProfile && isExamDateSet(examProfile.exam_date) &&
        examProfile.session_mode !== 'mixed' && examProfile.session_mode !== 'triage') {
        const days = Math.floor((new Date(examProfile.exam_date).getTime() - Date.now()) / 86_400_000);
        const tier = computeTier(days);
        const shift = daysUntilNextShift(days);
        if (shift !== null) {
            const nextTierDays = days - shift;
            const nextTier = computeTier(nextTierDays);
            const nextLabel = t(nextTier.labelKey);
            shiftLine = `Next shift to ${nextLabel} in ${shift} day${shift === 1 ? '' : 's'}.`;
        } else {
            void tier; // suppress unused warning
        }
    }

    function handleBegin() {
        if (dontShowAgain) {
            localStorage.setItem(`sekel_briefing_v1_${tierKey}`, '1');
        }
        onBegin();
    }

    return (
        <div className="session-briefing-overlay" onClick={onDismiss}>
            <div className="session-briefing-modal" onClick={e => e.stopPropagation()}>
                <div className="session-briefing__header">
                    <span className="session-briefing__headline" style={{ color: mode.color }}>
                        {mode.headline}
                    </span>
                    <button className="session-briefing__close" onClick={onDismiss}>
                        <X size={16} />
                    </button>
                </div>

                <p className="session-briefing__body">{mode.body}</p>

                {shiftLine && (
                    <p className="session-briefing__shift">{shiftLine}</p>
                )}

                <div className="session-briefing__deck-info">
                    You'll review <strong>{dueCount} due {dueCount === 1 ? 'card' : 'cards'}</strong> from <strong>{deckName}</strong>.
                </div>

                <label className="session-briefing__dismiss-label">
                    <input
                        type="checkbox"
                        checked={dontShowAgain}
                        onChange={e => setDontShowAgain(e.target.checked)}
                        className="session-briefing__dismiss-check"
                    />
                    Don't show again for {mode.headline.split(' ·')[0]}
                </label>

                <div className="session-briefing__actions">
                    <button className="session-briefing__cancel" onClick={onDismiss}>
                        {t('common.cancel')}
                    </button>
                    <button className="session-briefing__begin" onClick={handleBegin}>
                        Begin Session →
                    </button>
                </div>
            </div>
        </div>
    );
}
