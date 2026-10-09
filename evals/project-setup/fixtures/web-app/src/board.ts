export type Column = 'todo' | 'doing' | 'done';
export interface Card { id: string; title: string; column: Column }

export function moveCard(cards: Card[], id: string, to: Column): Card[] {
  return cards.map((c) => (c.id === id ? { ...c, column: to } : c));
}
