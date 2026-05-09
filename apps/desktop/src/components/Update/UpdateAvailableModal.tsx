import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Modal, Button } from '../UI';
import type { UpdateDownloadedPayload } from '../../types/electron';
import './Update.css';

export default function UpdateAvailableModal() {
    const [payload, setPayload] = useState<UpdateDownloadedPayload | null>(null);
    const [installing, setInstalling] = useState(false);

    useEffect(() => {
        return window.electronAPI.update.onDownloaded((data) => setPayload(data));
    }, []);

    if (!payload) return null;

    const tag = payload.version.startsWith('v') ? payload.version : `v${payload.version}`;
    const hasNotes = Boolean(payload.notes && payload.notes.trim().length > 0);

    const handleInstall = async () => {
        setInstalling(true);
        try {
            await window.electronAPI.update.install();
        } catch {
            setInstalling(false);
        }
    };

    const footer = (
        <>
            <Button variant="secondary" onClick={() => setPayload(null)} disabled={installing}>
                Later
            </Button>
            <Button variant="primary" onClick={handleInstall} disabled={installing}>
                {installing ? 'Restarting…' : 'Install & Restart'}
            </Button>
        </>
    );

    return (
        <Modal
            isOpen
            title={`Update available — ${tag}`}
            onClose={() => setPayload(null)}
            size="md"
            footer={footer}
        >
            <div className="update-modal-body">
                <p className="update-modal-intro">
                    {hasNotes
                        ? 'A new version of Sekel has been downloaded. Here’s what changed:'
                        : 'A new version of Sekel has been downloaded.'}
                </p>

                {hasNotes && (
                    <div className="update-notes-content">
                        <ReactMarkdown
                            components={{
                                // Force every link to open in the OS browser.
                                // setWindowOpenHandler in main.ts intercepts the
                                // resulting window.open() and routes it via
                                // shell.openExternal — keeps the renderer from
                                // navigating away from the app.
                                a: ({ href, children }) => (
                                    <a href={href} target="_blank" rel="noopener noreferrer">
                                        {children}
                                    </a>
                                ),
                            }}
                        >
                            {payload.notes!}
                        </ReactMarkdown>
                    </div>
                )}
            </div>
        </Modal>
    );
}
