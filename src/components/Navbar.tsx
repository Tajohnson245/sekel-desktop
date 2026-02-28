"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layers } from 'lucide-react';
import './Navbar.css';

export default function Navbar() {
    const pathname = usePathname();

    const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
        // If we are already on the home page, prevent the URL hash and smooth scroll manually
        if (pathname === '/') {
            e.preventDefault();
            const element = document.getElementById(targetId);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth' });
                // Clean up any existing hash
                window.history.replaceState(null, '', '/');
            }
        }
        // If not on the home page, the standard Link href="/#target" will navigate
    };

    return (
        <nav className="navbar glass-panel">
            <div className="navbar-container container">
                <Link href="/" className="navbar-brand">
                    <Layers className="navbar-logo" size={24} />
                    <span className="navbar-name">Better Anki</span>
                </Link>

                <div className="navbar-links">
                    <Link href="/#features" className="nav-link" onClick={(e) => handleNavClick(e, 'features')}>Features</Link>
                    <Link href="/#compare" className="nav-link" onClick={(e) => handleNavClick(e, 'compare')}>Compare</Link>
                    <Link href="/#faq" className="nav-link" onClick={(e) => handleNavClick(e, 'faq')}>FAQ</Link>
                </div>

                <div className="navbar-actions">
                    <Link href="/download" className="btn btn-primary">
                        Get Better Anki
                    </Link>
                </div>
            </div>
        </nav>
    );
}
