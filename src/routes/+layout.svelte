<script lang="ts">
	import '#lib/styles/tokens.css';
	import '#lib/styles/base.css';
	import '@fontsource-variable/inter';
	import favicon from '#lib/assets/favicon.svg';
	import SiteHeader from '#lib/components/SiteHeader.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	const site = $derived(data.site);
	// The footer links the author's site by its host name: "© Name · example.com".
	const authorHost = $derived(
		site.authorUrl ? new URL(site.authorUrl).hostname.replace(/^www\./, '') : ''
	);
	const themeVars = $derived(
		[
			`--accent-dark:${site.theme.accent}`,
			`--accent-light:${site.theme.accentLight}`,
			site.theme.fontSans === 'system' ? '--font-ui:ui-sans-serif,system-ui,sans-serif' : ''
		]
			.filter(Boolean)
			.join(';')
	);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- values are validated hex colours from the owner's config -->
	{@html `<style>:root{${themeVars}}</style>`}
</svelte:head>

<SiteHeader title={site.title} href={data.homeHref} themeMode={site.theme.mode} />

<main id="main">
	{@render children()}
</main>

<footer class="container site-footer">
	<p>
		{site.copyright}{#if site.copyright && authorHost}<span class="sep" aria-hidden="true">·</span
			>{/if}{#if authorHost}<a href={site.authorUrl} rel="author">{authorHost}</a>{/if}
	</p>
</footer>

<style>
	.site-footer {
		padding-block: 48px 32px;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
	.site-footer a {
		color: inherit;
	}
	.sep {
		margin-inline: 0.5em;
	}
</style>
