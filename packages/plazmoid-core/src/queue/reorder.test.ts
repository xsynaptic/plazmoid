import { describe, expect, test } from 'vitest';

import { canMove, movedArray, movedIndex } from '#queue/reorder.ts';

const longestQueueChecked = 8;

function indicesUpTo(length: number): Array<number> {
	return Array.from({ length }, (_, index) => index);
}

function everyMoveInQueue() {
	const moves: Array<{ from: number; length: number; to: number }> = [];

	for (let length = 1; length <= longestQueueChecked; length += 1) {
		const indices = indicesUpTo(length);

		for (const from of indices) moves.push(...indices.map((to) => ({ from, length, to })));
	}

	return moves;
}

describe('canMove', () => {
	test('accepts a move between two different rows of the queue, and refuses one that goes nowhere', () => {
		for (const { from, length, to } of everyMoveInQueue()) {
			expect(canMove(length, from, to), JSON.stringify({ from, length, to })).toBe(from !== to);
		}
	});

	test('refuses an end outside the queue', () => {
		expect(canMove(4, -1, 2)).toBe(false);
		expect(canMove(4, 4, 2)).toBe(false);
		expect(canMove(4, 2, -1)).toBe(false);
		expect(canMove(4, 2, 4)).toBe(false);
	});
});

describe('movedArray', () => {
	test('moves an item down', () => {
		expect(movedArray(['a', 'b', 'c', 'd'], 0, 2)).toStrictEqual(['b', 'c', 'a', 'd']);
	});

	test('moves an item up', () => {
		expect(movedArray(['a', 'b', 'c', 'd'], 3, 1)).toStrictEqual(['a', 'd', 'b', 'c']);
	});
});

const byText = (first: string, second: string) => first.localeCompare(second);

describe('movedArray against movedIndex', () => {
	test('permutes its input and lands every item where movedIndex says, for every move canMove accepts', () => {
		const moves = everyMoveInQueue().filter(({ from, length, to }) => canMove(length, from, to));

		for (const { from, length, to } of moves) {
			const items = Array.from({ length }, (_, index) => `item-${String(index)}`);
			const moved = movedArray(items, from, to);

			expect(moved.toSorted(byText)).toStrictEqual(items.toSorted(byText));

			for (const [index, item] of items.entries()) {
				expect(moved[movedIndex(index, from, to)], JSON.stringify({ from, length, to })).toBe(item);
			}
		}
	});
});
