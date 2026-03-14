"use client";

import { useEffect } from "react";
import Link from "next/link";
import "./Footer.css";

export default function Footer() {
  useEffect(() => {
    const stored = localStorage.getItem("sekel-community-theme");
    if (stored === "light") {
      document.documentElement.dataset.theme = "light";
    } else {
      delete document.documentElement.dataset.theme;
    }
  }, []);

  return (
    <footer className="community-footer">
      <div className="container community-footer__inner">
        <div className="community-footer__brand">
          <Link href="/" className="community-footer__logo">
            SEK<span>EL</span>
          </Link>
          <p className="community-footer__tagline">Community Deck Hub</p>
        </div>

        <nav className="community-footer__links" aria-label="Footer navigation">
          <Link href="#">Terms</Link>
          <Link href="#">Privacy</Link>
          <Link href="#">About</Link>
        </nav>

        <p className="community-footer__copy">&copy; 2026 SEKEL. All rights reserved.</p>
      </div>
    </footer>
  );
}
