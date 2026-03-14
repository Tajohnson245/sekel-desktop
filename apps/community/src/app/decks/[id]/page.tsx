import { notFound } from "next/navigation";
import { mockDecks } from "@/lib/mock-data";
import DeckDetailWrapper from "../../../components/DeckDetailWrapper";
import "../detail.css";

interface DeckDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function DeckDetailPage({ params }: DeckDetailPageProps) {
  const { id } = await params;
  const deck = mockDecks.find((d) => d.id === id);

  if (!deck) {
    notFound();
  }

  return (
    <div className="detail-page">
      <div className="container">
        <DeckDetailWrapper deck={deck} />
      </div>
    </div>
  );
}

export async function generateStaticParams() {
  return mockDecks.map((deck) => ({ id: deck.id }));
}
