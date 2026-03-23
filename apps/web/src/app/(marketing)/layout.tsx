import { Navbar, Footer, ScrollCleaner } from '@sekel/web-components';

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <ScrollCleaner />
      <Navbar />
      <main id="main-content">
        {children}
      </main>
      <Footer />
    </>
  );
}
