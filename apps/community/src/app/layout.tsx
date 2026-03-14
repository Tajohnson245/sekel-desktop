import type { Metadata } from "next";
import { DM_Serif_Display, Outfit, DM_Mono } from "next/font/google";
import { CommunityFooter } from "@sekel/community-components";
import { AuthProvider } from "../context/AuthContext";
import NavbarWrapper from "../components/NavbarWrapper";
import "./globals.css";

const dmSerifDisplay = DM_Serif_Display({
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const outfit = Outfit({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SEKEL Community — Browse & Share Study Decks",
  description:
    "Discover community-created flashcard decks for medical school, languages, science, and more. Free to browse, download, and share.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSerifDisplay.variable} ${outfit.variable} ${dmMono.variable}`}
      >
        <AuthProvider>
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <NavbarWrapper />
          <main id="main-content" style={{ paddingTop: "64px" }}>
            {children}
          </main>
          <CommunityFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
