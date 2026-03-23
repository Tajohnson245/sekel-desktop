import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import './privacy.css';

export const metadata: Metadata = {
  title: 'Privacy Policy — SEKEL',
  description: 'How SEKEL collects, uses, and protects your data.',
};

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="container">
        <Link href="/" className="legal-back">
          <ArrowLeft size={16} />
          Back to home
        </Link>

        <div className="legal-header">
          <span className="section-label">Legal</span>
          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-meta">Last updated: March 2026</p>
        </div>

        <div className="legal-body">
          <section className="legal-section">
            <h2>Overview</h2>
            <p>
              SEKEL (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This
              policy explains what information we collect, how we use it, and your rights regarding your data.
              SEKEL is a local-first application — the vast majority of your study data never leaves your device.
            </p>
          </section>

          <section className="legal-section">
            <h2>Information We Collect</h2>
            <h3>Information you provide</h3>
            <ul>
              <li>Email address when you join the waitlist or create an account</li>
              <li>Exam type and target test date you configure in the app</li>
            </ul>
            <h3>Data stored locally on your device</h3>
            <ul>
              <li>Flashcard decks, cards, and media you create or import</li>
              <li>Your review history and FSRS scheduling data</li>
              <li>Performance statistics and accuracy metrics</li>
            </ul>
            <h3>Data synced to the cloud (optional)</h3>
            <p>
              If you enable cloud sync, your card data and review history are encrypted and stored via Supabase.
              Sync is opt-in and can be disabled at any time. You can delete your cloud data from the app settings.
            </p>
          </section>

          <section className="legal-section">
            <h2>How We Use Your Information</h2>
            <ul>
              <li>To send beta access notifications and product updates to waitlist members</li>
              <li>To sync your data across devices when you opt in to cloud sync</li>
              <li>To improve the AI prioritization model using aggregated, anonymized performance signals (only with explicit consent)</li>
              <li>To respond to support requests</li>
            </ul>
            <p>We do not sell your personal information. We do not use your data for advertising.</p>
          </section>

          <section className="legal-section">
            <h2>Data Storage and Security</h2>
            <p>
              Your local data is stored in a SQLite database on your device and is never transmitted without
              your action. Cloud-synced data is stored on Supabase infrastructure with encryption at rest
              and in transit. We use industry-standard security practices and access controls.
            </p>
          </section>

          <section className="legal-section">
            <h2>Third-Party Services</h2>
            <p>SEKEL uses the following third-party services:</p>
            <ul>
              <li><strong>Supabase</strong> — optional cloud sync and authentication</li>
              <li><strong>OpenAI</strong> — AI card generation (your content is processed per OpenAI&apos;s data use policies; not used for training without consent)</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Access the personal data we hold about you</li>
              <li>Request deletion of your account and associated cloud data</li>
              <li>Export your card data at any time from the app</li>
              <li>Opt out of any non-essential communications</li>
            </ul>
            <p>
              To exercise any of these rights, reach out through the waitlist form on the home page.
            </p>
          </section>

          <section className="legal-section">
            <h2>Changes to This Policy</h2>
            <p>
              We may update this policy as the product evolves. We will notify registered users of material
              changes via email. Continued use of SEKEL after changes take effect constitutes acceptance of
              the updated policy.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
