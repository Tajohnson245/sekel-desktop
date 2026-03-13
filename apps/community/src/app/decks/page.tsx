import { DeckGrid, filterAndSortDecks, paginateDecks, getAllTags } from "@sekel/community-components";
import type { DeckCategory, SearchParams } from "@sekel/community-components";
import { mockDecks } from "@/lib/mock-data";
import "./decks.css";

const PER_PAGE = 12;

interface DecksPageProps {
  searchParams: Promise<{
    query?: string;
    category?: string;
    sort?: string;
    tags?: string;
    page?: string;
  }>;
}

export default async function DecksPage({ searchParams }: DecksPageProps) {
  const params = await searchParams;

  const query = params.query ?? "";
  const category = params.category as DeckCategory | undefined;
  const sortBy = (params.sort ?? "popular") as SearchParams["sortBy"];
  const tags = params.tags ? params.tags.split(",").filter(Boolean) : [];
  const page = Math.max(1, parseInt(params.page ?? "1", 10));

  const filtered = filterAndSortDecks(mockDecks, { query, category, sortBy, tags });
  const { items, totalPages, totalCount } = paginateDecks(filtered, page, PER_PAGE);
  const allTags = getAllTags(mockDecks);

  return (
    <div className="decks-page">
      <div className="container">
        <div className="decks-page__header">
          <h1 className="decks-page__title">Browse Decks</h1>
          <p className="decks-page__sub">Discover community-created flashcard decks</p>
        </div>

        <DeckGrid
          initialDecks={items}
          currentPage={page}
          totalPages={totalPages}
          totalCount={totalCount}
          initialQuery={query}
          initialCategory={category}
          initialSort={sortBy}
          initialTags={tags}
          allTags={allTags}
        />
      </div>
    </div>
  );
}
