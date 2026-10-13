import createJustifiedLayout from 'justified-layout';

export type LayoutBox = { top: number; left: number; width: number; height: number };
export type Layout = { boxes: LayoutBox[]; height: number };
export type LayoutOptions = { rowHeight: number; spacing: number; tolerance?: number };

export const GRID_SPACING = 4;
export const MOBILE_BREAKPOINT = 640;

export function rowHeightFor(
	containerWidth: number,
	rows: { desktop: number; mobile: number }
): number {
	return containerWidth < MOBILE_BREAKPOINT ? rows.mobile : rows.desktop;
}

/** Client-side layout via Flickr's justified-layout. */
export function computeLayout(aspects: number[], width: number, opts: LayoutOptions): Layout {
	if (!aspects.length || width <= 0) return { boxes: [], height: 0 };
	const result = createJustifiedLayout(aspects, {
		containerWidth: width,
		containerPadding: 0,
		boxSpacing: opts.spacing,
		targetRowHeight: opts.rowHeight,
		targetRowHeightTolerance: opts.tolerance ?? 0.25,
		showWidows: true,
		widowLayoutStyle: 'left'
	});
	return {
		boxes: result.boxes.map((b) => ({
			top: b.top,
			left: b.left,
			width: b.width,
			height: b.height
		})),
		height: result.containerHeight
	};
}
