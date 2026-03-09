"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import './Navbar.css';

const NAV_SECTIONS = ['how-it-works', 'features', 'blueprints', 'compare'];

export default function Navbar() {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState('');

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
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

  return (
    <nav className="navbar">
      <div className="navbar-inner container">
        <Link href="/" className="navbar-logo">
          SEK<span>EL</span>
        </Link>

        <div className="navbar-links">
          {[
            { id: 'how-it-works', label: 'How It Works' },
            { id: 'features', label: 'Features' },
            { id: 'blueprints', label: 'Exams' },
            { id: 'compare', label: 'Compare' },
          ].map(({ id, label }) => (
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

        <Link href="/#waitlist" className="nav-cta" onClick={(e) => handleNavClick(e, 'waitlist')}>
          Join Waitlist
        </Link>
      </div>
    </nav>
  );
}
