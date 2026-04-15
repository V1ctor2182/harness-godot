import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';

import { scanAssets, resolveAssetFilePath, invalidateAssetCache } from '../lib/asset-scanner.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.tres': 'text/plain',
  '.gdshader': 'text/plain',
};

// GET /api/assets — list all (with optional filters)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { category, milestone, status } = req.query as Record<string, string | undefined>;
    let items = await scanAssets();
    if (category) items = items.filter((a) => a.category === category);
    if (milestone) items = items.filter((a) => a.milestone === milestone);
    if (status) items = items.filter((a) => a.status === status);
    res.json(items);
  })
);

// POST /api/assets/rescan — force cache bust
router.post(
  '/rescan',
  asyncHandler(async (_req, res) => {
    invalidateAssetCache();
    const items = await scanAssets(true);
    res.json({ scanned: items.length });
  })
);

// GET /api/assets/:assetId/metadata — rich metadata
router.get(
  '/:assetId/metadata',
  asyncHandler(async (req, res) => {
    const assetId = req.params.assetId as string;
    const items = await scanAssets();
    const match = items.find((a) => a.assetId === assetId);
    if (!match) throw new NotFoundError('Asset', assetId);

    // History / usedIn are placeholders — require git log + grep (deferred to a
    // follow-up PR to avoid shelling out during the initial implementation).
    res.json({
      assetId,
      file: match.file,
      history: [],
      usedIn: [],
    });
  })
);

// GET /api/assets/:assetId/file — stream file bytes
router.get(
  '/:assetId/file',
  asyncHandler(async (req, res) => {
    const assetId = req.params.assetId as string;
    const resolved = await resolveAssetFilePath(assetId);
    if (!resolved) throw new NotFoundError('AssetFile', assetId);

    const ext = path.extname(resolved).toLowerCase();
    const mime = MIME[ext] ?? 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=60');

    const stream = fs.createReadStream(resolved);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  })
);

// Reject any other :assetId routes that don't match a known action
router.get(
  '/:assetId',
  asyncHandler(async (req) => {
    throw new ValidationError(`Use /api/assets/${req.params.assetId}/file or /metadata`);
  })
);

export default router;
