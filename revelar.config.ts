import { defineConfig } from './src/lib/config.ts';

export default defineConfig({
	site: {
		title: 'Photographs',
		description: 'Selected work',
		baseUrl: 'https://photos.example.com', // required for canonical/OG URLs; path becomes paths.base
		author: 'Your Name',
		copyright: '© Your Name',
		language: 'en',
		intro: '' // Markdown shown on the home page
	},
	photosDir: './photos',
	albumOrder: 'date-desc', // date-desc | date-asc | title | manual
	albumManualOrder: [], // slugs, when manual
	defaults: {
		sort: 'date-asc', // date-asc | date-desc | filename | manual
		downloads: 'large', // none | large | original (album zips are built at ingest when not none)
		location: 'approximate', // show | approximate | hide
		exifPanel: true
	},
	images: {
		widths: [320, 640, 960, 1280, 1920, 2560, 3840],
		avifQuality: 55,
		webpQuality: 78,
		jpegQuality: 82
	},
	viewer: {
		defaultView: 'grid', // fixed: albums always open in the grid
		slideshowInterval: 5000, // ms
		transition: 'crossfade', // crossfade | slide | none
		gridRowHeight: { desktop: 280, mobile: 180 },
		filmstrip: true
	},
	theme: {
		mode: 'system', // system | dark | light
		accent: '#e8c37a',
		fontSans: 'inter' // inter | system
	},
	map: {
		enabled: true,
		globalMap: false,
		styleLight: 'https://tiles.openfreemap.org/styles/liberty',
		styleDark: 'https://tiles.openfreemap.org/styles/dark'
	},
	privacy: { showPrivateTitles: false },
	feeds: { rss: true, sitemap: true }
});
