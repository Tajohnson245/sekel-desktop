import { useEffect } from 'react';
import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router-dom';
import * as Sentry from '@sentry/electron/renderer';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import i18n from '../i18n';
import '../components/UI/ErrorBoundary.css';

function toError(error: unknown): Error {
    if (error instanceof Error) return error;
    if (isRouteErrorResponse(error)) return new Error(`Route error ${error.status}: ${error.statusText}`);
    return new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

/**
 * Router-level error screen (React Router `errorElement`). Errors thrown while
 * rendering a route are caught by the data router itself — they never reach a
 * class ErrorBoundary above <RouterProvider> — so without this every page crash
 * showed React Router's built-in "Unexpected Application Error!" and nothing
 * reached Sentry.
 *
 * `inline` is used inside the app layout (sidebar stays usable); the root
 * variant replaces the whole window when the layout itself fails.
 */
export default function RouteErrorScreen({ inline = false }: { inline?: boolean }) {
    const routeError = useRouteError();
    const navigate = useNavigate();
    const location = useLocation();
    const error = toError(routeError);
    const t = i18n.t.bind(i18n);

    useEffect(() => {
        Sentry.withScope((scope) => {
            scope.setTag('boundary', inline ? 'route' : 'root-route');
            scope.setContext('route', { pathname: location.pathname, search: location.search });
            Sentry.captureException(toError(routeError));
        });
    }, [routeError, inline, location.pathname, location.search]);

    // Re-navigating to the same location clears the data router's error state
    // and remounts the route.
    const retry = () => navigate(`${location.pathname}${location.search}`, { replace: true });

    return (
        <div className={`error-boundary ${inline ? 'error-boundary--inline' : 'error-boundary--page'}`} role="alert">
            <AlertTriangle size={inline ? 32 : 48} className="error-boundary__icon" />
            <h2 className="error-boundary__title">{t(inline ? 'error_boundary.inline_title' : 'error_boundary.page_title')}</h2>
            <p className="error-boundary__message">{t(inline ? 'error_boundary.inline_message' : 'error_boundary.page_message')}</p>
            <details className="error-boundary__details">
                <summary>{t('error_boundary.inline_title')}</summary>
                <pre>{error.message}</pre>
            </details>
            <div className="error-boundary__actions">
                {inline ? (
                    <>
                        <button className="btn btn-primary" onClick={retry}>
                            <RefreshCw size={16} />
                            {t('error_boundary.retry')}
                        </button>
                        <button className="btn btn-secondary" onClick={() => navigate('/')}>
                            <ArrowLeft size={16} />
                            {t('error_boundary.go_back')}
                        </button>
                    </>
                ) : (
                    <button className="btn btn-primary" onClick={() => window.location.reload()}>
                        <RefreshCw size={16} />
                        {t('error_boundary.reload')}
                    </button>
                )}
            </div>
        </div>
    );
}
