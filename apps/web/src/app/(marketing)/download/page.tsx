"use client";

import Link from 'next/link';
import { Download, Monitor, Apple, Terminal, ArrowLeft } from 'lucide-react';
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
                        Get <span className="text-gradient">Sekel</span>
                    </h1>
                    <p className="download-subtitle">
                        Download the desktop application for your platform and supercharge your learning today.
                    </p>
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

                    {/* Linux */}
                    <div className="download-card glass-panel">
                        <div className="os-icon">
                            <Terminal size={40} />
                        </div>
                        <h3>Linux</h3>
                        <p>Ubuntu, Debian, Fedora, and more</p>
                        <button className="btn btn-primary download-btn w-full">
                            <Download size={18} /> Download AppImage
                        </button>
                        <div className="sub-links">
                            <a href="#">.deb files</a>
                            <span>•</span>
                            <a href="#">.rpm files</a>
                        </div>
                    </div>

                </div>


            </div>
        </div>
    );
}
