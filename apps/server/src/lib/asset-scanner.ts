import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { PROJECT_CONFIG_DIR } from '@ludus/shared';
import { config } from '../config.js';
import { logger } from './logger.js';

// ─── Types ──────────────────────────────────────────────────────────

export type AssetType =
  | 'texture'
  | 'audio'
  | 'spriteframes'
  | 'font'
  | 'theme'
  | 'shader'
  | 'particles'
  | 'unknown';

export type AssetStatus = 'planned' | 'placeholder' | 'replaced' | 'final';

export interface AssetFileMeta {
  relPath: string;
  sizeBytes: number;
  sha256?: string;
  width?: number;
  height?: number;
  hframes?: number;
  duration?: number;
  modifiedAt?: string;
}

export interface AssetSpec {
  assetId: string;
  category: string;
  subcategory?: string;
  name: string;
  type: AssetType;
  spec?: string;
  milestone?: string;
  priority?: 'high' | 'medium' | 'low';
  status: AssetStatus;
  file?: AssetFileMeta;
}

interface PlannedAsset {
  assetId: string;
  category: string;
  subcategory?: string;
  name: string;
  type: AssetType;
  spec?: string;
  milestone?: string;
  priority?: 'high' | 'medium' | 'low';
}

// ─── Constants ──────────────────────────────────────────────────────

/**
 * The planned-assets manifest is project-owned (Phase B of the decoupling
 * plan). We read it from the configured project repo; if no project is
 * configured or the file is absent, the scanner returns an empty planned
 * list and only surfaces whatever it finds on disk.
 *
 * Lookup order inside projectRepoLocalPath:
 *   1. .ludus/assets-planned.json   (canonical, Phase B+)
 *   2. assets-planned.json            (legacy, one release of grace)
 */
function plannedAssetsCandidates(): string[] {
  const base = config.projectRepoLocalPath;
  if (!base) return [];
  return [
    path.join(base, PROJECT_CONFIG_DIR, 'assets-planned.json'),
    path.join(base, 'assets-planned.json'),
  ];
}

// assetId format: <category>.<subcategory>.<name> (dots ok in name)
const ASSET_ID_REGEX = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

const EXT_TO_TYPE: Record<string, AssetType> = {
  '.png': 'texture',
  '.jpg': 'texture',
  '.jpeg': 'texture',
  '.webp': 'texture',
  '.wav': 'audio',
  '.ogg': 'audio',
  '.mp3': 'audio',
  '.ttf': 'font',
  '.otf': 'font',
  '.tres': 'spriteframes', // rough default; could be theme/particles too
  '.gdshader': 'shader',
};

// Cache
interface CacheEntry {
  at: number;
  assets: AssetSpec[];
}
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 30_000;

// ─── Helpers ────────────────────────────────────────────────────────

async function loadPlanned(): Promise<PlannedAsset[]> {
  for (const candidate of plannedAssetsCandidates()) {
    try {
      const raw = await fs.readFile(candidate, 'utf8');
      return JSON.parse(raw) as PlannedAsset[];
    } catch {
      // try next candidate
    }
  }
  logger.info('[assetScanner] no planned-assets.json found in project repo — continuing with scan-only');
  return [];
}

function detectType(ext: string): AssetType {
  return EXT_TO_TYPE[ext.toLowerCase()] ?? 'unknown';
}

function pathToAssetId(relPath: string): string | null {
  // assets/sprites/characters/player.png → sprite.characters.player
  // assets/audio/sfx/plant.wav           → audio_sfx.plant
  // assets/audio/bgm/battle.ogg          → audio_bgm.battle
  // assets/tilemap/farm/ground.png       → tilemap.farm.ground
  // assets/ui/icons/coin.png             → ui.icons.coin
  // assets/vfx/particles/glow.png        → vfx.particles.glow
  // assets/animation/spriteframes/x.tres → animation.spriteframes.x
  // assets/font/main.ttf                 → ui.fonts.main

  const parts = relPath.split(path.sep).filter(Boolean);
  if (parts.length < 2 || parts[0] !== 'assets') return null;

  const segments = parts.slice(1);
  const fileSeg = segments[segments.length - 1];
  const name = path.parse(fileSeg).name;
  const dirSegments = segments.slice(0, -1);

  if (dirSegments.length === 0) return null;

  let category = dirSegments[0];

  // Normalize plurals (sprites → sprite, fonts → ui.fonts, etc.)
  if (category === 'sprites') category = 'sprite';
  else if (category === 'fonts') {
    return `ui.fonts.${name}`;
  } else if (category === 'tilemaps') category = 'tilemap';
  else if (category === 'audio') {
    const sub = dirSegments[1] ?? 'misc';
    // audio/sfx → audio_sfx, audio/bgm → audio_bgm
    category = `audio_${sub}`;
    const rest = dirSegments.slice(2);
    const subcat = rest[0];
    return subcat ? `${category}.${subcat}.${name}` : `${category}.${name}`;
  }

  const rest = dirSegments.slice(1);
  const body = [category, ...rest, name].join('.');
  return body;
}

async function safeStat(p: string): Promise<import('node:fs').Stats | null> {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

async function walk(dir: string, baseDir: string, acc: string[] = []): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue; // security: no symlinks
    if (entry.isDirectory()) {
      await walk(full, baseDir, acc);
    } else if (entry.isFile()) {
      acc.push(path.relative(baseDir, full));
    }
  }
  return acc;
}

async function computeSha256(fullPath: string): Promise<string | undefined> {
  try {
    const buf = await fs.readFile(fullPath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return undefined;
  }
}

// ─── PNG dimensions (no deps, IHDR chunk) ───────────────────────────

async function readPngDimensions(fullPath: string): Promise<{ width?: number; height?: number }> {
  try {
    const buf = await fs.readFile(fullPath, { flag: 'r' });
    // PNG signature 8 bytes, then IHDR chunk at offset 8; 4 bytes length, 4 bytes type, then data
    if (buf.length < 24) return {};
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return {};
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  } catch {
    return {};
  }
}

// ─── Main scan ──────────────────────────────────────────────────────

async function scanGameRepo(): Promise<Map<string, AssetFileMeta>> {
  const baseDir = config.projectRepoLocalPath;
  const map = new Map<string, AssetFileMeta>();
  if (!baseDir) return map;

  const assetsDir = path.join(baseDir, 'assets');
  const stat = await safeStat(assetsDir);
  if (!stat || !stat.isDirectory()) return map;

  const files = await walk(assetsDir, baseDir);
  for (const rel of files) {
    const assetId = pathToAssetId(rel);
    if (!assetId || !ASSET_ID_REGEX.test(assetId)) continue;

    const fullPath = path.join(baseDir, rel);
    const fstat = await safeStat(fullPath);
    if (!fstat) continue;

    const ext = path.extname(rel);
    let width: number | undefined;
    let height: number | undefined;
    if (ext === '.png') {
      const dim = await readPngDimensions(fullPath);
      width = dim.width;
      height = dim.height;
    }

    map.set(assetId, {
      relPath: rel,
      sizeBytes: fstat.size,
      sha256: await computeSha256(fullPath),
      modifiedAt: fstat.mtime.toISOString(),
      width,
      height,
    });
  }

  return map;
}

function mergeWithPlanned(
  planned: PlannedAsset[],
  fileMap: Map<string, AssetFileMeta>
): AssetSpec[] {
  const seen = new Set<string>();
  const out: AssetSpec[] = [];

  for (const p of planned) {
    const file = fileMap.get(p.assetId);
    seen.add(p.assetId);
    out.push({
      ...p,
      status: file ? 'placeholder' : 'planned',
      file,
    });
  }

  // Files that aren't in the planned list
  for (const [assetId, file] of fileMap) {
    if (seen.has(assetId)) continue;
    const parts = assetId.split('.');
    const category = parts[0];
    const name = parts[parts.length - 1];
    const subcategory = parts.length > 2 ? parts[1] : undefined;
    const ext = path.extname(file.relPath);
    out.push({
      assetId,
      category,
      subcategory,
      name,
      type: detectType(ext),
      status: 'placeholder',
      file,
    });
  }

  // Sort: by category, then milestone, then name
  out.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if ((a.milestone ?? 'Z') !== (b.milestone ?? 'Z'))
      return (a.milestone ?? 'Z').localeCompare(b.milestone ?? 'Z');
    return a.name.localeCompare(b.name);
  });

  return out;
}

export async function scanAssets(force = false): Promise<AssetSpec[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.assets;
  }
  const [planned, fileMap] = await Promise.all([loadPlanned(), scanGameRepo()]);
  const merged = mergeWithPlanned(planned, fileMap);
  cache = { at: Date.now(), assets: merged };
  return merged;
}

export function invalidateAssetCache(): void {
  cache = null;
}

// ─── Secure file path resolution ────────────────────────────────────

export async function resolveAssetFilePath(assetId: string): Promise<string | null> {
  if (!ASSET_ID_REGEX.test(assetId)) return null;

  const assets = await scanAssets();
  const match = assets.find((a) => a.assetId === assetId);
  if (!match?.file) return null;

  const baseDir = config.projectRepoLocalPath;
  if (!baseDir) return null;

  const fullPath = path.join(baseDir, match.file.relPath);
  const assetsRoot = path.join(baseDir, 'assets');
  const resolved = path.resolve(fullPath);
  // Must live under <projectRepo>/assets/
  if (!resolved.startsWith(path.resolve(assetsRoot) + path.sep)) return null;

  // Reject symlinks
  try {
    const lstat = await fs.lstat(resolved);
    if (lstat.isSymbolicLink()) return null;
  } catch {
    return null;
  }

  return resolved;
}
