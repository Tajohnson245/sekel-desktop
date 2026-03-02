"use client";

import { Check, X } from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import './Comparison.css';

export default function Comparison() {
    const ankiFeatures = [
        { name: 'Spaced Repetition algorithm', supported: true },
        { name: 'Basic text and image cards', supported: true },
        { name: 'Cross-platform sync', supported: true },
        { name: 'Modern UI/UX out of the box', supported: false },
        { name: 'Instant AI card generation', supported: false },
        { name: 'Built-in Image Occlusion editor', supported: false },
    ];

    const sekelFeatures = [
        { name: 'Advanced FSRS Scheduling', supported: true },
        { name: 'Rich, interactive card types', supported: true },
        { name: 'Seamless cloud sync (Supabase)', supported: true },
        { name: 'Premium, glassmorphic UI', supported: true },
        { name: 'Instant AI card from PDFs/Notes', supported: true },
        { name: 'Built-in Image Occlusion editor', supported: true },
    ];

    // Animation variants
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.15
            }
        }
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, x: -20 },
        visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut" } }
    };

    // Custom animation for icons (pop effect)
    const iconVariants: Variants = {
        hidden: { scale: 0, opacity: 0 },
        visible: { scale: 1, opacity: 1, transition: { type: "spring", stiffness: 300, damping: 20 } }
    };

    return (
        <section id="compare" className="comparison-section">
            <div className="container">
                <div className="comparison-header">
                    <h2 className="section-title">Why upgrade from Anki?</h2>
                    <p className="section-subtitle">
                        Anki is a powerful engine with a dated exterior. Sekel brings the engine into the modern era with a state-of-the-art interface and AI superpowers.
                    </p>
                </div>

                <div className="comparison-table-wrapper">
                    {/* Legacy Anki Column */}
                    <div className="comparison-column legacy-column">
                        <div className="column-header">
                            <h3 className="column-title">Legacy Anki</h3>
                            <p className="column-subtitle">Powerful, but dated and clunky.</p>
                        </div>
                        <motion.ul
                            className="feature-list"
                            variants={containerVariants}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: "-100px" }}
                        >
                            {ankiFeatures.map((feature, i) => (
                                <motion.li key={i} variants={itemVariants} className={`feature-item ${!feature.supported ? 'opacity-50' : ''}`}>
                                    <motion.div variants={iconVariants}>
                                        {feature.supported ?
                                            <Check className="icon text-tertiary" size={20} /> :
                                            <X className="icon text-tertiary" size={20} />
                                        }
                                    </motion.div>
                                    <span>{feature.name}</span>
                                </motion.li>
                            ))}
                        </motion.ul>
                    </div>

                    {/* Sekel Column */}
                    <div className="comparison-column primary-column glass-panel">
                        <div className="column-header">
                            <h3 className="column-title text-gradient">Sekel</h3>
                            <p className="column-subtitle">The modern standard for super-learners.</p>
                        </div>
                        <motion.ul
                            className="feature-list"
                            variants={containerVariants}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: "-100px" }}
                        >
                            {sekelFeatures.map((feature, i) => (
                                <motion.li key={i} variants={itemVariants} className="feature-item highlighted-item">
                                    <motion.div variants={iconVariants}>
                                        <Check className="icon text-accent" size={20} />
                                    </motion.div>
                                    <span>{feature.name}</span>
                                </motion.li>
                            ))}
                        </motion.ul>
                    </div>
                </div>
            </div>
        </section>
    );
}
