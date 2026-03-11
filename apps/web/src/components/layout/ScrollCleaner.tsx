"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function ScrollCleaner() {
  const pathname = usePathname();

  // Clean URL hash after scroll
  useEffect(() => {
    if (window.location.hash) {
      const timer = setTimeout(() => {
        window.history.replaceState(null, '', pathname);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [pathname]);

  // Scroll reveal via IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    const targets = document.querySelectorAll('.reveal');
    targets.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
