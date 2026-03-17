import { createPortal } from 'react-dom';
import { Button } from '../UI';
import type { ImportProgress, ImportStage } from '../../types/electron';

const STAGE_LABELS: Record<ImportStage, string> = {
    'extracting-media':    'Extracting media files',
    'inserting-decks':     'Importing decks',
    'inserting-note-types':'Importing note types',
    'inserting-notes':     'Importing notes',
    'inserting-cards':     'Importing cards',
    'inserting-reviews':   'Importing review history',
    'cleaning-up':         'Cleaning up',
    'complete':            'Complete',
};

interface ImportProgressModalProps {
    progress: ImportProgress;
    isCancelling: boolean;
    onCancel: () => void;
}

export default function ImportProgressModal({ progress, isCancelling, onCancel }: ImportProgressModalProps) {
    return createPortal(
        <div className="modal-overlay">
            <div
                className="modal max-w-lg"
                role="dialog"
                aria-modal="true"
                aria-labelledby="import-progress-title"
                style={{ width: '100%' }}
            >
                <div className="modal-header">
                    <h2 id="import-progress-title">Importing Deck</h2>
                </div>

                <div className="modal-content">
                    <div className="import-progress-body">
                        <p className="import-progress-stage">
                            {STAGE_LABELS[progress.stage] ?? progress.stage}
                        </p>
                        {progress.detail && (
                            <p className="import-progress-detail">{progress.detail}</p>
                        )}
                        <div className="import-progress-bar-track">
                            <div
                                className="import-progress-bar-fill"
                                style={{ width: `${progress.percent}%` }}
                                role="progressbar"
                                aria-valuenow={progress.percent}
                                aria-valuemin={0}
                                aria-valuemax={100}
                            />
                        </div>
                    </div>
                </div>

                <div className="modal-actions">
                    <Button
                        variant="danger"
                        onClick={onCancel}
                        disabled={isCancelling}
                        isLoading={isCancelling}
                    >
                        {isCancelling ? 'Cancelling…' : 'Cancel'}
                    </Button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
