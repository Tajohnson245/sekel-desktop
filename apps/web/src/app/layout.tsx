import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ScrollCleaner from '../components/ScrollCleaner';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sekel | The Modern Spaced Repetition Standard",
  description: "Learn faster and remember longer with Sekel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <ScrollCleaner />
        <Navbar />
        <main style={{ paddingTop: '4rem', flex: 1 }}>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
