import * as Sentry from '@sentry/electron/renderer';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';

Sentry.init({
    dsn: 'https://cacb0014cc3c9ce493a71a738929f415@o4511351709171712.ingest.us.sentry.io/4511351710285824',
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    release: __APP_VERSION__,
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
