"use client";

import { useState } from 'react';
import { Monitor, Apple } from 'lucide-react';
import './Waitlist.css';

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function Waitlist() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [fieldError, setFieldError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError('');

    if (!email.trim()) {
      setFieldError('Please enter your email address.');
      return;
    }

    setStatus('loading');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const json = await res.json();

      if (res.ok) {
        setStatus('success');
      } else if (res.status === 400) {
        setFieldError(json.error ?? 'Invalid email address.');
        setStatus('idle');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <section id="waitlist" className="waitlist-section">
      <div className="waitlist-orb" aria-hidden="true"></div>

      <div className="container waitlist-container">
        <h2 className="waitlist-headline reveal">
          Study <em>smarter</em> before your next shelf.
        </h2>

        <p className="waitlist-subheadline reveal reveal-delay-1">
          SEKEL is in development and opening to beta users soon. Join the waitlist to be first in line
          — and to help shape what gets built next.
        </p>

        <form className="waitlist-form reveal reveal-delay-2" onSubmit={handleSubmit} noValidate>
          <label htmlFor="waitlist-email" className="sr-only">Email address</label>
          <input
            type="email"
            id="waitlist-email"
            className={`waitlist-input${fieldError ? ' input-error' : ''}`}
            placeholder="your@email.edu"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldError) setFieldError('');
            }}
            disabled={status === 'loading'}
            aria-describedby={fieldError ? 'waitlist-error' : undefined}
          />
          <button type="submit" className="waitlist-btn" disabled={status === 'loading' || status === 'success'}>
            {status === 'loading' ? 'Joining…' : status === 'success' ? 'Joined!' : 'Join Waitlist'}
          </button>
          {fieldError && (
            <p id="waitlist-error" className="waitlist-field-error" role="alert">{fieldError}</p>
          )}
        </form>

        {status === 'success' && (
          <p className="waitlist-confirm" role="status">
            You&apos;re on the list — check your inbox. If you don&apos;t see it, check your spam folder.
          </p>
        )}

        {status === 'error' && (
          <p className="waitlist-field-error" role="alert">
            Something went wrong. Please try again.
          </p>
        )}

        <p className="waitlist-note reveal reveal-delay-3">No spam. No credit card. Just early access.</p>

        <div className="waitlist-badges reveal">
          <span className="platform-badge"><Monitor size={13} /> Windows</span>
          <span className="platform-badge"><Apple size={13} /> macOS</span>
        </div>
      </div>
    </section>
  );
}
