import Link from 'next/link';
import { ArrowLeft, Wand2, FileText, Cpu, Sparkles } from 'lucide-react';
import '../feature-page.css';

export default function AIGenerationPage() {
    return (
        <div className="feature-page ai-page">
            <div className="container">

                <Link href="/" className="back-link">
                    <ArrowLeft size={20} />
                    Back to home
                </Link>

                <div className="feature-hero">
                    <div className="feature-icon-wrapper large-icon">
                        <Wand2 size={48} />
                    </div>
                    <h1 className="feature-hero-title">
                        Instant <span className="text-gradient">AI</span> Generation
                    </h1>
                    <p className="feature-hero-subtitle">
                        Turn any document into a high-yield study deck in seconds.
                    </p>
                </div>

                <div className="walkthrough-section glass-panel">
                    <div className="walkthrough-grid ai-grid-reverse">

                        <div className="walkthrough-visual bg-tertiary">
                            <div className="mockup-ai-upload">
                                <div className="upload-box">
                                    <FileText size={48} className="text-tertiary mb-4" />
                                    <div className="upload-text">Drag & Drop PDF</div>
                                </div>
                                <div className="processing-bar">
                                    <div className="processing-fill"></div>
                                </div>
                                <div className="generated-cards">
                                    <div className="mini-card pulse-1"></div>
                                    <div className="mini-card pulse-2"></div>
                                    <div className="mini-card pulse-3"></div>
                                </div>
                            </div>
                        </div>

                        <div className="walkthrough-text">
                            <h2>Stop making cards. Start learning.</h2>
                            <p>Card creation is the biggest bottleneck in spaced repetition. Sekel eliminates it completely with context-aware AI.</p>

                            <ul className="benefit-list">
                                <li><FileText className="benefit-icon text-accent" /> Upload PDFs, PowerPoint slides, or paste YouTube URLs.</li>
                                <li><Cpu className="benefit-icon text-accent" /> Our Custom LLM pipeline extracts key facts and formulates perfect Q&A pairs.</li>
                                <li><Sparkles className="benefit-icon text-accent" /> Automatically tags and organizes cards by topic.</li>
                            </ul>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}
