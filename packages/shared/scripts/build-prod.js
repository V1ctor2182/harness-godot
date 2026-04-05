#!/usr/bin/env node

// Builds the shared package for production:
//   1. Runs tsc to compile TypeScript -> dist/
//   2. Patches package.json so main/exports point at compiled output
//
// Dev workflow uses src/index.ts directly (via tsx / transpilePackages).
// Production (Docker) needs compiled JS. This script bridges the gap
// without changing the dev-time package.json permanently.

const { execSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const pkgDir = join(__dirname, '..');
const pkgJsonPath = join(pkgDir, 'package.json');

// Step 1: compile
execSync('npx tsc', { cwd: pkgDir, stdio: 'inherit' });

// Step 2: patch exports to point at dist/
const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
pkg.main = 'dist/index.js';
pkg.exports = { '.': './dist/index.js' };
writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');

console.log('[shared] Built and patched exports -> dist/index.js');
