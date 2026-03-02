import { ArrowRight, Download } from 'lucide-react';
import './Hero.css';

export default function Hero() {
    return (
        <section className="hero">
            <div className="hero-background"></div>

            <div className="container hero-container">
                <div className="hero-content">
                    <div className="hero-badge">
                        <span className="badge-pulse"></span>
                        Now available on Windows & macOS
                    </div>

                    <h1 className="hero-title">
                        The <span className="text-gradient">Modern</span> Spaced Repetition Experience
                    </h1>

                    <p className="hero-subtitle">
                        Sekel combines the proven FSRS algorithm with state-of-the-art UI, instant AI card generation, and robust Image Occlusion tools to supercharge your learning.
                    </p>

                    <div className="hero-actions">
                        <button className="btn btn-primary btn-large">
                            <Download size={20} />
                            Download Sekel
                        </button>
                        <a href="#features" className="btn btn-outline btn-large">
                            Explore Features
                            <ArrowRight size={20} />
                        </a>
                    </div>
                </div>

                <div className="hero-visual">
                    <div className="app-mockup glass-panel">
                        <div className="mockup-header">
                            <div className="mockup-dots">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                        <div className="mockup-body">
                            <div className="mockup-sidebar"></div>
                            <div className="mockup-content">
                                <div className="mockup-card"></div>
                                <div className="mockup-stats"></div>
                            </div>
                        </div>
                    </div>

                    {/* Decorative glowing orbs */}
                    <div className="glow-orb orb-1"></div>
                    <div className="glow-orb orb-2"></div>
                </div>
            </div>
        </section>
    );
}
