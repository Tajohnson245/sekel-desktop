"use client";

import Link from 'next/link';
import { Download, Monitor, Apple, ArrowLeft } from 'lucide-react';
import './download.css';

export default function DownloadPage() {
    return (
        <div className="download-page">
            <div className="container">

                <Link href="/" className="back-link">
                    <ArrowLeft size={20} />
                    Back to home
                </Link>

                <div className="download-hero">
                    <div className="download-icon-wrapper">
                        <Download size={48} className="text-accent pulse-icon" />
                    </div>
                    <h1 className="download-title">
                        Download <span className="text-gradient">Sekel Beta</span>
                    </h1>
                    <p className="download-subtitle">
                        Free beta. Exam-aware spaced repetition for medical students — Step 1, Step 2 CK,
                        NBME shelf exams, and NCLEX. No credit card. No subscription.
                    </p>
                    <ul className="download-value-props">
                        <li>Yield scoring ranked against official USMLE &amp; NBME blueprints</li>
                        <li>AI card generation from PDFs and YouTube lectures</li>
                        <li>Study plan with daily targets and system coverage gaps</li>
                    </ul>
                </div>

                <div className="download-grid">

                    {/* Windows */}
                    <div className="download-card glass-panel">
                        <div className="os-icon">
                            <Monitor size={40} />
                        </div>
                        <h3>Windows</h3>
                        <p>Windows 10 and 11 (64-bit)</p>
                        <button className="btn btn-primary download-btn w-full">
                            <Download size={18} /> Download for Windows
                        </button>
                        <div className="sub-links">
                            <a href="#">Portable Version (.zip)</a>
                        </div>
                    </div>

                    {/* macOS */}
                    <div className="download-card glass-panel">
                        <div className="os-icon">
                            <Apple size={40} />
                        </div>
                        <h3>macOS</h3>
                        <p>macOS 10.15+ (Apple Silicon & Intel)</p>
                        <button className="btn btn-primary download-btn w-full">
                            <Download size={18} /> Download for macOS
                        </button>
                        <div className="sub-links">
                            <a href="#">Intel (.dmg)</a>
                            <span>•</span>
                            <a href="#">Apple Silicon (.dmg)</a>
                        </div>
                    </div>


                </div>


            </div>
        </div>
    );
}
