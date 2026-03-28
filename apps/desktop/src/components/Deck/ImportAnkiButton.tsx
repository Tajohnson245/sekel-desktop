import { useState, useEffect, useRef } from 'react';
import { Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../UI';
import ImportOptionsModal from '../Import/ImportOptionsModal';
import ImportProgressModal from '../Import/ImportProgressModal';
import ImportSuccessModal from '../Import/ImportSuccessModal';
import ImportErrorModal from '../Import/ImportErrorModal';
import { useAuthStore } from '../../stores/authStore';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import type {
    ApkgImportResult,
    ImportSummary,
    ImportOptionsPayload,
    ImportOptionsDeck,
    ImportResult,
    ImportProgress,
    ImportStage,
} from '../../types/electron';

type Phase =
    | { name: 'idle' }
    | { name: 'loading' }
    | { name: 'options'; apkgResult: ApkgImportResult; summary: ImportSummary }
    | { name: 'progress'; progress: ImportProgress; tempDir: string; isCancelling: boolean }
    | { name: 'success'; result: ImportResult; deckOptions: ImportOptionsDeck[] }
    | { name: 'error'; error: Error; failedStage?: ImportStage };

interface ImportAnkiButtonProps {
    onSuccess: (result: ImportResult) => void;
}

export default function ImportAnkiButton({ onSuccess }: ImportAnkiButtonProps) {
    const [phase, setPhase] = useState<Phase>({ name: 'idle' });
    const { t } = useTranslation();
    const user = useAuthStore(s => s.user);
    const { goToDecks } = useAppNavigation();

    // Track the current failed stage for the error modal
    const lastStageRef = useRef<ImportStage | undefined>(undefined);

    // Subscribe to progress events while in 'progress' phase
    useEffect(() => {
        if (phase.name !== 'progress') return;

        const unsubscribe = window.electronAPI.import.onImportProgress((progress: ImportProgress) => {
            lastStageRef.current = progress.stage;
            setPhase(prev =>
                prev.name === 'progress'
                    ? { ...prev, progress }
                    : prev,
            );
        });

        return unsubscribe;
    }, [phase.name]);

    const handleClick = async () => {
        if (!user) return;
        setPhase({ name: 'loading' });
        lastStageRef.current = undefined;

        try {
            const filePath = await window.electronAPI.import.selectFile();
            if (filePath === null) {
                setPhase({ name: 'idle' });
                return;
            }

            const apkgResult = await window.electronAPI.import.processApkg(filePath);
            const summary = await window.electronAPI.import.getSummary({
                dbFilePath: apkgResult.dbFilePath,
                mediaMap: apkgResult.mediaMap,
                mediaFilePaths: apkgResult.mediaFilePaths,
                userId: user.id,
                tempDir: apkgResult.tempDir,
            });
            setPhase({ name: 'options', apkgResult, summary });
        } catch (err) {
            setPhase({ name: 'error', error: err instanceof Error ? err : new Error(t('import.errorGeneric')) });
        }
    };

    const handleConfirm = async (payload: Omit<ImportOptionsPayload, 'userId'>) => {
        const deckOptions: ImportOptionsDeck[] = payload.decks;
        const fullPayload: ImportOptionsPayload = { ...payload, userId: user!.id };
        setPhase({
            name: 'progress',
            progress: { stage: 'extracting-media', percent: 5 },
            tempDir: payload.tempDir,
            isCancelling: false,
        });
        lastStageRef.current = 'extracting-media';

        try {
            const result = await window.electronAPI.import.confirmImport(fullPayload);
            setPhase({ name: 'success', result, deckOptions });
            onSuccess(result);
        } catch (err) {
            const error = err instanceof Error ? err : new Error(t('import.errorGeneric'));
            setPhase({ name: 'error', error, failedStage: lastStageRef.current });
        }
    };

    const handleCancel = () => {
        if (phase.name !== 'progress') return;
        window.electronAPI.import.cancel(phase.tempDir);
        setPhase(prev => prev.name === 'progress' ? { ...prev, isCancelling: true } : prev);
    };

    const handleOptionsCancel = () => setPhase({ name: 'idle' });
    const handleClose = () => setPhase({ name: 'idle' });
    const handleRetry = () => setPhase({ name: 'idle' });

    return (
        <div className="import-anki-button-wrapper">
            <Button
                variant="secondary"
                icon={<Upload size={16} />}
                isLoading={phase.name === 'loading'}
                onClick={handleClick}
                disabled={phase.name !== 'idle' && phase.name !== 'loading'}
            >
                {t('import.importAnkiDeck')}
            </Button>

            {phase.name === 'options' && (
                <ImportOptionsModal
                    isOpen
                    summary={phase.summary}
                    mediaMap={phase.apkgResult.mediaMap}
                    mediaFilePaths={phase.apkgResult.mediaFilePaths}
                    tempDir={phase.apkgResult.tempDir}
                    onConfirm={handleConfirm}
                    onCancel={handleOptionsCancel}
                />
            )}

            {phase.name === 'progress' && (
                <ImportProgressModal
                    progress={phase.progress}
                    isCancelling={phase.isCancelling}
                    onCancel={handleCancel}
                />
            )}

            {phase.name === 'success' && (
                <ImportSuccessModal
                    result={phase.result}
                    deckOptions={phase.deckOptions}
                    onGoToDeck={goToDecks}
                    onClose={handleClose}
                />
            )}

            {phase.name === 'error' && (
                <ImportErrorModal
                    error={phase.error}
                    failedStage={phase.failedStage}
                    onRetry={handleRetry}
                    onClose={handleClose}
                />
            )}
        </div>
    );
}
