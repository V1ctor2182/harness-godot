import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { KnowledgeFileModel } from '../models/knowledge-file.js';
import { NotFoundError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();

const knowledgeCategoryEnum = z.enum([
  'skills',
  'decisions',
  'specs',
  'journal',
  'inbox',
  'pruned',
  'retrospectives',
]);

const createKnowledgeSchema = z.object({
  _id: z.string().optional(),
  title: z.string(),
  content: z.string(),
  category: knowledgeCategoryEnum,
  snippet: z.string().optional(),
  source: z
    .object({
      type: z.enum(['human', 'agent']),
      agentRunId: z.string().optional(),
    })
    .optional(),
});

const patchKnowledgeSchema = z
  .object({
    status: z.enum(['active', 'processed', 'archived']).optional(),
    content: z.string().optional(),
    title: z.string().optional(),
    snippet: z.string().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

// List knowledge files
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const filter: Record<string, unknown> = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.status) filter.status = req.query.status;

    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const limitRaw = req.query.limit !== undefined ? parseInt(req.query.limit as string, 10) : null;
    const limit = limitRaw !== null && !isNaN(limitRaw) ? Math.min(limitRaw, 100) : null;

    let query = KnowledgeFileModel.find(filter).sort({ qualityScore: sortOrder });
    if (limit !== null) {
      query = query.limit(limit);
    }
    const files = await query.lean();
    res.json(files);
  })
);

// Get single knowledge file (id can contain slashes, passed as query param)
router.get(
  '/by-id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.query.id as string;
    if (!id) {
      res.status(400).json({ error: 'id query param required' });
      return;
    }
    const file = await KnowledgeFileModel.findById(id).lean();
    if (!file) throw new NotFoundError('KnowledgeFile', id);
    res.json(file);
  })
);

// Create knowledge file
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createKnowledgeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { category, title, content, source } = parsed.data;
    const derivedId =
      parsed.data._id ??
      (() => {
        const slug = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        const timestamp = Date.now();
        return `${category}/${slug}-${timestamp}.md`;
      })();
    const derivedSnippet =
      parsed.data.snippet ??
      content
        .replace(/^[\s#]+/, '')
        .slice(0, 150)
        .trim();
    const file = await KnowledgeFileModel.create({
      _id: derivedId,
      category,
      title,
      snippet: derivedSnippet,
      content,
      source: source ?? { type: 'human' },
    });
    res.status(201).json(file);
  })
);

// Update knowledge file
router.patch(
  '/by-id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.query.id as string;
    if (!id) {
      res.status(400).json({ error: 'id query param required' });
      return;
    }

    const parsed = patchKnowledgeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const file = await KnowledgeFileModel.findByIdAndUpdate(
      id,
      { $set: { ...parsed.data, updatedAt: new Date() } },
      { new: true }
    );
    if (!file) throw new NotFoundError('KnowledgeFile', id);
    res.json(file);
  })
);

// Delete knowledge file (by query param — legacy)
router.delete(
  '/by-id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.query.id as string;
    if (!id) {
      res.status(400).json({ error: 'id query param required' });
      return;
    }
    const file = await KnowledgeFileModel.findByIdAndDelete(id);
    if (!file) throw new NotFoundError('KnowledgeFile', id);
    res.status(204).send();
  })
);

// Delete knowledge file (by URL path — supports slash-containing IDs, e.g. skills/foo.md)
router.delete(
  '/*',
  asyncHandler(async (req: Request, res: Response) => {
    // req.params[0] captures the full wildcard segment; Express URL-decodes it,
    // so %2F in the URL becomes / in the extracted id.
    const id = req.params[0];
    if (!id) {
      res.status(400).json({ error: 'id path param required' });
      return;
    }
    const file = await KnowledgeFileModel.findByIdAndDelete(id);
    if (!file) throw new NotFoundError('KnowledgeFile', id);
    res.status(204).send();
  })
);

export default router;
