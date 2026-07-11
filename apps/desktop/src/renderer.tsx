import * as Sentry from '@sentry/electron/renderer';
import React from 'react';
import ReactDOM from 'react-dom/client';
// Ink v2 brand faces, bundled offline via @fontsource (spec §3.1) — no CDN.
// Display=Lora, Body=Inter, Mono=Roboto Mono; only the shipped weights.
import '@fontsource/lora/400.css';
import '@fontsource/lora/500.css';
import '@fontsource/lora/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/roboto-mono/400.css';
import '@fontsource/roboto-mono/500.css';
import App from './App';
import './index.css';
import './styles/ink-components.css';
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
