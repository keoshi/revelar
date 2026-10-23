/* Revelar for Mac, step by step: add an album, arrange it, preview the site, publish it.
   Every frame is drawn from t alone (HTMLDemo's vanilla engine). Labels, sizes and the busy
   card's messages are copied from app/src/renderer/src and src/engine/publish.ts. */
(function () {
	const { ease, typed, glide, held, mount } = HTMLDemo;
	const clamp01 = (x) => Math.min(1, Math.max(0, x));

	// The example: the Synthest album, in the order the app shows it before any arranging
	// (oldest first, as album.json lists it).
	const FILES = [
		'synthest-01.jpg',
		'synthest-02.jpg',
		'synthest-03.jpg',
		'synthest-04.jpg',
		'Synthest-05.jpg',
		'Synthest-06.jpg',
		'Synthest-07.jpg',
		'Synthest-08.jpg',
		'Synthest-09.jpg',
		'Synthest-11.jpg',
		'Synthest-10.jpg'
	];
	const ASPECT = {
		'synthest-01.jpg': 16 / 9,
		'synthest-02.jpg': 16 / 9,
		'synthest-03.jpg': 16 / 9,
		'synthest-04.jpg': 16 / 9,
		'Synthest-05.jpg': 1920 / 1350,
		'Synthest-06.jpg': 1920 / 1350,
		'Synthest-07.jpg': 1920 / 1350,
		'Synthest-08.jpg': 1500 / 1920,
		'Synthest-09.jpg': 1500 / 1920,
		'Synthest-10.jpg': 16 / 9,
		'Synthest-11.jpg': 16 / 9
	};
	const COVER = 'Synthest-08.jpg';
	const MOVED = 'Synthest-05.jpg'; // dragged to the front
	const FROM = FILES.indexOf(MOVED);
	const ARRANGED = [MOVED, ...FILES.filter((f) => f !== MOVED)];
	const TITLE = 'Synthest 52';
	const HOST_NAME = 'synthest-photos';
	const SITE_FILES = 219; // files in the built Synthest site
	const src = (f) => `demo/img/${f.toLowerCase().replace('.jpg', '.webp')}`;

	// ---- measuring ----------------------------------------------------------------------------
	/** An element's box in stage pixels (1200 × 750), whatever the window's scale. */
	function box(el) {
		const stage = el.closest('.hd-stage');
		const s = stage.getBoundingClientRect();
		const k = s.width / 1200;
		const b = el.getBoundingClientRect();
		return { x: (b.left - s.left) / k, y: (b.top - s.top) / k, w: b.width / k, h: b.height / k };
	}
	/** Where a hand lands on an element: 55% across, 60% down by default. */
	function aim($, sel, fx = 0.55, fy = 0.6) {
		const b = box($(sel));
		return [b.x + b.w * fx, b.y + b.h * fy];
	}
	const show = (el, on) => {
		el.style.visibility = on ? '' : 'hidden';
	};
	const fadeIn = (el, k, dy = 0) => {
		el.style.opacity = k;
		el.style.visibility = k > 0 ? '' : 'hidden';
		el.style.transform = dy && k < 1 ? `translateY(${(1 - k) * dy}px)` : '';
	};
	const caret = (t) => (Math.floor(t * 1.9) % 2 === 0 ? '<i class="rvd-caret"></i>' : '');

	// ---- the shell ----------------------------------------------------------------------------
	const MARK =
		'<svg viewBox="0 0 466 288" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M360 10.09V74c0 5.45 4.55 10 10 10h57.25c6.46 0 11.3 6.11 9.8 12.4l-15.2 63.84c-1.08 4.53-5.17 7.76-9.83 7.76h-27.85c-8.85 0-13.33 10.83-7.07 17.08l85.91 85.79c6.35 6.34 1.88 17.13-7.09 17.13H244.4c-2.7 0-5.29-1.06-7.21-2.97L137.07 185.04c-6.26-6.24-17.07-1.76-17.07 7.08v85.78c0 5.56-4.54 10.1-10.1 10.1H10.1C4.54 288 0 283.46 0 277.91v-99.82C0 172.54 4.54 168 10.09 168H350c5.45 0 10-4.55 10-10V94c0-5.45-4.55-10-10-10H10.09C4.54 84 0 79.46 0 73.91V10.09C0 4.54 4.54 0 10.09 0h339.82c5.55 0 10.09 4.54 10.09 10.09Z"/></svg>';
	const shell = (screens) => `
		<div class="rvd-top">
			<span class="rvd-lights"><i></i><i></i><i></i></span>
			<div class="rvd-brand">${MARK}<span>Revelar</span></div>
			<div class="rvd-seg" style="--n:3">
				<span data-nav="library">Library</span><span data-nav="preview">Preview</span><span data-nav="publish">Publish</span>
			</div>
			<div class="rvd-sitemenu"><b></b>Photographs<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></div>
		</div>
		<div class="rvd-main">${screens}</div>
		<div class="rvd-outro">${MARK}<span>Revelar</span></div>
		<div class="rvd-veil" style="visibility:hidden">
			<div class="rvd-busy">
				<span class="rvd-spin"></span>
				<div><strong></strong><span class="rvd-detailline"></span></div>
				<div class="rvd-bar"><i></i></div>
			</div>
		</div>`;

	/** Lights the screen's tab; `hover` names a tab under the pointer. */
	function nav($, on, hover) {
		for (const s of $('.rvd-seg').children) {
			s.classList.toggle('on', s.dataset.nav === on);
			s.classList.toggle('hover', s.dataset.nav === hover);
		}
	}

	/** The busy card through a run: phases are [from, to, label, detail?, progress 0–1?]. */
	function busy($, t, phases) {
		const veil = $('.rvd-veil');
		const start = phases[0][0];
		const end = phases[phases.length - 1][1];
		const k = Math.min(ease(t, start, start + 0.16), 1 - ease(t, end, end + 0.16));
		veil.style.opacity = k;
		veil.style.visibility = k > 0 ? '' : 'hidden';
		if (k <= 0) return;
		const card = $('.rvd-busy');
		card.style.transform = `translateY(${(1 - ease(t, start, start + 0.22)) * 10}px)`;
		let p = phases[0];
		for (const q of phases) if (t >= q[0]) p = q;
		const [, , label, detail, prog] = p;
		card.querySelector('strong').textContent = label;
		const d = card.querySelector('.rvd-detailline');
		d.textContent = detail ?? '';
		d.hidden = !detail;
		card.classList.toggle('progress', prog !== undefined);
		const bar = card.querySelector('.rvd-bar');
		bar.hidden = prog === undefined;
		if (prog !== undefined) bar.firstElementChild.style.width = `${Math.round(prog * 100)}%`;
		$('.rvd-spin').style.transform = `rotate(${(t * 450) % 360}deg)`;
	}

	// ---- screens ------------------------------------------------------------------------------
	const libraryHtml = `
		<div class="rvd-screen" data-screen="library">
			<div class="rvd-head">
				<div><h1>Photographs</h1><p class="rvd-hint" data-k="lib-hint"></p></div>
				<div class="rvd-row">
					<span class="rvd-btn" data-k="process">Process 1 album</span>
					<span class="rvd-btn" data-aim="add">Add album…</span>
					<span class="rvd-btn primary">Preview site</span>
				</div>
			</div>
			<div class="rvd-empty rvd-board" data-k="empty">
				<p>No albums yet.</p>
				<p class="rvd-hint">Add a folder of photos, or drop folders into <span class="rvd-code">/Users/you/Photographs/photos</span>. They appear here as soon as they land.</p>
			</div>
			<div class="rvd-cards" data-k="cards">
				<div class="rvd-card" data-aim="card">
					<div class="rvd-cover"><img src="${src(COVER)}" alt=""><span class="rvd-badge" data-k="np">not processed</span></div>
					<div class="rvd-meta"><strong>Synthest</strong><span>11 photos</span></div>
				</div>
			</div>
		</div>`;

	const field = (label, inner, k = '') =>
		`<div class="rvd-field"><span class="rvd-label">${label}</span>${inner}${k}</div>`;
	const albumHtml = `
		<div class="rvd-screen rvd-album" data-screen="album">
			<div class="rvd-head">
				<div>
					<span class="rvd-link">← Library</span>
					<h1>Synthest</h1>
					<p class="rvd-path">photos/Synthest · 11 photos</p>
				</div>
				<div class="rvd-row">
					<span class="rvd-autosave" data-k="autosave"></span>
					<span class="rvd-btn primary">Process photos</span>
				</div>
			</div>
			<div class="rvd-panes">
				<div class="rvd-pane">
					${field('Title', '<span class="rvd-input ph">Synthest</span>')}
					${field('Description (Markdown)', '<span class="rvd-input area"></span>')}
					${field('Date', '<span class="rvd-input ph">YYYY-MM-DD (from the folder or the photos)</span>')}
					${field('Visibility', '<div class="rvd-seg" style="--n:2"><span class="on">Public</span><span>Unlisted</span></div>', '<p class="rvd-hint">Listed on the site.</p>')}
					${field('Order', '<span class="rvd-input rvd-select" data-k="order">Site default</span>')}
					${field('Downloads', '<span class="rvd-input rvd-select">Site default</span>')}
					${field('Locations on the map', '<span class="rvd-input rvd-select">Site default</span>')}
				</div>
				<div class="rvd-pane">
					<p class="rvd-lead" data-k="lead"></p>
					<div class="rvd-thumbs">
						${FILES.map(
							(f) =>
								`<div class="rvd-thumb" data-file="${f}"><img src="${src(f)}" alt="">${f === COVER ? '<span class="rvd-badge cover">Cover</span>' : ''}</div>`
						).join('')}
						<div class="rvd-ghost"><img src="${src(MOVED)}" alt=""></div>
					</div>
				</div>
				<div class="rvd-pane">
					<p class="rvd-hint rvd-detail-empty" data-k="detail-empty">Select a photo to give it a title and caption, or make it the cover.</p>
					<div class="rvd-detail" data-k="detail">
						<img class="rvd-big" src="${src(MOVED)}" alt="">
						<p class="rvd-file" data-k="file"></p>
						${field('Title', '<span class="rvd-input" data-aim="ptitle"></span>')}
						${field('Caption', '<span class="rvd-input area"></span>')}
						<span class="rvd-btn primary" style="text-align:center">Use as cover</span>
						<div class="rvd-switch">Hide from the album<i></i></div>
					</div>
				</div>
			</div>
		</div>`;

	// The album page of the built site, rows justified the way the site lays them out.
	function siteRows(order, width, target, gap) {
		const rows = [];
		let row = [];
		let sum = 0;
		for (const f of order) {
			row.push(f);
			sum += ASPECT[f];
			if (sum * target + gap * (row.length - 1) >= width) {
				rows.push({ files: row, h: (width - gap * (row.length - 1)) / sum });
				row = [];
				sum = 0;
			}
		}
		if (row.length) rows.push({ files: row, h: target });
		return rows
			.map(
				(r) =>
					`<div class="rvd-jrow">${r.files
						.map(
							(f) =>
								`<img src="${src(f)}" alt="" style="width:${(ASPECT[f] * r.h).toFixed(1)}px;height:${r.h.toFixed(1)}px">`
						)
						.join('')}</div>`
			)
			.join('');
	}
	const previewHtml = `
		<div class="rvd-screen rvd-preview" data-screen="preview">
			<div class="rvd-row">
				<h1>Preview</h1>
				<span class="rvd-url" data-k="url"></span>
				<span class="rvd-btn">Rebuild</span>
				<span class="rvd-btn ext" data-k="open">Open in browser</span>
			</div>
			<div class="rvd-frame">
				<div class="rvd-site" data-k="site">
					<div class="rvd-site-top">Photographs<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="3.6"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg></div>
					<div class="rvd-site-head">
						<div><h2>Synthest</h2><p>April 2024 – June 2025 · 11 photos</p></div>
						<div class="rvd-site-act"><span class="play">Play</span><span class="dl">Download album · 3.0 MB</span></div>
					</div>
					${siteRows(ARRANGED, 1112, 215, 3)}
				</div>
			</div>
		</div>`;

	const ICONS = {
		netlify:
			'M6.49 19.04h-.23L5.13 17.9v-.23l1.73-1.71h1.2l.15.15v1.2L6.5 19.04ZM5.13 6.31V6.1l1.13-1.13h.23L8.2 6.68v1.2l-.15.15h-1.2L5.13 6.31Zm9.96 9.09h-1.65l-.14-.13v-3.83c0-.68-.27-1.2-1.1-1.23-.42 0-.9 0-1.43.02l-.07.08v4.96l-.14.14H8.9l-.13-.14V8.73l.13-.14h3.7a2.6 2.6 0 0 1 2.61 2.6v4.08l-.13.14Zm-8.37-2.44H.14L0 12.82v-1.64l.14-.14h6.58l.14.14v1.64l-.14.14Zm17.14 0h-6.58l-.14-.14v-1.64l.14-.14h6.58l.14.14v1.64l-.14.14ZM11.05 6.55V1.64l.14-.14h1.65l.14.14v4.9l-.14.14h-1.65l-.14-.13Zm0 15.81v-4.9l.14-.14h1.65l.14.13v4.91l-.14.14h-1.65l-.14-.14Z',
		vercel: 'm12 1.608 12 20.784H0Z',
		cloudflare:
			'M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.3154-.2246-.3164-.6045-.499-1.0615-.5205l-8.6592-.1123a.1559.1559 0 0 1-.1333-.0713c-.0283-.042-.0351-.0986-.021-.1553.0278-.084.1123-.1484.2036-.1562l8.7359-.1123c1.0351-.0489 2.1601-.8868 2.5537-1.9136l.499-1.3013c.0215-.0561.0293-.1128.0147-.168-.5625-2.5463-2.835-4.4453-5.5499-4.4453-2.5039 0-4.6284 1.6177-5.3876 3.8614-.4927-.3658-1.1187-.5625-1.794-.499-1.2026.119-2.1665 1.083-2.2861 2.2856-.0283.31-.0069.6128.0635.894C1.5683 13.171 0 14.7754 0 16.752c0 .1748.0142.3515.0352.5273.0141.083.0844.1475.1689.1475h15.9814c.0909 0 .1758-.0645.2032-.1553l.12-.4268zm2.7568-5.5634c-.0771 0-.1611 0-.2383.0112-.0566 0-.1054.0415-.127.0976l-.3378 1.1744c-.1475.5068-.0918.9707.1543 1.3164.2256.3164.6055.498 1.0625.5195l1.8437.1133c.0557 0 .1055.0263.1329.0703.0283.043.0351.1074.0214.1562-.0283.084-.1132.1485-.204.1553l-1.921.1123c-1.041.0488-2.1582.8867-2.5527 1.914l-.1406.3585c-.0283.0713.0215.1416.0986.1416h6.5977c.0771 0 .1474-.0489.169-.126.1122-.4082.1757-.837.1757-1.2803 0-2.6025-2.125-4.727-4.7344-4.727',
		github:
			'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12'
	};
	const tile = (label, path, brand, on, k = '') =>
		`<div class="rvd-tile${on ? ' on' : ''}" style="--brand:${brand}"${k}><svg viewBox="0 0 24 24"><path d="${path}" fill="currentColor"/></svg><span>${label}</span></div>`;
	const publishHtml = `
		<div class="rvd-screen" data-screen="publish"><div class="rvd-publish">
			<div>
				<h1>Publish</h1>
				<p class="rvd-hint">Pick a host. Each one serves static sites for free; all the app needs is a token from your account, kept encrypted on this computer. Or make the site as a folder to upload to a server of your own.</p>
			</div>
			<div class="rvd-tiles">
				${tile('Netlify', ICONS.netlify, '#00C7B7', true, ' data-k="netlify"')}
				${tile('Vercel', ICONS.vercel, 'var(--ink)')}
				${tile('Cloudflare Pages', ICONS.cloudflare, '#F38020')}
				${tile('GitHub Pages', ICONS.github, 'var(--ink)')}
				<div class="rvd-tile" style="--brand:var(--accent)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="6" rx="1.5"/><rect x="3" y="13" width="18" height="6" rx="1.5"/><path d="M7 8h.01M7 16h.01"/></svg><span>Your own server</span></div>
			</div>
			<div class="rvd-pform">
				${field('Netlify personal access token', '<span class="rvd-input" data-aim="token"></span>', '<p class="rvd-hint">User settings → Applications → Personal access tokens. <span class="rvd-u">Get one</span> ↗</p>')}
				${field('Site name', '<span class="rvd-input" data-aim="name"></span>', '<p class="rvd-hint" data-k="update-hint">Publishing updates the existing site. <span class="rvd-u">Create a new one instead</span></p>')}
				<p class="rvd-address">
					<span class="rvd-hint">Site address</span>
					<strong data-k="address"></strong>
					<span class="rvd-hint">Set in the site's config for you when you publish, so shared links and the sitemap point at it.</span>
				</p>
				<div class="rvd-row">
					<span class="rvd-btn primary" data-aim="publish">Publish</span>
					<span class="rvd-btn ext" data-k="live">Open ${HOST_NAME}.netlify.app</span>
				</div>
			</div>
		</div></div>`;

	const screens = libraryHtml + albumHtml + previewHtml + publishHtml;
	/** Shows one screen, faded in over 180 ms from `since` (App.svelte's in:fade, delay 40). */
	function screen($, name, t, since = -1) {
		for (const s of $('.rvd-main').children) {
			const on = s.dataset.screen === name;
			const k = on ? (since < 0 ? 1 : ease(t, since + 0.04, since + 0.22)) : 0;
			s.style.opacity = k;
			s.style.visibility = on ? '' : 'hidden';
		}
	}

	// ---- the album editor's state at t ---------------------------------------------------------
	/**
	 * Lays out the thumbnails. `slotOf(file)` gives each photo's slot (fractional while it slides)
	 * and `state` says which is selected, held or dragged.
	 */
	function thumbs($, slotOf, state) {
		const grid = $('.rvd-thumbs');
		const w = (grid.clientWidth - 40) / 5;
		const pitch = w + 10;
		grid.style.height = `${pitch * 3}px`;
		for (const el of grid.querySelectorAll('.rvd-thumb')) {
			const f = el.dataset.file;
			const s = slotOf(f);
			const x = (s % 5) * pitch;
			const y = Math.floor(s / 5) * pitch;
			el.style.width = el.style.height = `${w}px`;
			el.style.transform = `translate(${x}px, ${y}px)`;
			el.classList.toggle('sel', state.selected === f && state.hole !== f);
			el.classList.toggle('hole', state.hole === f);
		}
		return { w, pitch };
	}
	function albumForm($, { custom, title, saving, focus, t }) {
		$('[data-k="order"]').textContent = custom ? 'Custom (drag photos to arrange)' : 'Site default';
		$('[data-k="lead"]').textContent = custom
			? 'Drag photos to arrange them (custom order).'
			: 'Drag photos to arrange them.';
		const pt = $('[data-aim="ptitle"]');
		pt.innerHTML = (title ?? '') + (focus ? caret(t) : '');
		pt.classList.toggle('focus', !!focus);
		const a = $('[data-k="autosave"]');
		a.textContent = saving === 'saving' ? 'Saving…' : 'Saved';
		a.style.opacity = saving ? 1 : 0;
	}
	function detail($, k, position) {
		const d = $('[data-k="detail"]');
		d.hidden = k <= 0;
		fadeIn(d, k, 8);
		$('[data-k="detail-empty"]').hidden = k > 0;
		$('[data-k="file"]').textContent = `${position} of 11 · ${MOVED}`;
	}
	/** The album as it stands after arranging and titling: the end of step 2. */
	function albumDone($) {
		screen($, 'album', 0);
		thumbs($, (f) => ARRANGED.indexOf(f), { selected: MOVED });
		$('.rvd-ghost').hidden = true;
		albumForm($, { custom: true, title: TITLE });
		detail($, 1, 1);
	}

	// ---- step 1: add an album ----------------------------------------------------------------
	const ADD_AT = 1.3,
		COPY_AT = 1.45,
		LISTED_AT = 2.2,
		PROCESSED_AT = 4.5,
		OPEN_AT = 6.7;
	function drawAdd(t, $) {
		nav($, 'library');
		screen($, 'library', t);
		const listed = t >= LISTED_AT;
		const done = t >= PROCESSED_AT;
		$('[data-k="lib-hint"]').textContent = !listed
			? '0 albums · everything processed'
			: done
				? '1 album · everything processed'
				: '1 album · 1 to process';
		$('[data-k="process"]').hidden = !listed || done;
		$('[data-k="empty"]').hidden = listed;
		const cards = $('[data-k="cards"]');
		cards.hidden = !listed;
		fadeIn(cards, ease(t, LISTED_AT, LISTED_AT + 0.42), 8);
		show($('[data-k="np"]'), !done);

		const n = Math.round(11 * clamp01((t - 2.35) / 1.95));
		busy($, t, [
			[COPY_AT, LISTED_AT, 'Copying photos'],
			[LISTED_AT, PROCESSED_AT, 'Processing photos', `synthest · ${n} of 11`, n / 11]
		]);

		const add = aim($, '[data-aim="add"]');
		// Measured while the card is showing; before that it sits where it will appear.
		const cardBox = box($('[data-aim="card"] .rvd-cover'));
		const card = listed ? [cardBox.x + cardBox.w * 0.55, cardBox.y + cardBox.h * 0.6] : [160, 240];
		const c = glide(
			t,
			[
				[0, 0, 820, 470],
				[0.4, 1.05, ...add],
				[5.3, 6.1, ...card]
			],
			[ADD_AT, OPEN_AT]
		);
		$('[data-aim="add"]').classList.toggle('hover', t >= 1.05 && t < COPY_AT);
		$('[data-aim="add"]').classList.toggle('down', held(t, ADD_AT));
		const lift = ease(t, 6.0, 6.25);
		const cover = $('[data-aim="card"] .rvd-cover');
		cover.style.transform = `translateY(${-2 * lift}px)`;
		cover.style.boxShadow = lift ? `0 10px 24px rgb(17 17 26 / ${0.18 * lift})` : '';
		cover.querySelector('img').style.transform = `scale(${1 + 0.03 * lift})`;
		// Gone once the album opens, so the end frame is the library alone.
		c.hide = t >= 6.9;
		return { cursor: c };
	}

	// ---- step 2: arrange ----------------------------------------------------------------------
	const PRESS_AT = 1.15,
		LIFT_AT = 1.35,
		DRAG_TO = 2.5,
		DROP_AT = 2.75,
		SAVED_1 = DROP_AT + 0.85,
		TITLE_AT = 4.3,
		TYPE_FROM = 4.55,
		TYPE_TO = 5.15,
		SAVING_2 = TYPE_TO + 0.7,
		SAVED_2 = SAVING_2 + 0.15;
	function drawArrange(t, $) {
		nav($, 'library');
		screen($, 'album', t, 0);
		// The detail pane first: whether it shows moves the title field the pointer aims at.
		detail($, ease(t, LIFT_AT, LIFT_AT + 0.42), 1);
		const grid = box($('.rvd-thumbs'));
		const w = (grid.w - 40) / 5;
		const pitch = w + 10;
		const centre = (slot) => [
			grid.x + (slot % 5) * pitch + w * 0.55,
			grid.y + Math.floor(slot / 5) * pitch + w * 0.6
		];
		const ptitle = aim($, '[data-aim="ptitle"]', 0.3, 0.55);
		const path = [
			[0, 0, 165, 240],
			[0.3, 1.0, ...centre(FROM)],
			[LIFT_AT, DRAG_TO, ...centre(0)],
			[3.5, 4.1, ...ptitle]
		];
		const at = (s) => glide(s, path);
		// The slot under the pointer while dragging, as Album.svelte's settle() picks it.
		const slotAt = (s) => {
			if (s < LIFT_AT) return FROM;
			if (s >= DROP_AT) return 0;
			const x = at(s).x - grid.x - w * 0.55;
			return Math.max(0, Math.min(FROM, Math.round(x / pitch)));
		};
		// When each photo in front of it was pushed along (animate:flip, 200 ms).
		const pushed = [];
		for (let j = 0; j < FROM; j++) {
			let s = LIFT_AT;
			while (s < DROP_AT && slotAt(s) > j) s += 0.01;
			pushed[j] = s;
		}
		const dragging = t >= LIFT_AT && t < DROP_AT;
		thumbs(
			$,
			(f) => {
				if (f === MOVED) return slotAt(t);
				const j = FILES.indexOf(f);
				return j < FROM ? j + ease(t, pushed[j], pushed[j] + 0.2) : j;
			},
			{ selected: t >= LIFT_AT ? MOVED : '', hole: dragging ? MOVED : '' }
		);
		const ghost = $('.rvd-ghost');
		ghost.hidden = !dragging;
		const c = glide(t, path, [TITLE_AT]);
		c.press = c.press || (t >= PRESS_AT && t < DROP_AT);
		if (dragging) {
			const lift = 1 + 0.06 * ease(t, LIFT_AT, LIFT_AT + 0.16);
			ghost.style.width = ghost.style.height = `${w}px`;
			ghost.style.transform = `translate(${c.x - grid.x - w * 0.55}px, ${c.y - grid.y - w * 0.6}px) scale(${lift})`;
		}
		const saving =
			t >= SAVED_2
				? t < SAVED_2 + 1.8
					? 'saved'
					: ''
				: t >= SAVING_2
					? 'saving'
					: t >= SAVED_1 && t < SAVED_1 + 1.8
						? 'saved'
						: t >= SAVED_1 - 0.15 && t < SAVED_1
							? 'saving'
							: '';
		albumForm($, {
			custom: t >= DROP_AT,
			title: typed(TITLE, t, TYPE_FROM, TYPE_TO),
			saving,
			focus: t >= TITLE_AT + 0.05,
			t
		});
		detail($, ease(t, LIFT_AT, LIFT_AT + 0.42), slotAt(t) + 1);
		return { cursor: c };
	}

	// ---- step 3: preview ----------------------------------------------------------------------
	const NAV_AT = 0.95,
		PROCESS_FROM = 1.05,
		BUILD_FROM = 1.7,
		SERVED_AT = 3.0;
	function drawPreview(t, $) {
		const on = t >= NAV_AT + 0.05;
		nav($, on ? 'preview' : 'library', t >= 0.8 && !on ? 'preview' : '');
		if (on) screen($, 'preview', t, NAV_AT);
		else albumDone($);
		const served = t >= SERVED_AT;
		$('[data-k="url"]').textContent = served ? 'http://localhost:4173/' : 'Building…';
		show($('[data-k="open"]'), served);
		const site = $('[data-k="site"]');
		site.style.opacity = ease(t, SERVED_AT, SERVED_AT + 0.3);
		site.style.transform = `translateY(${-150 * ease(t, 3.8, 6.0)}px)`;
		busy($, t, [
			[PROCESS_FROM, BUILD_FROM, 'Processing photos'],
			[BUILD_FROM, SERVED_AT, 'Building the site']
		]);
		const c = glide(
			t,
			[
				// from the title field, where arranging left it
				[0, 0, ...aim($, '[data-aim="ptitle"]', 0.3, 0.55)],
				[0.2, 0.8, ...aim($, '[data-nav="preview"]')],
				[1.3, 1.9, 1090, 700]
			],
			[NAV_AT]
		);
		c.hide = t >= 2.0;
		return { cursor: c };
	}

	// ---- step 4: publish ----------------------------------------------------------------------
	const PUB_NAV = 0.95,
		TOKEN_AT = 2.0,
		PASTE_AT = 2.35,
		NAME_AT = 3.2,
		NAME_FROM = 3.45,
		NAME_TO = 4.2,
		PUBLISH_AT = 5.05,
		LIVE_AT = 8.45,
		OUTRO_AT = 9.7,
		MARK_IN = 10.2,
		MARK_OUT = 12.4,
		PUBLISH_DUR = 13;
	function drawPublish(t, $) {
		const on = t >= PUB_NAV + 0.05;
		nav($, on ? 'publish' : 'preview', t >= 0.8 && !on ? 'publish' : '');
		if (on) screen($, 'publish', t, PUB_NAV);
		else {
			screen($, 'preview', t);
			$('[data-k="url"]').textContent = 'http://localhost:4173/';
			$('[data-k="site"]').style.transform = 'translateY(-150px)';
		}
		const live = t >= LIVE_AT;
		const token = $('[data-aim="token"]');
		token.textContent = t >= PASTE_AT ? '•'.repeat(40) : '';
		token.classList.toggle('focus', t >= TOKEN_AT + 0.05 && t < NAME_AT + 0.05);
		const name = $('[data-aim="name"]');
		const typedName = typed(HOST_NAME, t, NAME_FROM, NAME_TO);
		const naming = t >= NAME_AT + 0.05 && t < PUBLISH_AT;
		name.innerHTML = typedName
			? typedName + (naming ? caret(t) : '')
			: naming
				? caret(t)
				: 'my-photos';
		name.classList.toggle('ph', !typedName);
		name.classList.toggle('focus', naming);
		name.classList.toggle('dim', live);
		show($('[data-k="update-hint"]'), live);
		$('[data-k="update-hint"]').style.display = live ? '' : 'none';
		$('[data-k="address"]').textContent = `https://${typedName || 'something-random'}.netlify.app`;
		const btn = $('[data-aim="publish"]');
		btn.textContent = live ? 'Publish update' : 'Publish';
		btn.classList.toggle('off', t < PASTE_AT || (t >= PUBLISH_AT && !live));
		btn.classList.toggle('hover', t >= 4.9 && t < PUBLISH_AT + 0.1);
		btn.classList.toggle('down', held(t, PUBLISH_AT));
		show($('[data-k="live"]'), live);
		const tileEl = $('[data-k="netlify"]');
		if (!tileEl.querySelector('.rvd-ok'))
			tileEl.insertAdjacentHTML('beforeend', '<span class="rvd-ok"></span>');
		show(tileEl.querySelector('.rvd-ok'), live);

		const address = `https://${HOST_NAME}.netlify.app`;
		const packed = Math.round(SITE_FILES * clamp01((t - 6.85) / 0.5));
		busy($, t, [
			[PUBLISH_AT + 0.1, 5.5, `Site address set to ${address}`],
			[5.5, 5.9, 'Processing photos'],
			[5.9, 6.5, 'Building the site'],
			[6.5, 6.8, 'Creating the Netlify site'],
			[6.8, 7.4, 'Packing the site', `${packed} of ${SITE_FILES}`, packed / SITE_FILES],
			[7.4, 7.9, 'Uploading to Netlify', `${SITE_FILES} of ${SITE_FILES}`, 1],
			[7.9, 8.3, 'Waiting for Netlify to process the deploy', `${SITE_FILES} of ${SITE_FILES}`, 1],
			[8.3, LIVE_AT, `Live at ${address}`, `${SITE_FILES} of ${SITE_FILES}`, 1]
		]);
		const c = glide(
			t,
			[
				[0, 0, 1090, 700],
				[0.15, 0.8, ...aim($, '[data-nav="publish"]')],
				[1.3, 1.9, ...aim($, '[data-aim="token"]', 0.3)],
				[2.6, 3.1, ...aim($, '[data-aim="name"]', 0.3)],
				[4.4, 4.9, ...aim($, '[data-aim="publish"]')],
				[8.6, 9.2, 820, 640]
			],
			[PUB_NAV, TOKEN_AT, NAME_AT, PUBLISH_AT]
		);
		c.hide = t >= 9.3;
		outro($, t >= PUBLISH_DUR ? 0 : t);
		return { cursor: c };
	}

	/**
	 * The ending: the app fades away and the mark rises in its place, then fades out so the loop
	 * starts again from an empty window. Under reduced motion the step stands on its end frame
	 * (t = dur), which keeps the published app, so t is passed as 0 there.
	 */
	function outro($, t) {
		const away = ease(t, OUTRO_AT, OUTRO_AT + 0.6);
		for (const sel of ['.rvd-top', '.rvd-main']) $(sel).style.opacity = 1 - away;
		const mark = $('.rvd-outro');
		const k = Math.min(ease(t, MARK_IN, MARK_IN + 0.8), 1 - ease(t, MARK_OUT, MARK_OUT + 0.5));
		mark.style.opacity = k;
		mark.style.transform = `translate(-50%, -50%) scale(${0.96 + 0.04 * ease(t, MARK_IN, MARK_IN + 1.2)})`;
	}

	// Arranging and seeing the finished site are one step on the page ("Make it yours").
	// Cut as the title is typed: the autosave that follows changes nothing worth watching.
	const ARRANGE_DUR = 5.6;
	const drawMake = (t, $) =>
		t < ARRANGE_DUR ? drawArrange(t, $) : drawPreview(t - ARRANGE_DUR, $);

	const html = shell(screens);
	const STEPS = [
		// Named as the page's three steps below the hero.
		{ id: 'folder', name: 'Pick a folder', dur: 7, html, draw: drawAdd },
		{ id: 'make', name: 'Make it yours', dur: ARRANGE_DUR + 6.5, html, draw: drawMake },
		{ id: 'online', name: 'Put it online', dur: PUBLISH_DUR, html, draw: drawPublish }
	];
	// Pictures load once, before the first step needs them.
	for (const f of FILES) new Image().src = src(f);

	window.RevelarDemo = {
		STEPS,
		mount: (el) => mount(el, { steps: STEPS, label: 'Revelar for Mac', stageClass: 'rvd' })
	};
})();
