/**
 * The `revelar` command. Runs in any folder that holds a `revelar.config.ts` and a `photos/`
 * directory (the "site root"); `--root` or REVELAR_SITE_ROOT point it elsewhere.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runIngest } from '../engine/ingest.ts';
import { buildSite, previewSite } from '../engine/build.ts';
import { devServer } from '../engine/dev.ts';
import { shareLinks } from '../engine/share.ts';

const USAGE = `usage: revelar <command> [options]

  init                 create revelar.config.ts, photos/ and .gitignore here
  ingest [--force]     process photos/ into static/media and .cache/manifest.json
  build [--no-ingest]  ingest, then build the site into build/
  dev [--port N]       dev server with live re-ingest of photos/
  preview [--port N]   serve build/ locally
  share <album>        print a private album's URL and its #k= key link

options: --root <dir> (default: current directory), --config <file>, --quiet`;

type Flags = { [key: string]: string | boolean | undefined };

function parse(argv: string[]): {
	command: string | undefined;
	positional: string[];
	flags: Flags;
} {
	const flags: Flags = {};
	const positional: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg.startsWith('--')) {
			const [name, inline] = arg.slice(2).split('=', 2);
			if (inline !== undefined) flags[name] = inline;
			else if (name.startsWith('no-')) flags[name.slice(3)] = false;
			else if (
				argv[i + 1] &&
				!argv[i + 1].startsWith('--') &&
				['root', 'config', 'port'].includes(name)
			)
				flags[name] = argv[++i];
			else flags[name] = true;
		} else positional.push(arg);
	}
	const [command, ...rest] = positional;
	return { command, positional: rest, flags };
}

const CONFIG_TEMPLATE = `import { defineConfig } from 'revelar/config';

export default defineConfig({
	site: {
		title: 'Photographs',
		description: 'Selected work',
		baseUrl: 'https://photos.example.com', // required for canonical/OG URLs; its path becomes the base path
		author: 'Your Name',
		authorUrl: '',
		copyright: '© Your Name',
		language: 'en'
	},
	photosDir: './photos'
});
`;

const GITIGNORE_TEMPLATE = `node_modules
build
static/media
static/media-private
static/downloads
.svelte-kit
.cache/*
!.cache/private-tokens.json
`;

export async function main(argv: string[]): Promise<number> {
	const { command, positional, flags } = parse(argv);
	if (!command || flags.help) {
		console.log(USAGE);
		return command ? 0 : 1;
	}
	const root = resolve(
		typeof flags.root === 'string' ? flags.root : (process.env.REVELAR_SITE_ROOT ?? '.')
	);
	process.env.REVELAR_SITE_ROOT = root;
	const config = typeof flags.config === 'string' ? resolve(flags.config) : undefined;
	if (config) process.env.REVELAR_CONFIG = config;
	const quiet = Boolean(flags.quiet);
	const port = typeof flags.port === 'string' ? Number(flags.port) : undefined;

	switch (command) {
		case 'init': {
			mkdirSync(join(root, 'photos'), { recursive: true });
			const written: string[] = [];
			const write = (name: string, content: string) => {
				const path = join(root, name);
				if (existsSync(path)) return;
				writeFileSync(path, content);
				written.push(name);
			};
			write('revelar.config.ts', CONFIG_TEMPLATE);
			write('.gitignore', GITIGNORE_TEMPLATE);
			console.log(
				written.length
					? `Created ${written.join(', ')}. Put albums (folders of photos) in photos/ and run \`revelar build\`.`
					: 'Nothing to do: revelar.config.ts and .gitignore already exist.'
			);
			return 0;
		}
		case 'ingest': {
			const report = await runIngest({ root, force: Boolean(flags.force), quiet });
			return report.errors.length ? 1 : 0;
		}
		case 'build': {
			if (flags.ingest !== false) {
				const report = await runIngest({ root, force: Boolean(flags.force), quiet });
				if (report.errors.length) return 1;
			}
			const { outDir, removedDataFiles } = await buildSite({
				root,
				config,
				logLevel: quiet ? 'warn' : undefined
			});
			if (!quiet)
				console.log(`Wrote site to ${outDir} (${removedDataFiles} __data.json files removed)`);
			return 0;
		}
		case 'dev': {
			await devServer({ root, config, port, open: Boolean(flags.open) });
			return new Promise(() => {}); // keep running until Ctrl-C
		}
		case 'preview': {
			const { url } = await previewSite({
				root,
				config,
				port,
				strictPort: Boolean(flags['strict-port'])
			});
			console.log(`Serving build/ at ${url}`);
			return new Promise(() => {});
		}
		case 'share': {
			const slug = positional[0];
			if (!slug) {
				console.error('usage: revelar share <album-slug>');
				return 1;
			}
			const { url, keyLink } = await shareLinks(slug, { root, config });
			console.log(`Album URL (asks for the password):\n  ${url}\n`);
			console.log(
				`Key link (unlocks without a password — share only with people who may see the album):\n  ${keyLink}`
			);
			return 0;
		}
		default:
			console.error(`Unknown command "${command}".\n\n${USAGE}`);
			return 1;
	}
}

/** Entry point used by bin/revelar.js and `npm run revelar`. */
export async function run(): Promise<void> {
	try {
		const code = await main(process.argv.slice(2));
		process.exitCode = code;
	} catch (err) {
		console.error(err instanceof Error ? err.message : err);
		process.exitCode = 1;
	}
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) await run();
