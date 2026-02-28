import Link from 'next/link';
import { BrainCircuit, Wand2, Image as ImageIcon, ArrowRight } from 'lucide-react';
import './Features.css';

export default function Features() {
    const features = [
        {
            icon: <BrainCircuit size={32} className="feature-icon" />,
            title: "State-of-the-art FSRS Algorithm",
            description: "Stop wasting time over-reviewing easy cards. Better Anki uses the Free Spaced Repetition Scheduler (FSRS) to predict your exact memory retention with unparalleled accuracy.",
            link: "/features/fsrs"
        },
        {
            icon: <Wand2 size={32} className="feature-icon" />,
            title: "Instant AI Card Generation",
            description: "Upload your PDFs, class notes, or YouTube transcripts. Our AI instantly transforms them into high-yield flashcards so you spend less time making cards and more time learning.",
            link: "/features/ai-generation"
        },
        {
            icon: <ImageIcon size={32} className="feature-icon" />,
            title: "Advanced Image Occlusion",
            description: "Studying anatomy or diagrams? Drag and drop boxes to hide parts of an image. Create powerful visual flashcards in seconds with our integrated, intuitive editor.",
            link: "/features/image-occlusion"
        }
    ];

    return (
        <section id="features" className="features-section">
            <div className="container">
                <div className="features-header">
                    <h2 className="section-title">Studying, <span className="text-gradient">reimagined.</span></h2>
                    <p className="section-subtitle">
                        Everything you need to memorize complex information faster and remember it forever.
                    </p>
                </div>

                <div className="features-grid">
                    {features.map((feature, index) => (
                        <div key={index} className="feature-card glass-panel">
                            <div className="feature-icon-wrapper">
                                {feature.icon}
                            </div>
                            <h3 className="feature-title">{feature.title}</h3>
                            <p className="feature-description">{feature.description}</p>

                            <div className="feature-card-footer">
                                <Link href={feature.link} className="feature-link">
                                    Learn more
                                    <ArrowRight size={16} />
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
