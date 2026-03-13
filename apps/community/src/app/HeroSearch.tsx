"use client";

import { useRouter } from "next/navigation";
import { SearchBar } from "@sekel/community-components";

export default function HeroSearch() {
  const router = useRouter();

  const handleChange = (query: string) => {
    if (query.trim()) {
      router.push(`/decks?query=${encodeURIComponent(query)}`);
    }
  };

  return (
    <SearchBar
      value=""
      onChange={handleChange}
      placeholder="Search decks by title, author, or topic…"
    />
  );
}
