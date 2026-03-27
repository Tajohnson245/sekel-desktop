import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Loader, useToast } from '../UI';
import { useExamList, useUpsertExamProfile, fetchAllCardIds } from '../../hooks/useExamProfile';
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
    const upsertProfile = useUpsertExamProfile();

    const [step, setStep] = useState<'select-exam' | 'pick-date'>('select-exam');
    const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
    const [examDate, setExamDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const selectedExam = exams.find(e => e.id === selectedExamId);

    const handleReset = () => {
        setStep('select-exam');
        setSelectedExamId(null);
        setExamDate('');
        setIsSubmitting(false);
    };

    const handleClose = () => {
        handleReset();
        onClose();
    };

    const handleSubmit = async (skipDate: boolean) => {
        if (!userId || !selectedExamId || !selectedExam) return;
        setIsSubmitting(true);

        try {
            const dateValue = skipDate ? null : examDate || null;
            await upsertProfile.mutateAsync({
                userId,
                examId: selectedExamId,
                examDate: dateValue,
            });

            // Fire-and-forget background classification
            const cardIds = await fetchAllCardIds(userId);
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

    const renderStepTwo = () => (
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
                onClick={() => setStep('pick-date')}
                disabled={selectedExamId === null}
            >
                {t('exam.next')}
            </Button>
        </>
    );

    const stepTwoFooter = (
        <>
            <Button variant="secondary" onClick={() => setStep('select-exam')}>
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

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={step === 'select-exam' ? t('exam.onboarding_step_exam') : t('exam.onboarding_step_date')}
            footer={step === 'select-exam' ? stepOneFooter : stepTwoFooter}
            size="md"
        >
            {step === 'select-exam' ? renderStepOne() : renderStepTwo()}
        </Modal>
    );
}
