import { useState } from 'react';
import { Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../UI';
import type { ApkgImportResult } from '../../types/electron';

interface ImportAnkiButtonProps {
    onSuccess: (result: ApkgImportResult) => void;
}

export default function ImportAnkiButton({ onSuccess }: ImportAnkiButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { t } = useTranslation();

    const handleClick = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const filePath = await window.electronAPI.import.selectFile();
            if (filePath === null) return; // user cancelled dialog

            const result = await window.electronAPI.import.processApkg(filePath);
            onSuccess(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : t('import.errorGeneric');
            setError(message);
        } finally {
            setIsLoading(false);
        }
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
        </div>
    );
}
