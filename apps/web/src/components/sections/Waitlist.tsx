"use client";

import { useState } from 'react';
import './Waitlist.css';

export default function Waitlist() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError(true);
      return;
    }
    setError(false);
    setSubmitted(true);
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

        {submitted ? (
          <p className="waitlist-confirm reveal">You&apos;re on the list. We&apos;ll be in touch.</p>
        ) : (
          <form className="waitlist-form reveal reveal-delay-2" onSubmit={handleSubmit}>
            <input
              type="email"
              id="emailInput"
              className={`waitlist-input${error ? ' input-error' : ''}`}
              placeholder="your@email.edu"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(false);
              }}
            />
            <button type="submit" className="waitlist-btn">Join Waitlist</button>
          </form>
        )}

        <p className="waitlist-note reveal reveal-delay-3">No spam. No credit card. Just early access.</p>

        <div className="waitlist-badges reveal">
          <span className="platform-badge">🪟 Windows</span>
          <span className="platform-badge">🍎 macOS</span>
        </div>
      </div>
    </section>
  );
}
