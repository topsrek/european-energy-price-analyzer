#!/usr/bin/env node
// Runs the unit tests under several viewer time zones; market-time results must not change.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Run vitest's entry with this node binary: spawning `npx` needs a shell on Windows.
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

const zones = ['UTC', 'America/New_York', 'Asia/Tokyo', 'Europe/Vienna'];

for (const zone of zones) {
  console.log(`\n=== TZ=${zone} ===`);
  const result = spawnSync(process.execPath, [vitest, 'run', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, TZ: zone },
  });
  if (result.status !== 0) {
    console.error(`\nUnit tests failed under TZ=${zone}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\nUnit tests passed under: ${zones.join(', ')}`);
