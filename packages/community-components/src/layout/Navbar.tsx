"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Moon, Menu, X, BookOpen } from "lucide-react";
import "./Navbar.css";

export default function Navbar() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sekel-community-theme");
    if (stored === "light") {
      setTheme("light");
      document.documentElement.dataset.theme = "light";
    }
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "light") {
      document.documentElement.dataset.theme = "light";
      localStorage.setItem("sekel-community-theme", "light");
    } else {
      delete document.documentElement.dataset.theme;
      localStorage.setItem("sekel-community-theme", "dark");
    }
  };

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/decks", label: "Browse Decks" },
    { href: "/add", label: "Add Deck" },
  ];

  return (
    <header className="community-navbar">
      <div className="container community-navbar__inner">
        <Link href="/" className="community-navbar__logo" aria-label="SEKEL Community home">
          SEK<span>EL</span>
          <span className="community-navbar__logo-tag">Community</span>
        </Link>

        <nav className="community-navbar__links" aria-label="Main navigation">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`community-navbar__link${pathname === link.href ? " community-navbar__link--active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="community-navbar__actions">
          <button
            className="community-navbar__icon-btn"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "dark" ? (
              <Moon size={18} aria-hidden="true" />
            ) : (
              <Sun size={18} aria-hidden="true" />
            )}
          </button>

          <Link href="/add" className="community-navbar__cta">
            <BookOpen size={15} aria-hidden="true" />
            Add Deck
          </Link>

          <button
            className="community-navbar__hamburger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="community-navbar__mobile-menu" aria-label="Mobile navigation">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`community-navbar__mobile-link${pathname === link.href ? " community-navbar__mobile-link--active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
