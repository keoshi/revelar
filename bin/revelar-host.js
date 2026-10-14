#!/usr/bin/env node
// The engine as a child process for the desktop app (see src/engine/host.ts).
//
// REVELAR_WORK_DIR points at a writable folder (the app's data directory): builds then run from
// a mirror of the package made there (bin/workspace.js), because SvelteKit and Vite write next
// to the project and an installed app is read-only.
import './register.js';
import { prepareWorkspace } from './workspace.js';

if (process.env.REVELAR_WORK_DIR)
	process.env.REVELAR_PACKAGE_ROOT = prepareWorkspace(process.env.REVELAR_WORK_DIR);

const { startHost } = await import('../src/engine/host.ts');
startHost();
