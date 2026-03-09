"use client";

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import Link from 'next/link';
import './Footer.css';

export default function Footer() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const stored = localStorage.getItem('sekel-theme');
    if (stored === 'light') {
      setTheme('light');
      document.documentElement.dataset.theme = 'light';
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (next === 'light') {
      document.documentElement.dataset.theme = 'light';
      localStorage.setItem('sekel-theme', 'light');
    } else {
      delete document.documentElement.dataset.theme;
      localStorage.setItem('sekel-theme', 'dark');
    }
  };

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
            <h4 className="footer-heading">Legal</h4>
            <ul className="footer-links">
              <li><Link href="/privacy">Privacy Policy</Link></li>
              <li><Link href="/terms">Terms of Service</Link></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>&copy; 2026 SEKEL. All rights reserved.</span>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={12} aria-hidden="true" /> : <Moon size={12} aria-hidden="true" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </div>
    </footer>
  );
}
