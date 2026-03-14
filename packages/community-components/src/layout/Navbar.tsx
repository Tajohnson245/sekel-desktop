"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogIn } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import "./Navbar.css";

interface NavbarProps {
  user?: User | null;
  onSignOut?: () => void;
}

export default function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const baseLinks = [
    { href: "/", label: "Home" },
    { href: "/decks", label: "Browse Decks" },
  ];

  const userEmail = user?.email ?? "";
  const userInitial = userEmail.charAt(0).toUpperCase();

  return (
    <header className="community-navbar">
      <div className="container community-navbar__inner">
        <Link href="/" className="community-navbar__logo" aria-label="SEKEL Community home">
          SEK<span>EL</span>
          <span className="community-navbar__logo-tag">Community</span>
        </Link>

        <nav className="community-navbar__links" aria-label="Main navigation">
          {baseLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`community-navbar__link${pathname === link.href ? " community-navbar__link--active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
          {user && (
            <Link
              href="/add"
              className={`community-navbar__link${pathname === "/add" ? " community-navbar__link--active" : ""}`}
            >
              Add Deck
            </Link>
          )}
        </nav>

        <div className="community-navbar__actions">
          {user ? (
            <Link href="/account" className="community-navbar__avatar" title={userEmail} aria-label={`Account settings for ${userEmail}`}>
              {userInitial}
            </Link>
          ) : (
            <>
              <Link href="/login" className="community-navbar__auth-link">
                <LogIn size={15} aria-hidden="true" />
                Log in
              </Link>
              <Link href="/signup" className="community-navbar__cta">
                Sign up
              </Link>
            </>
          )}

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
          {baseLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`community-navbar__mobile-link${pathname === link.href ? " community-navbar__mobile-link--active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
          <div className="community-navbar__mobile-auth">
            {user ? (
              <>
                <Link href="/add" className="community-navbar__mobile-link">Add Deck</Link>
                <Link href="/account" className="community-navbar__mobile-link">Account</Link>
              </>
            ) : (
              <>
                <Link href="/login" className="community-navbar__mobile-link">Log in</Link>
                <Link href="/signup" className="community-navbar__mobile-link">Sign up</Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
