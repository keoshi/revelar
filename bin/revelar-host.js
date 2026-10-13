#!/usr/bin/env node
// The engine as a child process for the desktop app (see src/engine/host.ts). Like bin/revelar.js
// it loads the TypeScript source through tsx; that also works under Electron's utility process.
import { register } from 'tsx/esm/api';

register();
const { startHost } = await import('../src/engine/host.ts');
startHost();
