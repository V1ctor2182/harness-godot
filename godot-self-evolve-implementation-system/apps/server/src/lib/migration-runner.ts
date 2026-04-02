import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MigrationModel } from '../models/migration.js';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

interface MigrationScript {
  up: () => Promise<void>;
}

export async function runMigrations(): Promise<void> {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'))
    .sort();

  if (files.length === 0) return;

  const applied = await MigrationModel.find({}).lean();
  const appliedNames = new Set(applied.map((m) => m._id));

  for (const file of files) {
    const name = path.basename(file, path.extname(file));
    if (appliedNames.has(name)) continue;

    console.log(`Running migration: ${name}`);
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const mod = (await import(pathToFileURL(fullPath).href)) as MigrationScript;
    await mod.up();
    await MigrationModel.create({ _id: name });
    console.log(`Migration applied: ${name}`);
  }
}
