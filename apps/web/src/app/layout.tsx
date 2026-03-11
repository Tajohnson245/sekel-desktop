import type { Metadata } from "next";
import { DM_Serif_Display, Outfit, DM_Mono } from "next/font/google";
import { Navbar, Footer, ScrollCleaner } from '@sekel/web-components';
import "./globals.css";

const dmSerifDisplay = DM_Serif_Display({
  weight: ['400'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const outfit = Outfit({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const dmMono = DM_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "SEKEL — AI-Powered Study Prioritization for Medical Students",
  description: "SEKEL combines spaced repetition with official exam blueprints and your personal performance data to tell you exactly which cards are worth your limited time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSerifDisplay.variable} ${outfit.variable} ${dmMono.variable}`}>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <ScrollCleaner />
        <Navbar />
        <main id="main-content">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
