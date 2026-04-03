import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useSekelIntelligence } from '../../hooks/useSekelIntelligence';
import { useExamProfile } from '../../hooks/useExamProfile';
import { useActivePlan } from '../../hooks/usePlan';
import { isExamDateSet } from '../../lib/queries';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import SekelIntelligencePanel, { IntelligenceHiddenBar } from './SekelIntelligencePanel';
import PreSessionBriefing from './PreSessionBriefing';
import './Dashboard.css';

export default function Dashboard() {
    const navigate = useNavigate();
    const { goToProfile, goToDecks } = useAppNavigation();
    const { user } = useAuthStore();
    const { profile, fetchProfile, updateProfile } = useProfileStore();
    const { data: intelligence } = useSekelIntelligence(user?.id);
    const { data: examProfile } = useExamProfile();
    const { data: activePlanResult, isLoading: planLoading } = useActivePlan();

    const [showBriefing, setShowBriefing] = useState(false);

    useEffect(() => {
        if (user?.id && !profile) {
            fetchProfile(user.id);
        }
    }, [user?.id, profile, fetchProfile]);

    const firstName = profile?.first_name || 'User';
    const intelligenceEnabled = profile?.intelligence_enabled ?? true;
    const hasExamDate = examProfile != null && isExamDateSet(examProfile.exam_date);
    const hasActivePlan = activePlanResult != null;

    const daysUntilExam = hasExamDate
        ? Math.floor((new Date(examProfile!.exam_date).getTime() - Date.now()) / 86_400_000)
        : null;

    const formattedExamDate = hasExamDate
        ? new Date(examProfile!.exam_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : null;

    return (
        <div className="dashboard">
            {/* Zone 1 — Exam Countdown Header */}
            <div className="dashboard-header">
                <div>
                    <p className="dashboard-welcome">Welcome back, {firstName}.</p>
                    {hasExamDate ? (
                        <p className="dashboard-countdown">
                            {daysUntilExam} days until {examProfile!.exam_label} · {formattedExamDate}
                        </p>
                    ) : (
                        <button className="dashboard-set-exam-prompt" onClick={() => goToProfile()}>
                            Set your exam date to get started →
                        </button>
                    )}
                </div>
            </div>

            {/* Zone 2 — SEKEL Intelligence */}
            <div className="dashboard-top">
                <div className="dashboard-top__intel">
                    {intelligence && (
                        intelligenceEnabled ? (
                            <SekelIntelligencePanel
                                intelligence={intelligence}
                                onStartFocused={() => setShowBriefing(true)}
                                onHide={() => user?.id && updateProfile(user.id, { intelligence_enabled: false })}
                                onGoToProfile={() => goToProfile()}
                                onGoToDecks={() => goToDecks()}
                            />
                        ) : (
                            <IntelligenceHiddenBar
                                onShow={() => user?.id && updateProfile(user.id, { intelligence_enabled: true })}
                            />
                        )
                    )}
                </div>
            </div>

            {/* Zone 3 — Soft Plan Nudge (only when exam date set but no active plan) */}
            {!planLoading && !hasActivePlan && hasExamDate && (
                <p className="dashboard-plan-nudge">
                    No study plan yet —{' '}
                    <button className="dashboard-plan-nudge__link" onClick={() => navigate('/plan')}>
                        build one to get daily targets →
                    </button>
                </p>
            )}

            {showBriefing && intelligence && (
                <PreSessionBriefing
                    intelligence={intelligence}
                    onDismiss={() => setShowBriefing(false)}
                    onBegin={(deckId) => {
                        setShowBriefing(false);
                        const weakKeys = intelligence.systemBreakdown
                            .filter(s => s.accuracy < 0.80)
                            .map(s => s.systemKey);
                        const systemsParam = weakKeys.length > 0 ? `&systems=${weakKeys.join(',')}` : '';
                        navigate(`/decks/${deckId}/study?mode=due&focus=intelligence${systemsParam}`);
                    }}
                />
            )}
        </div>
    );
}
