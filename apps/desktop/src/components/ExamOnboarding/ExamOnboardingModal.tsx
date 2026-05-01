import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Library } from 'lucide-react';
import { Modal, Button, Loader, useToast } from '../UI';
import { useExamList, useUpsertExamProfile } from '../../hooks/useExamProfile';
import { useDecks } from '../../hooks/useDecks';
import { fetchAllCardsForDeck } from '../../lib/queries';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import { useAuthStore } from '../../stores/authStore';
import './ExamOnboardingModal.css';

interface ExamOnboardingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
}

export function ExamOnboardingModal({ isOpen, onClose, onComplete }: ExamOnboardingModalProps) {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const userId = useAuthStore(s => s.user?.id);

    const { data: exams = [], isLoading: examsLoading } = useExamList();
    const { data: decks = [], isLoading: decksLoading } = useDecks();
    const upsertProfile = useUpsertExamProfile();
    const { goToDecks } = useAppNavigation();

    const [step, setStep] = useState<'select-exam' | 'select-deck' | 'pick-date'>('select-exam');
    const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
    const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
    const [examDate, setExamDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const selectedExam = exams.find(e => e.id === selectedExamId);

    const handleReset = () => {
        setStep('select-exam');
        setSelectedExamId(null);
        setSelectedDeckId(null);
        setExamDate('');
        setIsSubmitting(false);
    };

    const handleClose = () => {
        handleReset();
        onClose();
    };

    const handleGoToDecks = () => {
        handleReset();
        onClose();
        goToDecks();
    };

    const noDecks = !decksLoading && decks.length === 0;

    const handleSubmit = async (skipDate: boolean) => {
        if (!userId || !selectedExamId || !selectedExam || !selectedDeckId) return;
        setIsSubmitting(true);

        try {
            const dateValue = skipDate ? null : examDate || null;
            await upsertProfile.mutateAsync({
                userId,
                examId: selectedExamId,
                examDate: dateValue,
            });

            // Fire-and-forget background classification for the selected deck
            const cards = await fetchAllCardsForDeck(selectedDeckId);
            const cardIds = cards.map(c => c.id);
            if (cardIds.length > 0) {
                window.electronAPI.yield.classifyBatch(cardIds, selectedExam.exam_key);
            }

            showToast(t('exam.onboarding_complete'), 'success');
            handleReset();
            onComplete();
        } catch {
            showToast(t('exam.onboarding_error'), 'error');
            setIsSubmitting(false);
        }
    };

    const renderStepOne = () => {
        if (examsLoading) {
            return (
                <div className="exam-onboarding-loading">
                    <Loader />
                </div>
            );
        }

        return (
            <div className="exam-onboarding-content">
                <p className="exam-onboarding-prompt">{t('exam.select_exam_prompt')}</p>
                <ul className="exam-list">
                    {exams.map(exam => (
                        <li key={exam.id}>
                            <button
                                type="button"
                                className={`exam-list-item ${selectedExamId === exam.id ? 'selected' : ''}`}
                                onClick={() => setSelectedExamId(exam.id)}
                            >
                                {exam.label}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        );
    };

    const renderStepDeck = () => {
        if (decksLoading) {
            return (
                <div className="exam-onboarding-loading">
                    <Loader />
                </div>
            );
        }

        if (noDecks) {
            return (
                <div className="exam-onboarding-content exam-onboarding-empty">
                    <Library size={40} className="exam-onboarding-empty-icon" />
                    <h4 className="exam-onboarding-empty-title">No decks yet</h4>
                    <p className="exam-onboarding-prompt">
                        Create at least one deck before setting up your exam. Your decks are what gets classified against the exam blueprint.
                    </p>
                </div>
            );
        }

        return (
            <div className="exam-onboarding-content">
                <p className="exam-onboarding-prompt">{t('exam.select_deck_prompt')}</p>
                <ul className="exam-list">
                    {decks.map(deck => (
                        <li key={deck.id}>
                            <button
                                type="button"
                                className={`exam-list-item ${selectedDeckId === deck.id ? 'selected' : ''}`}
                                onClick={() => setSelectedDeckId(deck.id)}
                            >
                                {deck.name}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        );
    };

    const renderStepDate = () => (
        <div className="exam-onboarding-content">
            <p className="exam-onboarding-prompt">{t('exam.date_prompt')}</p>
            <input
                type="date"
                className="field-input exam-date-input"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
            />
            <p className="text-muted exam-date-hint">{t('exam.date_hint')}</p>
        </div>
    );

    const stepOneFooter = (
        <>
            <Button variant="secondary" onClick={handleClose}>
                {t('common.cancel')}
            </Button>
            <Button
                variant="primary"
                onClick={() => setStep('select-deck')}
                disabled={selectedExamId === null}
            >
                {t('exam.next')}
            </Button>
        </>
    );

    const stepDeckFooter = noDecks ? (
        <>
            <Button variant="secondary" onClick={handleClose}>
                {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleGoToDecks}>
                Go to Decks
            </Button>
        </>
    ) : (
        <>
            <Button variant="secondary" onClick={() => setStep('select-exam')}>
                {t('exam.back')}
            </Button>
            <Button
                variant="primary"
                onClick={() => setStep('pick-date')}
                disabled={selectedDeckId === null}
            >
                {t('exam.next')}
            </Button>
        </>
    );

    const stepDateFooter = (
        <>
            <Button variant="secondary" onClick={() => setStep('select-deck')}>
                {t('exam.back')}
            </Button>
            <Button
                variant="secondary"
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting}
            >
                {t('exam.date_skip')}
            </Button>
            <Button
                variant="primary"
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting || !examDate}
                isLoading={isSubmitting}
            >
                {t('exam.confirm')}
            </Button>
        </>
    );

    const stepTitles = {
        'select-exam': t('exam.onboarding_step_exam'),
        'select-deck': t('exam.onboarding_step_deck'),
        'pick-date': t('exam.onboarding_step_date'),
    };

    const stepFooters = {
        'select-exam': stepOneFooter,
        'select-deck': stepDeckFooter,
        'pick-date': stepDateFooter,
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={stepTitles[step]}
            footer={stepFooters[step]}
            size="md"
        >
            {step === 'select-exam' && renderStepOne()}
            {step === 'select-deck' && renderStepDeck()}
            {step === 'pick-date' && renderStepDate()}
        </Modal>
    );
}
