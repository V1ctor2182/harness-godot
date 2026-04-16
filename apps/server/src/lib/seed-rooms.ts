import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { RoomModel } from '../models/room.js';
import { SpecModel } from '../models/spec.js';
import { config } from '../config.js';
import { logger } from './logger.js';

// rooms/ lives at the project root, 4 levels above this file:
//   local dev:  apps/server/src/lib/ → up 4 = project root
//   Docker:     apps/server/dist/lib/ → up 4 = /app (project root)
const PROJECT_ROOT = path.join(__dirname, '..', '..', '..', '..');
const ROOMS_DIR = path.join(PROJECT_ROOT, 'rooms');
const TREE_PATH = path.join(ROOMS_DIR, '00-project-room', '_tree.yaml');

interface TreeNode {
  id: string;
  name: string;
  type: string;
  owner?: string;
  lifecycle?: string;
  path: string;
  children?: TreeNode[];
}

interface RoomYaml {
  room: {
    id: string;
    name: string;
    parent: string | null;
    lifecycle?: string;
    owner?: string;
    contributors?: string[];
    depends_on?: string[];
    created_at?: string;
    updated_at?: string;
  };
}

interface SpecYaml {
  spec_id: string;
  type: string;
  state: string;
  intent?: {
    summary?: string;
    detail?: string;
  };
  constraints?: string[];
  indexing?: {
    type?: string;
    priority?: string;
    layer?: string;
    domain?: string;
    tags?: string[];
  };
  provenance?: {
    source_type?: string;
    confidence?: number;
    source_ref?: string;
  };
  relations?: Array<{ target: string; type: string }>;
  anchors?: Array<{ file: string; symbol?: string; line_range?: string }>;
}

export async function seedRooms(): Promise<{ roomsUpserted: number; specsUpserted: number }> {
  let treeContent: string;
  try {
    treeContent = await fs.readFile(TREE_PATH, 'utf-8');
  } catch {
    logger.warn({ path: TREE_PATH }, '[seed-rooms] _tree.yaml not found, skipping room seeding');
    return { roomsUpserted: 0, specsUpserted: 0 };
  }

  const treeDoc = parseYaml(treeContent) as { tree: TreeNode[] };
  if (!treeDoc?.tree || !Array.isArray(treeDoc.tree)) {
    logger.warn('[seed-rooms] _tree.yaml has no tree array, skipping');
    return { roomsUpserted: 0, specsUpserted: 0 };
  }

  let roomsUpserted = 0;
  let specsUpserted = 0;

  async function processNode(node: TreeNode, parentId: string | null): Promise<void> {
    // Read room.yaml if it exists for extra fields
    const roomYamlPath = path.join(PROJECT_ROOT, node.path, 'room.yaml');
    let roomYaml: RoomYaml | null = null;
    try {
      const content = await fs.readFile(roomYamlPath, 'utf-8');
      roomYaml = parseYaml(content) as RoomYaml;
    } catch {
      // room.yaml is optional — tree node has the essentials
    }

    const roomData = {
      name: node.name,
      parent: parentId,
      type: node.type,
      owner: node.owner ?? roomYaml?.room?.owner ?? 'backend',
      lifecycle: node.lifecycle ?? roomYaml?.room?.lifecycle ?? 'planning',
      depends_on: roomYaml?.room?.depends_on ?? [],
      contributors: roomYaml?.room?.contributors ?? [],
      path: node.path,
      updatedAt: new Date(),
    };

    await RoomModel.updateOne(
      { _id: node.id },
      {
        $set: roomData,
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
    roomsUpserted++;

    // Scan specs/ directory for this room
    const specsDir = path.join(PROJECT_ROOT, node.path, 'specs');
    try {
      const entries = await fs.readdir(specsDir);
      const yamlFiles = entries.filter((f) => f.endsWith('.yaml'));

      for (const filename of yamlFiles) {
        const specPath = path.join(specsDir, filename);
        try {
          const specContent = await fs.readFile(specPath, 'utf-8');
          const specYaml = parseYaml(specContent) as SpecYaml;
          if (!specYaml?.spec_id) {
            logger.warn({ file: specPath }, '[seed-rooms] Spec YAML missing spec_id, skipping');
            continue;
          }

          // Map nested YAML → flat Spec interface
          const specData = {
            roomId: node.id,
            type: specYaml.type ?? 'intent',
            state: specYaml.state ?? 'draft',
            title: specYaml.intent?.summary ?? specYaml.spec_id,
            summary: specYaml.intent?.summary ?? '',
            detail: specYaml.intent?.detail ?? '',
            provenance: {
              source_type: specYaml.provenance?.source_type ?? 'codebase_extraction',
              confidence: specYaml.provenance?.confidence ?? 0.5,
              source_ref: specYaml.provenance?.source_ref,
            },
            tags: specYaml.indexing?.tags ?? [],
            relations: specYaml.relations ?? [],
            anchors: specYaml.anchors ?? [],
            updatedAt: new Date(),
          };

          await SpecModel.updateOne(
            { _id: specYaml.spec_id },
            {
              $set: specData,
              $setOnInsert: { qualityScore: 0, createdAt: new Date() },
            },
            { upsert: true }
          );
          specsUpserted++;

          // Generate independent constraint Specs from constraints[] array
          if (specYaml.constraints && specYaml.constraints.length > 0) {
            for (let i = 0; i < specYaml.constraints.length; i++) {
              const constraintText = specYaml.constraints[i];
              const constraintId = `constraint-${node.id}-${String(i + 1).padStart(3, '0')}`;

              await SpecModel.updateOne(
                { _id: constraintId },
                {
                  $set: {
                    roomId: node.id,
                    type: 'constraint',
                    state: specYaml.state ?? 'draft',
                    title: constraintText,
                    summary: constraintText,
                    detail: constraintText,
                    provenance: {
                      source_type: specYaml.provenance?.source_type ?? 'codebase_extraction',
                      confidence: specYaml.provenance?.confidence ?? 0.5,
                      source_ref: specYaml.provenance?.source_ref,
                    },
                    tags: specYaml.indexing?.tags ?? [],
                    relations: [],
                    anchors: [],
                    updatedAt: new Date(),
                  },
                  $setOnInsert: { qualityScore: 0, createdAt: new Date() },
                },
                { upsert: true }
              );
              specsUpserted++;
            }
          }
        } catch (err) {
          logger.warn({ file: specPath, err }, '[seed-rooms] Failed to parse spec YAML');
        }
      }
    } catch {
      // specs/ directory doesn't exist — that's fine
    }

    // Process children
    if (node.children) {
      for (const child of node.children) {
        await processNode(child, node.id);
      }
    }
  }

  // Process all top-level nodes (there's typically just one: 00-project-room)
  for (const topNode of treeDoc.tree) {
    await processNode(topNode, null);
  }

  // ── Dual-source: also scan project repo .harness/rooms/ ──────────
  const projectBase = config.projectRepoLocalPath;
  if (projectBase) {
    const projectRoomsDir = path.join(projectBase, '.harness', 'rooms');
    try {
      const projectTreePath = path.join(projectRoomsDir, '_tree.yaml');
      let projectTreeContent: string | null = null;
      try {
        projectTreeContent = await fs.readFile(projectTreePath, 'utf-8');
      } catch {
        // no _tree.yaml — will try flat scan below
      }

      if (projectTreeContent) {
        const projectTree = parseYaml(projectTreeContent) as { tree: TreeNode[] };
        if (projectTree?.tree && Array.isArray(projectTree.tree)) {
          for (const node of projectTree.tree) {
            await processNode(node, null);
          }
          logger.info(`[seed-rooms] processed project _tree.yaml from ${projectRoomsDir}`);
        }
      } else {
        // Flat scan: each subdirectory with a room.yaml becomes a top-level room
        let entries: import('node:fs').Dirent[];
        try {
          entries = await fs.readdir(projectRoomsDir, { withFileTypes: true });
        } catch {
          entries = [];
        }
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const roomDir = path.join(projectRoomsDir, entry.name);
          const roomYamlPath = path.join(roomDir, 'room.yaml');
          try {
            await fs.stat(roomYamlPath);
          } catch {
            continue; // no room.yaml, skip
          }
          const syntheticNode: TreeNode = {
            id: entry.name.startsWith('p-') ? entry.name : `p-${entry.name}`,
            name: entry.name,
            type: 'feature',
            path: path.relative(PROJECT_ROOT, roomDir),
            lifecycle: 'planning',
          };
          await processNode(syntheticNode, null);
        }
        if (entries.length > 0) {
          logger.info(`[seed-rooms] flat-scanned ${entries.length} project rooms from ${projectRoomsDir}`);
        }
      }
    } catch (err) {
      logger.warn({ err }, `[seed-rooms] failed to scan project rooms at ${projectBase}`);
    }
  }

  logger.info(
    { roomsUpserted, specsUpserted },
    `[seed-rooms] Done. Rooms: ${roomsUpserted}, Specs: ${specsUpserted}`
  );

  return { roomsUpserted, specsUpserted };
}
