import Link from 'next/link';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          {/* Brand */}
          <div className="footer-brand-col">
            <Link href="/" className="footer-logo-link">
              SEK<span>EL</span>
            </Link>
            <p className="footer-desc">
              AI-powered study prioritization for medical students. Built on official exam blueprints and
              your personal performance data.
            </p>
          </div>

          {/* Product */}
          <div className="footer-links-col">
            <h4 className="footer-heading">Product</h4>
            <ul className="footer-links">
              <li><Link href="/#how-it-works">How It Works</Link></li>
              <li><Link href="/#features">Features</Link></li>
              <li><Link href="/#blueprints">Supported Exams</Link></li>
              <li><Link href="/#compare">Compare</Link></li>
            </ul>
          </div>

          {/* Exams */}
          <div className="footer-links-col">
            <h4 className="footer-heading">Exams</h4>
            <ul className="footer-links">
              <li><a href="#">USMLE Step 1</a></li>
              <li><a href="#">USMLE Step 2 CK</a></li>
              <li><a href="#">NBME Shelf Exams</a></li>
              <li><a href="#">NCLEX-RN</a></li>
            </ul>
          </div>

          {/* Company */}
          <div className="footer-links-col">
            <h4 className="footer-heading">Company</h4>
            <ul className="footer-links">
              <li><a href="#">About</a></li>
              <li><a href="#">Blog</a></li>
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms of Service</a></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>&copy; 2026 SEKEL. All rights reserved.</span>
          <div className="footer-bottom-links">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
