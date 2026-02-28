import Link from 'next/link';
import { Layers } from 'lucide-react';
import './Footer.css';

export default function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="footer">
            <div className="container">
                <div className="footer-grid">

                    <div className="footer-brand-col">
                        <Link href="/" className="footer-brand">
                            <Layers className="footer-logo" size={24} />
                            <span className="footer-name">Better Anki</span>
                        </Link>
                        <p className="footer-tagline">
                            The modern standard for super-learners. Learn faster, remember longer.
                        </p>
                    </div>

                    <div className="footer-links-col">
                        <h4 className="footer-heading">Features</h4>
                        <ul className="footer-links">
                            <li><Link href="/features/fsrs">FSRS Algorithm</Link></li>
                            <li><Link href="/features/ai-generation">AI Generation</Link></li>
                            <li><Link href="/features/image-occlusion">Image Occlusion</Link></li>
                        </ul>
                    </div>

                    <div className="footer-links-col">
                        <h4 className="footer-heading">Resources</h4>
                        <ul className="footer-links">
                            <li><a href="#">Documentation</a></li>
                            <li><a href="#">Community</a></li>
                            <li><a href="#">Blog</a></li>
                        </ul>
                    </div>

                    <div className="footer-links-col">
                        <h4 className="footer-heading">Legal</h4>
                        <ul className="footer-links">
                            <li><a href="#">Privacy Policy</a></li>
                            <li><a href="#">Terms of Service</a></li>
                            <li><a href="#">Contact</a></li>
                        </ul>
                    </div>

                </div>

                <div className="footer-bottom">
                    <p>&copy; {currentYear} Better Anki. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
}
