import React from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import i18n from '../../i18n';
import './ErrorBoundary.css';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    variant?: 'page' | 'inline';
    onReset?: (error: Error) => void;
    fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    resetCount: number;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null, resetCount: 0 };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        console.error('[ErrorBoundary] Caught error:', error);
        console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    }

    handleRetry = (): void => {
        this.setState(prev => ({ hasError: false, error: null, resetCount: prev.resetCount + 1 }));
    };

    handleGoBack = (): void => {
        const { onReset } = this.props;
        const { error } = this.state;
        this.setState(prev => ({ hasError: false, error: null, resetCount: prev.resetCount + 1 }));
        if (onReset && error) {
            onReset(error);
        }
    };

    render() {
        if (!this.state.hasError) {
            return (
                <React.Fragment key={this.state.resetCount}>
                    {this.props.children}
                </React.Fragment>
            );
        }

        const { fallback, variant = 'page' } = this.props;
        const error = this.state.error!;

        if (typeof fallback === 'function') {
            return fallback(error, this.handleRetry);
        }
        if (fallback) {
            return fallback;
        }

        const t = i18n.t.bind(i18n);

        if (variant === 'page') {
            return (
                <div className="error-boundary error-boundary--page">
                    <AlertTriangle size={48} className="error-boundary__icon" />
                    <h2 className="error-boundary__title">{t('error_boundary.page_title')}</h2>
                    <p className="error-boundary__message">{t('error_boundary.page_message')}</p>
                    <details className="error-boundary__details">
                        <summary>{t('error_boundary.inline_title')}</summary>
                        <pre>{error.message}</pre>
                    </details>
                    <div className="error-boundary__actions">
                        <button className="btn btn-primary" onClick={this.handleGoBack}>
                            <RefreshCw size={16} />
                            {t('error_boundary.reload')}
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="error-boundary error-boundary--inline">
                <AlertTriangle size={32} className="error-boundary__icon" />
                <h3 className="error-boundary__title">{t('error_boundary.inline_title')}</h3>
                <p className="error-boundary__message">{t('error_boundary.inline_message')}</p>
                <div className="error-boundary__actions">
                    <button className="btn btn-primary" onClick={this.handleRetry}>
                        <RefreshCw size={16} />
                        {t('error_boundary.retry')}
                    </button>
                    {this.props.onReset && (
                        <button className="btn btn-secondary" onClick={this.handleGoBack}>
                            <ArrowLeft size={16} />
                            {t('error_boundary.go_back')}
                        </button>
                    )}
                </div>
            </div>
        );
    }
}
