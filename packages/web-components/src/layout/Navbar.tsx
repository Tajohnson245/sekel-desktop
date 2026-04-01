"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import './Navbar.css';

const NAV_LINKS = [
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'ai-cards', label: 'AI Cards' },
  { id: 'blueprints', label: 'Exams' },
  { id: 'study-plan', label: 'Study Plan' },
];

const NAV_SECTIONS = NAV_LINKS.map(l => l.id);

export default function Navbar() {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    setMenuOpen(false);
    if (pathname === '/') {
      e.preventDefault();
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        window.history.replaceState(null, '', '/');
      }
    }
  };

  useEffect(() => {
    const onScroll = () => {
      let current = '';
      for (const id of NAV_SECTIONS) {
        const section = document.getElementById(id);
        if (section && window.scrollY >= section.offsetTop - 100) {
          current = id;
        }
      }
      setActiveSection(current);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.navbar')) setMenuOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuOpen]);

  return (
    <nav className="navbar">
      <div className="navbar-inner container">
        <Link href="/" className="navbar-logo">
          SEK<span>EL</span>
        </Link>

        <div className="navbar-links">
          {NAV_LINKS.map(({ id, label }) => (
            <Link
              key={id}
              href={`/#${id}`}
              className={`nav-link${activeSection === id ? ' active' : ''}`}
              onClick={(e) => handleNavClick(e, id)}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="navbar-right">
          <button
            className={`nav-hamburger${menuOpen ? ' is-open' : ''}`}
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
          </button>

          <Link href="/download" className="nav-cta">
            Download Beta
          </Link>
        </div>
      </div>

      <div className={`nav-mobile-menu${menuOpen ? ' nav-mobile-menu--open' : ''}`} aria-hidden={!menuOpen}>
        {NAV_LINKS.map(({ id, label }) => (
          <Link
            key={id}
            href={`/#${id}`}
            className={`nav-mobile-link${activeSection === id ? ' active' : ''}`}
            onClick={(e) => handleNavClick(e, id)}
          >
            {label}
          </Link>
        ))}
        <Link href="/download" className="nav-mobile-cta">
          Download Beta
        </Link>
      </div>
    </nav>
  );
}
