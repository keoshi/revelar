#!/usr/bin/env node
// The package ships TypeScript source; tsx makes Node load it (including from node_modules,
// where Node's own type stripping refuses to). Registered for the whole process so the user's
// revelar.config.ts and Vite's config loading go through it too.
import { register } from 'tsx/esm/api';

register();
const { run } = await import('../src/cli/index.ts');
await run();
