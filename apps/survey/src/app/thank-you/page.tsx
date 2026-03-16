import Link from "next/link";
import "./page.css";

export default function ThankYouPage() {
  return (
    <div className="thank-you">
      <div className="thank-you__inner">
        <div className="thank-you__icon" aria-hidden="true">✓</div>
        <h1 className="thank-you__title">Thank you!</h1>
        <p className="thank-you__message">
          Your feedback has been submitted. We read every response and it directly
          shapes what we build next.
        </p>
        <p className="thank-you__sub">
          If you left your email, we&apos;ll reach out when the beta is ready.
        </p>
        <Link href="/" className="thank-you__home-link">← Back to home</Link>
      </div>
    </div>
  );
}
