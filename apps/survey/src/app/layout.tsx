import type { Metadata } from "next";
import Link from "next/link";
import "../styles/globals.css";
import "./layout.css";

export const metadata: Metadata = {
  title: "SEKEL Beta Survey — Help Us Build Better",
  description:
    "Share your study habits and wishes with the SEKEL team. Takes 3–5 minutes. Your responses shape the product.",
};

const currentYear = new Date().getFullYear();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <header className="site-header">
          <div className="site-header__inner">
            <Link href="/" className="site-header__logo">SEKEL</Link>
            <span className="site-header__badge">Beta Survey</span>
          </div>
        </header>
        <main id="main-content">
          {children}
        </main>
        <footer className="site-footer">
          <p>© {currentYear} SEKEL · <a href="https://sekel.io">sekel.io</a></p>
        </footer>
      </body>
    </html>
  );
}
