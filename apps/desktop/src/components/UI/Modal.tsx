import { useEffect, ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal = ({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) => {
    const { t } = useTranslation();

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEsc);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const sizeClasses = {
        sm: 'max-w-md',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl'
    };

    // Fallback for size if class lookup fails (though with TS it shouldn't)
    const maxWidthClass = sizeClasses[size] || sizeClasses.md;

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div
                className={`modal ${maxWidthClass}`}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
                style={{ width: '100%' }} // Ensure it takes width up to max-width
            >
                <div className="modal-header">
                    <h2 id="modal-title">{title}</h2>
                    <button
                        className="btn-icon"
                        onClick={onClose}
                        aria-label={t('common.close', 'Close')}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-content">
                    {children}
                </div>

                {footer && (
                    <div className="modal-actions">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
