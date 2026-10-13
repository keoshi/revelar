#!/usr/bin/env node
// The engine as a child process for the desktop app (see src/engine/host.ts).
import './register.js';

const { startHost } = await import('../src/engine/host.ts');
startHost();
