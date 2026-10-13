#!/usr/bin/env node
import './register.js';

const { run } = await import('../src/cli/index.ts');
await run();
