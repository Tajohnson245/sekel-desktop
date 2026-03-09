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
        desc: "Start by bringing in a complex diagram, map, or anatomical chart. Sekel supports high-res images directly from your clipboard or file system.",
        buttonAction: "Upload Image",
        buttonIcon: <Upload size={14} />
    },
    {
        id: 2,
        title: "Step 2: Draw Occlusion Masks",
        desc: "Simply click and drag to draw boxes over the labels you want to memorize. Sekel instantly creates a linked card for every mask you draw.",
        buttonAction: "Draw Masks",
        buttonIcon: <Square size={14} />
    },
    {
        id: 3,
        title: "Step 3: Select Study Mode",
        desc: "Select how you want to be tested. 'Hide All, Guess One' provides the most challenge, ensuring you aren't using surrounding labels as context clues.",
        buttonAction: "Generate Cards",
        buttonIcon: <Save size={14} />
    },
    {
        id: 4,
        title: "Step 4: Active Recall Review",
        desc: "During your study session, the target mask highlights in teal while the others remain red. Try to recall what's underneath before flipping the card!",
        buttonAction: "Reveal Answer",
        buttonIcon: <Play size={14} />
    }
];

export default function ImageOcclusionPage() {
    const [currentStep, setCurrentStep] = useState(0);

    const nextStep = () => {
        if (currentStep < steps.length - 1) setCurrentStep(prev => prev + 1);
    };

    const resetFlow = () => setCurrentStep(0);

    const step = steps[currentStep];

    return (
        <div className="feature-page io-page">
            <div className="container">

                <Link href="/" className="back-link">
                    <ArrowLeft size={18} />
                    Back to home
                </Link>

                <div className="feature-hero">
                    <div className="fp-icon-box">
                        <ImageIcon size={36} />
                    </div>
                    <h1 className="feature-hero-title">
                        Advanced <em>Image Occlusion</em>
                    </h1>
                    <p className="feature-hero-subtitle">
                        Master anatomy, geography, and complex diagrams visually.
                    </p>
                </div>

                <div className="fp-card" style={{ marginBottom: '64px' }}>
                    <div className="walkthrough-grid">

                        <div className="walkthrough-text">
                            <h2>A picture is worth a thousand reps.</h2>
                            <p>Text flashcards fall short for highly visual subjects. Sekel features a deeply integrated Image Occlusion editor that feels like a premium design tool.</p>

                            <ul className="benefit-list">
                                <li><MousePointerClick className="benefit-icon" /> Intuitive drag-and-drop bounding boxes.</li>
                                <li><EyeOff className="benefit-icon" /> &quot;Hide All, Guess One&quot; or &quot;Hide One, Guess One&quot; modes.</li>
                                <li><BookOpen className="benefit-icon" /> Perfect for medical students, language learners, and engineers.</li>
                            </ul>
                        </div>

                        <div className="walkthrough-visual">
                            <div className="mockup-io">
                                <div className="io-image-placeholder">
                                    <div className="diagram-circle"></div>
                                    <div className="diagram-line l1"></div>
                                    <div className="diagram-line l2"></div>
                                    <div className="diagram-line l3"></div>
                                    <div className="occlusion-mask m1"></div>
                                    <div className="occlusion-mask m2 active-mask"></div>
                                    <div className="occlusion-mask m3"></div>
                                    <MousePointerClick className="fake-cursor" size={22} />
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

                <div style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto 48px' }}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 3vw, 36px)', color: 'var(--ink)', marginBottom: '12px' }}>See how it works</h2>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '16px', fontWeight: 300, color: 'var(--slate)', lineHeight: 1.6 }}>
                        From uploading an image to the study session, walk through the seamless card creation pipeline.
                    </p>
                </div>

                <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                    <div className="io-visualizer">

                        <div className="io-toolbar-top">
                            <div className="io-step-indicator">
                                Flow: {currentStep + 1} / {steps.length}
                            </div>
                            <span className="io-step-badge">
                                {step.buttonIcon} {step.buttonAction}
                            </span>
                        </div>

                        <div className="io-content-area">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentStep}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.4 }}
                                    className="io-simulation-layout"
                                >
                                    <div className="io-editor-pane">
                                        {currentStep === 0 && (
                                            <div className="io-upload-state">
                                                <Upload size={40} />
                                                <p>Drag an image here or click to browse</p>
                                            </div>
                                        )}

                                        {currentStep >= 1 && (
                                            <div className="io-diagram-state">
                                                <div className="cell-body"></div>
                                                <div className="cell-nucleus"></div>
                                                <div className="cell-mitochondria"></div>

                                                <div className="cell-label label-1">Nucleus</div>
                                                <div className="cell-label label-2">Mitochondria</div>
                                                <div className="cell-label label-3">Cytoplasm</div>

                                                <div className="cell-line cl-1"></div>
                                                <div className="cell-line cl-2"></div>
                                                <div className="cell-line cl-3"></div>

                                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className={`io-mask sim-m1 ${currentStep === 3 ? 'mask-hidden' : ''}`}>
                                                    {currentStep === 3 ? 'Nucleus' : ''}
                                                </motion.div>
                                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className={`io-mask sim-m2 ${currentStep === 3 ? 'mask-active' : ''}`}>
                                                    {currentStep === 3 ? '?' : ''}
                                                </motion.div>
                                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className={`io-mask sim-m3 ${currentStep === 3 ? 'mask-hidden' : ''}`}>
                                                    {currentStep === 3 ? 'Cytoplasm' : ''}
                                                </motion.div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="io-explanation">
                                        <h3>{step.title.split(': ')[1]}</h3>
                                        <p>{step.desc}</p>

                                        {currentStep === 2 && (
                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="io-mode-selector">
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

                        <div className="io-controls">
                            {currentStep < steps.length - 1 ? (
                                <button className="io-next-btn" onClick={nextStep}>
                                    {step.buttonAction} <ArrowRight size={16} />
                                </button>
                            ) : (
                                <button className="io-reset-btn" onClick={resetFlow}>
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
