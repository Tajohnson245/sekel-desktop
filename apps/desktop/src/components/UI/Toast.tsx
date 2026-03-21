import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';
import './Toast.css';

type ToastVariant = 'success' | 'error';

interface Toast {
    id: number;
    message: string;
    variant: ToastVariant;
}

interface ToastContextValue {
    showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, variant: ToastVariant = 'success') => {
        const id = nextId++;
        setToasts(prev => [...prev, { id, message, variant }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const dismiss = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="toast-container" role="status" aria-live="polite">
                {toasts.map(toast => (
                    <div key={toast.id} className={`toast toast--${toast.variant}`}>
                        {toast.variant === 'success' ? (
                            <CheckCircle size={16} />
                        ) : (
                            <AlertCircle size={16} />
                        )}
                        <span className="toast__message">{toast.message}</span>
                        <button className="toast__close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}
