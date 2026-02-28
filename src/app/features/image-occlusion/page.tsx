"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Image as ImageIcon, MousePointerClick, EyeOff, BookOpen, ArrowRight, RotateCcw, Upload, Square, Save, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import '../feature-page.css';
import './io.css';

const steps = [
    {
        id: 1,
        title: "Step 1: Upload a Diagram",
        desc: "Start by bringing in a complex diagram, map, or anatomical chart. Better Anki supports high-res images directly from your clipboard or file system.",
        buttonAction: "Upload Image",
        buttonIcon: <Upload size={16} />
    },
    {
        id: 2,
        title: "Step 2: Draw Occlusion Masks",
        desc: "Simply click and drag to draw boxes over the labels you want to memorize. Better Anki instantly creates a linked card for every mask you draw.",
        buttonAction: "Draw Masks",
        buttonIcon: <Square size={16} />
    },
    {
        id: 3,
        title: "Step 3: Select Study Mode",
        desc: "Select how you want to be tested. 'Hide All, Guess One' provides the most challenge, ensuring you aren't using surrounding labels as context clues.",
        buttonAction: "Generate Cards",
        buttonIcon: <Save size={16} />
    },
    {
        id: 4,
        title: "Step 4: Active Recall Review",
        desc: "During your study session, the target mask highlights in blue while the others remain red. Try to recall what's underneath before flipping the card!",
        buttonAction: "Reveal Answer",
        buttonIcon: <Play size={16} />
    }
];

export default function ImageOcclusionPage() {
    const [currentStep, setCurrentStep] = useState(0);

    const nextStep = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const resetFlow = () => {
        setCurrentStep(0);
    };

    const step = steps[currentStep];

    return (
        <div className="feature-page io-page">
            <div className="container">

                <Link href="/" className="back-link">
                    <ArrowLeft size={20} />
                    Back to home
                </Link>

                <div className="feature-hero">
                    <div className="feature-icon-wrapper large-icon">
                        <ImageIcon size={48} />
                    </div>
                    <h1 className="feature-hero-title">
                        Advanced <span className="text-gradient">Image Occlusion</span>
                    </h1>
                    <p className="feature-hero-subtitle">
                        Master anatomy, geography, and complex diagrams visually.
                    </p>
                </div>

                {/* Original Static Design */}
                <div className="walkthrough-section glass-panel" style={{ marginBottom: '8rem' }}>
                    <div className="walkthrough-grid">

                        <div className="walkthrough-text">
                            <h2>A picture is worth a thousand reps.</h2>
                            <p>Text flashcards fall short for highly visual subjects. Better Anki features a deeply integrated Image Occlusion editor that feels like a premium design tool.</p>

                            <ul className="benefit-list">
                                <li><MousePointerClick className="benefit-icon text-accent" /> Intuitive drag-and-drop bounding boxes.</li>
                                <li><EyeOff className="benefit-icon text-accent" /> &quot;Hide All, Guess One&quot; or &quot;Hide One, Guess One&quot; modes.</li>
                                <li><BookOpen className="benefit-icon text-accent" /> Perfect for medical students, language learners, and engineers.</li>
                            </ul>
                        </div>

                        <div className="walkthrough-visual bg-tertiary">
                            <div className="mockup-io">
                                <div className="io-image-placeholder">
                                    <div className="diagram-circle"></div>
                                    <div className="diagram-line l1"></div>
                                    <div className="diagram-line l2"></div>
                                    <div className="diagram-line l3"></div>

                                    <div className="occlusion-mask m1"></div>
                                    <div className="occlusion-mask m2 active-mask"></div>
                                    <div className="occlusion-mask m3"></div>

                                    <MousePointerClick className="fake-cursor" size={24} />
                                </div>
                                <div className="io-toolbar">
                                    <div className="tool active-tool"></div>
                                    <div className="tool"></div>
                                    <div className="tool"></div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Interactive Simulation Section */}
                <div className="io-simulation-header" style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto 3rem auto' }}>
                    <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem' }}>See how it works</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.125rem', lineHeight: 1.6 }}>From uploading an image to the study session, walk through the seamless card creation pipeline.</p>
                </div>

                <div className="io-interactive-section" style={{ maxWidth: '1200px', margin: '0 auto' }}>
                    <div className="io-visualizer glass-panel">

                        <div className="io-toolbar-top" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                            <div className="step-indicator" style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Flow: {currentStep + 1} / {steps.length}
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <span className="stat-badge highlight" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.75rem', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-color)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 'var(--radius-full)', fontSize: '0.875rem', fontWeight: 500 }}>
                                    {step.buttonIcon} {step.buttonAction}
                                </span>
                            </div>
                        </div>

                        <div className="io-content-area" style={{ padding: '3rem 2rem', position: 'relative', minHeight: '450px' }}>
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentStep}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.4 }}
                                    className="io-simulation-layout"
                                >

                                    {/* Visual Editor Pane */}
                                    <div className="io-editor-pane">

                                        {currentStep === 0 && (
                                            <div className="io-upload-state">
                                                <Upload size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }} />
                                                <p>Drag an image here or click to browse</p>
                                            </div>
                                        )}

                                        {currentStep >= 1 && (
                                            <div className="io-diagram-state">
                                                {/* Fake Base Image */}
                                                <div className="cell-body"></div>
                                                <div className="cell-nucleus"></div>
                                                <div className="cell-mitochondria"></div>

                                                <div className="cell-label label-1">Nucleus</div>
                                                <div className="cell-label label-2">Mitochondria</div>
                                                <div className="cell-label label-3">Cytoplasm</div>

                                                <div className="cell-line cl-1"></div>
                                                <div className="cell-line cl-2"></div>
                                                <div className="cell-line cl-3"></div>

                                                {/* Masks */}
                                                {currentStep >= 1 && (
                                                    <>
                                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className={`io-mask sim-m1 ${currentStep === 3 ? 'mask-hidden' : ''}`}>
                                                            {currentStep === 3 ? 'Nucleus' : ''}
                                                        </motion.div>
                                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className={`io-mask sim-m2 ${currentStep === 3 ? 'mask-active' : ''}`}>
                                                            {currentStep === 3 ? '?' : ''}
                                                        </motion.div>
                                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className={`io-mask sim-m3 ${currentStep === 3 ? 'mask-hidden' : ''}`}>
                                                            {currentStep === 3 ? 'Cytoplasm' : ''}
                                                        </motion.div>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Explanation Pane */}
                                    <div className="demo-explanation">
                                        <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>{step.title.split(': ')[1]}</h3>
                                        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '2rem' }}>{step.desc}</p>

                                        {currentStep === 2 && (
                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="io-mode-selector glass-panel">
                                                <div className="mode-option selected">
                                                    <strong>Hide All, Guess One</strong>
                                                    <span>Context clues are hidden.</span>
                                                </div>
                                                <div className="mode-option">
                                                    <strong>Hide One, Guess One</strong>
                                                    <span>Context clues are visible.</span>
                                                </div>
                                            </motion.div>
                                        )}

                                    </div>

                                </motion.div>
                            </AnimatePresence>
                        </div>

                        <div className="fsrs-controls" style={{ padding: '1.5rem', backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
                            {currentStep < steps.length - 1 ? (
                                <button className="btn btn-primary pulse-glow" onClick={nextStep} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 0 15px rgba(59, 130, 246, 0.4)', animation: 'pulseButton 2s infinite' }}>
                                    {step.buttonAction} <ArrowRight size={16} />
                                </button>
                            ) : (
                                <button className="btn btn-secondary reset-btn" onClick={resetFlow} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    Restart Demo <RotateCcw size={16} />
                                </button>
                            )}
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}
