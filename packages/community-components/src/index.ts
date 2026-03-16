// Types
export type { Deck, SampleCard, DeckCategory, DeckFormData, SearchParams } from './types';

// Utils (exported for use in apps)
export {
  getCategoryGradient,
  formatNumber,
  formatDate,
  filterAndSortDecks,
  paginateDecks,
  getAllTags,
  computeStats,
} from './utils';

// Layout
export { default as CommunityNavbar } from './layout/Navbar';
export { default as CommunityFooter } from './layout/Footer';

// Deck components
export { default as DeckCard } from './deck/DeckCard';
export { default as DeckGrid } from './deck/DeckGrid';
export { default as DeckDetail } from './deck/DeckDetail';
export { default as DeckStats } from './deck/DeckStats';
export { default as FlipCard } from './deck/FlipCard';
export { default as SkeletonCard } from './deck/SkeletonCard';

// Auth
export { default as LoginForm } from './auth/LoginForm';
export { default as SignupForm } from './auth/SignupForm';
export { default as AccountForm } from './auth/AccountForm';

// Search
export { default as SearchBar } from './search/SearchBar';
export { default as SearchFilters } from './search/SearchFilters';

// Form
export { default as AddDeckForm } from './form/AddDeckForm';
export { default as TagInput } from './form/TagInput';
export { default as FileDropZone } from './form/FileDropZone';

// UI primitives
export { default as StarRating } from './ui/StarRating';
export { default as Pagination } from './ui/Pagination';
export { default as CategoryBadge } from './ui/CategoryBadge';
