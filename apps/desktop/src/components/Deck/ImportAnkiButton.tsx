import { useState } from 'react';
import { Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../UI';
import ImportOptionsModal from '../Import/ImportOptionsModal';
import { useAuthStore } from '../../stores/authStore';
import type { ApkgImportResult, ImportSummary, ImportOptionsPayload, ImportResult } from '../../types/electron';

interface ImportAnkiButtonProps {
    onSuccess: (result: ImportResult) => void;
}

export default function ImportAnkiButton({ onSuccess }: ImportAnkiButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [apkgResult, setApkgResult] = useState<ApkgImportResult | null>(null);
    const [summary, setSummary] = useState<ImportSummary | null>(null);
    const [showModal, setShowModal] = useState(false);
    const { t } = useTranslation();
    const user = useAuthStore(s => s.user);

    const handleClick = async () => {
        setIsLoading(true);
        setError(null);

        try {
            if (!user) {
                setError(t('import.errorNotLoggedIn'));
                return;
            }

            const filePath = await window.electronAPI.import.selectFile();
            if (filePath === null) return; // user cancelled dialog

            const result = await window.electronAPI.import.processApkg(filePath);
            setApkgResult(result);

            const importSummary = await window.electronAPI.import.getSummary({
                dbFilePath: result.dbFilePath,
                mediaMap: result.mediaMap,
                mediaFilePaths: result.mediaFilePaths,
                userId: user.id,
                tempDir: result.tempDir,
            });
            setSummary(importSummary);
            setShowModal(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : t('import.errorGeneric');
            setError(message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirm = async (payload: Omit<ImportOptionsPayload, 'userId'>) => {
        try {
            const result = await window.electronAPI.import.confirmImport({
                ...payload,
                userId: user!.id,
            });
            setShowModal(false);
            setSummary(null);
            setApkgResult(null);
            onSuccess(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : t('import.errorGeneric');
            setError(message);
            setShowModal(false);
        }
    };

    const handleCancel = () => {
        setShowModal(false);
        setSummary(null);
        setApkgResult(null);
        // tempDir cleanup is deferred to cleanupStaleTempDirs() on next app start
    };

    return (
        <div className="import-anki-button-wrapper">
            <Button
                variant="secondary"
                icon={<Upload size={16} />}
                isLoading={isLoading}
                onClick={handleClick}
            >
                {t('import.importAnkiDeck')}
            </Button>
            {error && <p className="import-anki-error">{error}</p>}

            {showModal && summary && apkgResult && (
                <ImportOptionsModal
                    isOpen={showModal}
                    summary={summary}
                    mediaMap={apkgResult.mediaMap}
                    mediaFilePaths={apkgResult.mediaFilePaths}
                    tempDir={apkgResult.tempDir}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                />
            )}
        </div>
    );
}
