"use client";

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './FAQ.css';

interface FAQItemProps {
    question: string;
    answer: React.ReactNode;
}

function FAQItem({ question, answer }: FAQItemProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className={`faq-item ${isOpen ? 'open' : ''}`}>
            <button
                className="faq-question"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
            >
                <span>{question}</span>
                <ChevronDown
                    className="faq-icon"
                    size={20}
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}
                />
            </button>

            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="faq-answer-container"
                    >
                        <div className="faq-answer">
                            {answer}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function FAQ() {
    const faqs = [
        {
            question: "Is Sekel really better than Anki?",
            answer: "Yes. While Anki is the pioneer of spaced repetition and has a highly custom engine, its UI, syncing, and feature pipeline are heavily dated. Sekel wraps an even more advanced scheduling algorithm (FSRS) in a premium, modern shell with built-in AI tools, entirely circumventing the need to manage clunky add-ons."
        },
        {
            question: "Do I have to recreate all my cards?",
            answer: "No! Sekel features a seamless 1-click import from your existing Anki (.apkg) decks. All your history, scheduling data, and media are preserved."
        },
        {
            question: "Is the AI card generation accurate?",
            answer: "Our pipeline uses state-of-the-art LLMs fine-tuned specifically for educational extraction. It doesn't hallucinate facts; it extracts exact context from your uploaded notes, PDFs, or YouTube URLs and formats them into ideal minimum-information flashcards."
        },
        {
            question: "How does the cloud sync work?",
            answer: "We use Supabase for rock-solid, real-time database synchronization. No more 'sync conflicts' or pressing a manual sync button. Your progress is instantly available on desktop and mobile."
        },
        {
            question: "Do I need to know how to code to use Image Occlusion?",
            answer: "Not at all. Our Image Occlusion editor is fully visual. You simply drag and drop boxes over the parts of the image you want to hide, select your test mode, and the cards are generated automatically."
        }
    ];

    return (
        <section id="faq" className="faq-section">
            <div className="container">
                <div className="faq-header">
                    <h2 className="section-title">Frequently Asked Questions</h2>
                    <p className="section-subtitle">
                        Everything you need to know about making the switch to Sekel.
                    </p>
                </div>

                <div className="faq-list glass-panel">
                    {faqs.map((faq, index) => (
                        <FAQItem key={index} question={faq.question} answer={faq.answer} />
                    ))}
                </div>
            </div>
        </section>
    );
}
