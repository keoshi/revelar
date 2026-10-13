#!/usr/bin/env tsx
import { runIngest } from './ingest/index.js';

const args = new Set(process.argv.slice(2));

runIngest({ force: args.has('--force'), quiet: args.has('--quiet') })
	.then((report) => {
		if (report.errors.length > 0) process.exit(1);
	})
	.catch((err) => {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	});
