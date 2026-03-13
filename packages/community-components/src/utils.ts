import type { Deck, DeckCategory, SearchParams } from "./types";

export function getCategoryGradient(category: DeckCategory): string {
  const gradients: Record<DeckCategory, string> = {
    Languages: "linear-gradient(135deg, #2BBFA4 0%, #7C6EF5 100%)",
    Medicine: "linear-gradient(135deg, #E05C6A 0%, #F0A500 100%)",
    Science: "linear-gradient(135deg, #2BBFA4 0%, #F0A500 100%)",
    Mathematics: "linear-gradient(135deg, #7C6EF5 0%, #2BBFA4 100%)",
    History: "linear-gradient(135deg, #F0A500 0%, #E05C6A 100%)",
    Geography: "linear-gradient(135deg, #2BBFA4 0%, #F0A500 100%)",
    "Computer Science": "linear-gradient(135deg, #7C6EF5 0%, #E05C6A 100%)",
    Music: "linear-gradient(135deg, #E05C6A 0%, #7C6EF5 100%)",
    Art: "linear-gradient(135deg, #F0A500 0%, #7C6EF5 100%)",
    Law: "linear-gradient(135deg, #4A5270 0%, #2BBFA4 100%)",
    Business: "linear-gradient(135deg, #F0A500 0%, #2BBFA4 100%)",
    Other: "linear-gradient(135deg, #4A5270 0%, #7C6EF5 100%)",
  };
  return gradients[category];
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function filterAndSortDecks(decks: Deck[], params: SearchParams): Deck[] {
  let result = [...decks];

  if (params.query.trim()) {
    const q = params.query.toLowerCase();
    result = result.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.author.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  if (params.category) {
    result = result.filter((d) => d.category === params.category);
  }

  if (params.tags && params.tags.length > 0) {
    result = result.filter((d) =>
      params.tags!.every((tag) => d.tags.includes(tag))
    );
  }

  switch (params.sortBy) {
    case "popular":
      result.sort((a, b) => b.downloadCount - a.downloadCount);
      break;
    case "newest":
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      break;
    case "rating":
      result.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
      break;
    case "most-cards":
      result.sort((a, b) => b.cardCount - a.cardCount);
      break;
  }

  return result;
}

export function paginateDecks(
  decks: Deck[],
  page: number,
  perPage: number
): { items: Deck[]; totalPages: number; totalCount: number } {
  const totalCount = decks.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * perPage;
  return { items: decks.slice(start, start + perPage), totalPages, totalCount };
}

export function getAllTags(decks: Deck[]): string[] {
  const tagSet = new Set<string>();
  for (const deck of decks) {
    for (const tag of deck.tags) tagSet.add(tag);
  }
  return Array.from(tagSet).sort();
}

export function computeStats(decks: Deck[]): {
  totalDecks: number;
  totalCards: number;
  totalDownloads: number;
} {
  return {
    totalDecks: decks.length,
    totalCards: decks.reduce((s, d) => s + d.cardCount, 0),
    totalDownloads: decks.reduce((s, d) => s + d.downloadCount, 0),
  };
}
