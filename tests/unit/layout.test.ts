import { describe, expect, it } from 'vitest';
import { computeLayout } from '../../src/lib/utils/layout.ts';
import { computeLayoutInline, INLINE_LAYOUT_SCRIPT } from '../../src/lib/utils/layout-inline.ts';

function rng(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

function randomCase(rand: () => number) {
	const n = 1 + Math.floor(rand() * 40);
	const aspects = Array.from({ length: n }, () => 0.4 + rand() * 2.6);
	if (rand() < 0.15) aspects[Math.floor(rand() * n)] = 4 + rand() * 6; // panorama
	const width = 300 + Math.floor(rand() * 2300);
	const rowHeight = width < 640 ? 180 : 280;
	return { aspects, width, rowHeight };
}

/** Run the inline script against a minimal fake DOM so the shipped string itself is tested. */
function runInlineScript(
	aspects: number[],
	width: number,
	rows: { desktop: number; mobile: number }
) {
	const tiles = aspects.map((a) => ({
		dataset: { aspect: String(a) },
		style: {} as Record<string, string>,
		querySelector: () => null
	}));
	const grid = {
		clientWidth: width,
		dataset: { rowDesktop: String(rows.desktop), rowMobile: String(rows.mobile) } as Record<
			string,
			string
		>,
		style: {} as Record<string, string>,
		querySelectorAll: () => tiles
	};
	const fn = new Function('document', INLINE_LAYOUT_SCRIPT);
	fn({ currentScript: { previousElementSibling: grid } });
	return {
		boxes: tiles.map((t) => ({
			top: parseFloat(t.style.top),
			left: parseFloat(t.style.left),
			width: parseFloat(t.style.width),
			height: parseFloat(t.style.height)
		})),
		height: parseFloat(grid.style.height)
	};
}

describe('justified layout parity', () => {
	it('computeLayoutInline matches justified-layout for random inputs', () => {
		const rand = rng(42);
		for (let run = 0; run < 500; run++) {
			const { aspects, width, rowHeight } = randomCase(rand);
			const a = computeLayout(aspects, width, { rowHeight, spacing: 4 });
			const b = computeLayoutInline(aspects, width, { rowHeight, spacing: 4 });
			expect(b.boxes.length).toBe(a.boxes.length);
			for (let i = 0; i < a.boxes.length; i++) {
				expect(b.boxes[i].top).toBeCloseTo(a.boxes[i].top, 6);
				expect(b.boxes[i].left).toBeCloseTo(a.boxes[i].left, 6);
				expect(b.boxes[i].width).toBeCloseTo(a.boxes[i].width, 6);
				expect(b.boxes[i].height).toBeCloseTo(a.boxes[i].height, 6);
			}
			expect(b.height).toBeCloseTo(a.height, 6);
		}
	});

	it('the shipped inline script matches justified-layout too', () => {
		const rand = rng(7);
		for (let run = 0; run < 200; run++) {
			const { aspects, width, rowHeight } = randomCase(rand);
			const a = computeLayout(aspects, width, { rowHeight, spacing: 4 });
			const b = runInlineScript(aspects, width, { desktop: 280, mobile: 180 });
			expect(b.boxes.length).toBe(a.boxes.length);
			for (let i = 0; i < a.boxes.length; i++) {
				expect(b.boxes[i].top).toBeCloseTo(a.boxes[i].top, 3);
				expect(b.boxes[i].left).toBeCloseTo(a.boxes[i].left, 3);
				expect(b.boxes[i].width).toBeCloseTo(a.boxes[i].width, 3);
				expect(b.boxes[i].height).toBeCloseTo(a.boxes[i].height, 3);
			}
			expect(b.height).toBeCloseTo(a.height, 3);
		}
	});

	it('leaves the last row left-aligned at the previous row height', () => {
		const aspects = [1.5, 1.5, 1.5, 1.0];
		const layout = computeLayout(aspects, 1600, { rowHeight: 280, spacing: 4 });
		const last = layout.boxes[layout.boxes.length - 1];
		const previous = layout.boxes[layout.boxes.length - 2];
		expect(last.top).toBeGreaterThan(previous.top); // it sits alone on a new row
		expect(last.left).toBe(0);
		expect(last.height).toBeCloseTo(previous.height, 6);
		expect(last.width).toBeCloseTo(last.height, 6);
	});
});
