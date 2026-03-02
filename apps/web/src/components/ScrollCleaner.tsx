"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function ScrollCleaner() {
    const pathname = usePathname();

    useEffect(() => {
        // Check if there's a hash in the URL. If so, let Next.js naturally scroll to it first, 
        // then silently remove the hash from the URL history stack.
        if (window.location.hash) {
            const timer = setTimeout(() => {
                window.history.replaceState(null, '', pathname);
            }, 100); // 100ms is usually enough for the browser/Next to handle the hash scroll
            return () => clearTimeout(timer);
        }
    }, [pathname]);

    return null;
}
