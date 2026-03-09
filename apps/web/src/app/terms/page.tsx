import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import '../privacy/privacy.css';

export const metadata: Metadata = {
  title: 'Terms of Service — SEKEL',
  description: 'Terms and conditions for using SEKEL.',
};

export default function TermsPage() {
  return (
    <div className="legal-page">
      <div className="container">
        <Link href="/" className="legal-back">
          <ArrowLeft size={16} />
          Back to home
        </Link>

        <div className="legal-header">
          <span className="section-label">Legal</span>
          <h1 className="legal-title">Terms of Service</h1>
          <p className="legal-meta">Last updated: March 2026</p>
        </div>

        <div className="legal-body">
          <section className="legal-section">
            <h2>Acceptance of Terms</h2>
            <p>
              By downloading, installing, or using SEKEL (&quot;the app&quot; or &quot;the service&quot;), you agree to be
              bound by these Terms of Service. If you do not agree to these terms, do not use SEKEL.
            </p>
            <p>
              SEKEL is currently in beta. Features, pricing, and policies may change. We will notify
              registered users of material changes.
            </p>
          </section>

          <section className="legal-section">
            <h2>Use of the Service</h2>
            <h3>Permitted use</h3>
            <p>
              SEKEL is licensed for personal, non-commercial use. You may use the app to create, study, and
              manage flashcard decks for your own educational purposes.
            </p>
            <h3>Prohibited use</h3>
            <ul>
              <li>Reselling, sublicensing, or redistributing SEKEL or its content</li>
              <li>Using the app to generate content for commercial sale</li>
              <li>Attempting to reverse-engineer, decompile, or extract source code</li>
              <li>Circumventing any technical limitations or access controls</li>
              <li>Using the service in a way that violates applicable laws or regulations</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>Your Content</h2>
            <p>
              You retain ownership of all flashcard content you create within SEKEL. By enabling cloud
              sync, you grant us a limited license to store and transmit your content solely for the purpose
              of providing the sync service.
            </p>
            <p>
              You are responsible for ensuring that any content you import or create does not infringe on
              third-party intellectual property rights.
            </p>
          </section>

          <section className="legal-section">
            <h2>Beta Software</h2>
            <p>
              SEKEL is currently in beta development. The service is provided &quot;as is&quot; and may contain bugs,
              incomplete features, or unexpected behavior. We make no guarantees about uptime, data
              retention, or feature availability during the beta period.
            </p>
            <p>
              We recommend keeping local backups of important card data. You can export your decks at any
              time from the app settings.
            </p>
          </section>

          <section className="legal-section">
            <h2>AI-Generated Content</h2>
            <p>
              SEKEL uses AI to generate flashcard suggestions from your study materials. AI-generated content
              may contain errors, omissions, or inaccuracies. Always review AI-generated cards before using
              them for high-stakes exam preparation. SEKEL is not liable for errors in AI-generated content.
            </p>
          </section>

          <section className="legal-section">
            <h2>Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, SEKEL and its creators are not liable for any indirect,
              incidental, consequential, or punitive damages arising from your use of the service, including
              but not limited to exam outcomes, data loss, or service interruptions.
            </p>
            <p>
              Our total liability to you for any claim arising from these terms shall not exceed the amount
              you paid for the service in the twelve months preceding the claim.
            </p>
          </section>

          <section className="legal-section">
            <h2>Termination</h2>
            <p>
              You may stop using SEKEL at any time. We may suspend or terminate access to the service if you
              violate these terms. Upon termination, your right to use the service ceases. You may export
              your local data before termination.
            </p>
          </section>

          <section className="legal-section">
            <h2>Governing Law</h2>
            <p>
              These terms are governed by the laws of the United States. Any disputes arising from these
              terms will be resolved through binding arbitration, except where prohibited by law.
            </p>
          </section>

          <section className="legal-section">
            <h2>Contact</h2>
            <p>
              Questions about these terms? Email{' '}
              <a href="mailto:legal@sekel.app">legal@sekel.app</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
