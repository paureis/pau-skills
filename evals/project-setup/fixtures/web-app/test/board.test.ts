import { describe, expect, it } from 'vitest';
import { moveCard } from '../src/board';

describe('moveCard', () => {
  it('moves only the matching card', () => {
    const cards = [{ id: 'a', title: 'A', column: 'todo' as const }, { id: 'b', title: 'B', column: 'todo' as const }];
    expect(moveCard(cards, 'a', 'done').map((c) => c.column)).toEqual(['done', 'todo']);
  });
});
