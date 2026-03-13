export interface SampleCard {
  front: string;
  back: string;
}

export type DeckCategory =
  | "Languages"
  | "Medicine"
  | "Science"
  | "Mathematics"
  | "History"
  | "Geography"
  | "Computer Science"
  | "Music"
  | "Art"
  | "Law"
  | "Business"
  | "Other";

export interface Deck {
  id: string;
  title: string;
  description: string;
  author: string;
  category: DeckCategory;
  tags: string[];
  cardCount: number;
  downloadCount: number;
  rating: number; // 1–5
  ratingCount: number;
  thumbnailUrl?: string;
  featured?: boolean;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
  sampleCards: SampleCard[];
}

export interface DeckFormData {
  title: string;
  description: string;
  author: string;
  category: DeckCategory;
  tags: string[];
  file?: File;
}

export interface SearchParams {
  query: string;
  category?: DeckCategory;
  sortBy: "popular" | "newest" | "rating" | "most-cards";
  tags?: string[];
}
