"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BrainCircuit, Calendar, Clock, ArrowRight, RotateCcw, Activity, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import '../feature-page.css';
import './fsrs.css';

const steps = [
    {
        id: 1,
        title: "Day 1: Learning a New Concept",
        desc: "You encounter a new flashcard. FSRS analyzes the content's initial difficulty. You review it and press 'Good'.",
        cardText: "What is the half-life of Carbon-14?",
        action: "Good",
        interval: "10 min",
        retention: "100%",
    },
    {
        id: 2,
        title: "10 Minutes Later: Consolidation",
        desc: "The card returns for its learning step. You remember it and press 'Good' again. FSRS now calculates your initial memory stability.",
        cardText: "What is the half-life of Carbon-14?",
        action: "Good",
        interval: "3 days",
        retention: "90%",
    },
    {
        id: 3,
        title: "Day 4: The Crucial Review",
        desc: "Just as you're about to forget, FSRS schedules a review. You recall the answer (5,730 years). FSRS dramatically increases the interval.",
        cardText: "What is the half-life of Carbon-14?",
        action: "Good",
        interval: "14 days",
        retention: "85%",
    },
    {
        id: 4,
        title: "Day 18: Long-Term Memory",
        desc: "The memory is now stabilized. While legacy algorithms might test you again in 7 days, FSRS optimally pushes this to 14 days, saving you unnecessary reviews.",
        cardText: "What is the half-life of Carbon-14?",
        action: "Easy",
        interval: "1.5 months",
        retention: "95%",
    }
];

export default function FSRSPage() {
    const [currentStep, setCurrentStep] = useState(0);

    const nextStep = () => {
        if (currentStep < steps.length - 1) setCurrentStep(prev => prev + 1);
    };

    const resetFlow = () => setCurrentStep(0);

    const step = steps[currentStep];

    return (
        <div className="feature-page fsrs-page">
            <div className="container">

                <Link href="/" className="back-link">
                    <ArrowLeft size={18} />
                    Back to home
                </Link>

                <div className="feature-hero">
                    <div className="fp-icon-box">
                        <BrainCircuit size={36} />
                    </div>
                    <h1 className="feature-hero-title">
                        The <em>FSRS</em> Algorithm
                    </h1>
                    <p className="feature-hero-subtitle">
                        Experience how the Free Spaced Repetition Scheduler optimizes your memory in real-time.
                    </p>
                </div>

                <div className="fp-card" style={{ marginBottom: '64px' }}>
                    <div className="walkthrough-grid">

                        <div className="walkthrough-text">
                            <h2>Stop guessing. Start knowing.</h2>
                            <p>Legacy SM-2 algorithms are rigid — they treat every card and every brain exactly the same.</p>
                            <p>FSRS changes everything. It calculates the <strong>exact mathematical probability</strong> of you remembering a card, tailoring the schedule to your unique learning curve.</p>

                            <ul className="benefit-list">
                                <li><Activity className="benefit-icon" /> Reach 90% retention with 20% fewer reviews.</li>
                                <li><Clock className="benefit-icon" /> Optimize for your specific test date.</li>
                                <li><Zap className="benefit-icon" /> Adapt instantly to hard material vs easy material.</li>
                            </ul>
                        </div>

                        <div className="walkthrough-visual">
                            <div className="mockup-chart">
                                <div className="chart-line legacy-line"></div>
                                <div className="chart-line fsrs-line"></div>
                                <div className="chart-label">Retention Probability over Time</div>
                            </div>
                        </div>

                    </div>
                </div>

                <div className="fsrs-simulation-header">
                    <h2>See it in action</h2>
                    <p>Step through a real-world flashcard learning scenario to see how FSRS adapts vs standard algorithms.</p>
                </div>

                <div className="fsrs-interactive-section">

                    <div className="fsrs-visualizer">

                        <div className="fsrs-toolbar">
                            <div className="step-indicator">
                                Step {currentStep + 1} of {steps.length}
                            </div>
                            <div className="fsrs-stats">
                                <span className="stat-badge"><Calendar size={12} /> {step.title.split(':')[0]}</span>
                                <span className="stat-badge highlight"><Clock size={12} /> Next: {step.interval}</span>
                            </div>
                        </div>

                        <div className="fsrs-content-area">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentStep}
                                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 1.05, y: -20 }}
                                    transition={{ duration: 0.4 }}
                                    className="simulation-layout"
                                >
                                    <div className="demo-flashcard-container">
                                        <div className="demo-flashcard front">
                                            <p>{step.cardText}</p>
                                        </div>
                                        <div className="demo-actions">
                                            <button className="demo-btn again">Again</button>
                                            <button className="demo-btn hard">Hard</button>
                                            <motion.button
                                                className={`demo-btn good ${step.action === 'Good' ? 'clicking' : ''}`}
                                                whileTap={{ scale: 0.95 }}
                                            >
                                                Good
                                            </motion.button>
                                            <motion.button
                                                className={`demo-btn easy ${step.action === 'Easy' ? 'clicking' : ''}`}
                                                whileTap={{ scale: 0.95 }}
                                            >
                                                Easy
                                            </motion.button>
                                        </div>
                                    </div>

                                    <div className="demo-explanation">
                                        <h3>{step.title.split(': ')[1]}</h3>
                                        <p>{step.desc}</p>

                                        <div className="algorithm-insight">
                                            <div className="insight-header">
                                                <BrainCircuit size={14} />
                                                <span>FSRS Engine Output</span>
                                            </div>
                                            <div className="insight-data">
                                                <div className="data-row">
                                                    <span>Target Retention:</span>
                                                    <strong>90%</strong>
                                                </div>
                                                <div className="data-row">
                                                    <span>Current Stability:</span>
                                                    <strong>{step.retention}</strong>
                                                </div>
                                                <div className="data-row highlight-row">
                                                    <span>Calculated Interval:</span>
                                                    <strong>{step.interval}</strong>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                </motion.div>
                            </AnimatePresence>
                        </div>

                        <div className="fsrs-controls">
                            {currentStep < steps.length - 1 ? (
                                <button className="next-btn" onClick={nextStep}>
                                    Simulate Next Review <ArrowRight size={16} />
                                </button>
                            ) : (
                                <button className="reset-btn" onClick={resetFlow}>
                                    Restart Simulation <RotateCcw size={16} />
                                </button>
                            )}
                        </div>

                    </div>

                </div>

            </div>
        </div>
    );
}
