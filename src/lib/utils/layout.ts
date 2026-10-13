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

/**
 * The same algorithm, dependency-free, used by the inline pre-hydration script
 * so tiles are positioned before first paint. Parity with `computeLayout`
 * (including justified-layout's rounding and edge-case clamping) is covered by
 * a unit test.
 */
export function computeLayoutInline(aspects: number[], width: number, opts: LayoutOptions): Layout {
	const H = opts.rowHeight;
	const S = opts.spacing;
	const tol = opts.tolerance ?? 0.25;
	const boxes: LayoutBox[] = [];
	let top = 0;
	let lastRowHeight: number | undefined;
	let row: number[] = [];
	const minAspect = (width / H) * (1 - tol);
	const maxAspect = (width / H) * (1 + tol);
	const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
	const complete = (items: number[], newHeight: number, justify: boolean) => {
		const clamped = Math.max(0.5 * H, Math.min(newHeight, 2 * H));
		const ratio = clamped === newHeight ? 1 : newHeight / clamped;
		const rowBoxes: LayoutBox[] = [];
		let left = 0;
		for (const a of items) {
			const w = a * clamped * ratio;
			rowBoxes.push({ top, left, width: w, height: clamped });
			left += w + S;
		}
		if (justify) {
			const itemWidthSum = left - S;
			const err = (itemWidthSum - width) / items.length;
			const cum = items.map((_, i) => Math.round((i + 1) * err));
			if (items.length === 1) rowBoxes[0].width -= Math.round(err);
			else
				rowBoxes.forEach((b, i) => {
					if (i > 0) {
						b.left -= cum[i - 1];
						b.width -= cum[i] - cum[i - 1];
					} else b.width -= cum[i];
				});
		}
		boxes.push(...rowBoxes);
		top += clamped + S;
		lastRowHeight = clamped;
	};
	let i = 0;
	while (i < aspects.length) {
		const a = aspects[i];
		const next = row.concat(a);
		const rowWidth = width - (next.length - 1) * S;
		const newAspect = sum(next);
		const targetAspect = rowWidth / H;
		if (newAspect < minAspect) {
			row = next;
			i++;
		} else if (newAspect > maxAspect) {
			if (row.length === 0) {
				complete(next, rowWidth / newAspect, true);
				row = [];
				i++;
			} else {
				const prevWidth = width - (row.length - 1) * S;
				const prevAspect = sum(row);
				const prevTarget = prevWidth / H;
				if (Math.abs(newAspect - targetAspect) > Math.abs(prevAspect - prevTarget)) {
					complete(row, prevWidth / prevAspect, true);
					row = [];
					// item i is re-tried in a fresh row
				} else {
					complete(next, rowWidth / newAspect, true);
					row = [];
					i++;
				}
			}
		} else {
			complete(next, rowWidth / newAspect, true);
			row = [];
			i++;
		}
	}
	if (row.length) complete(row, lastRowHeight ?? H, false);
	const height = boxes.length ? top - S : 0;
	return { boxes, height };
}

/**
 * Source of the inline script: reads data-aspect from each tile, positions tiles
 * absolutely and sets the container height. Must stay in parity with computeLayoutInline.
 */
export const INLINE_LAYOUT_SCRIPT = `(function(g){if(!g)return;var W=g.clientWidth;if(!W)return;var H=W<${MOBILE_BREAKPOINT}?+g.dataset.rowMobile:+g.dataset.rowDesktop,S=${GRID_SPACING},tol=0.25,tiles=g.querySelectorAll('[data-aspect]'),n=tiles.length,A=[],i;for(i=0;i<n;i++)A.push(+tiles[i].dataset.aspect);var top=0,last,row=[],minA=W/H*(1-tol),maxA=W/H*(1+tol),out=[];function sum(x){var s=0;for(var j=0;j<x.length;j++)s+=x[j];return s}function done(items,nh,just){var c=Math.max(0.5*H,Math.min(nh,2*H)),r=c===nh?1:nh/c,rb=[],left=0,j;for(j=0;j<items.length;j++){var w=items[j]*c*r;rb.push([top,left,w,c]);left+=w+S}if(just){var e=(left-S-W)/items.length,cum=[];for(j=0;j<items.length;j++)cum.push(Math.round((j+1)*e));if(items.length===1)rb[0][2]-=Math.round(e);else for(j=0;j<rb.length;j++){if(j>0){rb[j][1]-=cum[j-1];rb[j][2]-=cum[j]-cum[j-1]}else rb[j][2]-=cum[j]}}for(j=0;j<rb.length;j++)out.push(rb[j]);top+=c+S;last=c}i=0;while(i<n){var a=A[i],next=row.concat(a),rw=W-(next.length-1)*S,na=sum(next),ta=rw/H;if(na<minA){row=next;i++}else if(na>maxA){if(!row.length){done(next,rw/na,1);row=[];i++}else{var pw=W-(row.length-1)*S,pa=sum(row),pt=pw/H;if(Math.abs(na-ta)>Math.abs(pa-pt)){done(row,pw/pa,1);row=[]}else{done(next,rw/na,1);row=[];i++}}}else{done(next,rw/na,1);row=[];i++}}if(row.length)done(row,last||H,0);for(i=0;i<n;i++){var b=out[i],st=tiles[i].style;st.top=b[0]+'px';st.left=b[1]+'px';st.width=b[2]+'px';st.height=b[3]+'px';var im=tiles[i].querySelector('img');if(im)im.sizes=Math.round(b[2])+'px'}g.style.height=(out.length?top-S:0)+'px';g.dataset.layout='abs'})(document.currentScript.previousElementSibling)`;
