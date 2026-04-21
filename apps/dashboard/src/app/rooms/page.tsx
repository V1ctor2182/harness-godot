'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, RoomTreeNode, SpecItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronRight, ChevronDown, AlertTriangle, Plus, Archive } from 'lucide-react';

const SPEC_TYPES = ['All', 'constraint', 'decision', 'convention', 'context', 'intent', 'contract', 'change'] as const;

const specTypeColor: Record<string, string> = {
  constraint: 'var(--oxblood)',
  decision: 'var(--burgundy)',
  convention: 'var(--mustard)',
  context: 'var(--muted-foreground)',
  intent: 'var(--forest)',
  contract: 'var(--mustard)',
  change: 'var(--oxblood)',
};

const lifecycleColor: Record<string, string> = {
  planning: 'var(--muted-foreground)',
  active: 'var(--forest)',
  stable: 'var(--burgundy)',
  archived: 'var(--oxblood)',
};

function pillStyle(color: string): React.CSSProperties {
  return {
    color,
    borderColor: `color-mix(in oklch, ${color} 40%, transparent)`,
    background: `color-mix(in oklch, ${color} 10%, transparent)`,
  };
}

// ─── Tree Node Component ────────────────────────────────────────────

function TreeNode({
  node,
  selectedId,
  onSelect,
  depth = 0,
}: {
  node: RoomTreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node._id;

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 px-1 rounded-xs cursor-pointer text-xs transition-colors"
        style={{
          paddingLeft: `${depth * 16 + 4}px`,
          background: isSelected ? 'var(--surface)' : 'transparent',
          color: isSelected ? 'var(--burgundy)' : 'var(--ink)',
          fontWeight: isSelected ? 600 : 400,
        }}
        onClick={() => onSelect(node._id)}
      >
        {hasChildren ? (
          <button
            className="p-0 border-0 bg-transparent cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <ChevronDown className="size-3 text-[var(--muted-foreground)]" />
            ) : (
              <ChevronRight className="size-3 text-[var(--muted-foreground)]" />
            )}
          </button>
        ) : (
          <span className="w-3" />
        )}
        <span className="truncate flex-1">{node.name}</span>
        {node.specCount.total > 0 && (
          <span
            className="text-[9px] ml-auto font-mono text-tabular"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {node.specCount.total}
            {node.specCount.draft > 0 && (
              <span className="ml-0.5" style={{ color: 'var(--mustard)' }}>
                ({node.specCount.draft})
              </span>
            )}
          </span>
        )}
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child._id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── New Spec Form ──────────────────────────────────────────────────

function NewSpecForm({
  roomId,
  onCreated,
  onCancel,
}: {
  roomId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('context');
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.createSpec({
        roomId,
        type,
        title: title.trim(),
        summary: title.trim(),
        detail: detail.trim(),
        provenance: { source_type: 'human', confidence: 1.0 },
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-[var(--rule-strong)] rounded-sm p-3 space-y-2 bg-[var(--surface)]">
      <div className="flex gap-2">
        <Input
          placeholder="Spec title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-xs h-7"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="text-xs border border-[var(--rule-strong)] rounded-xs px-2 h-7 bg-[var(--paper)] focus:outline-none focus:border-[var(--burgundy)]"
        >
          {SPEC_TYPES.filter((t) => t !== 'All').map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <textarea
        placeholder="Detail (optional)"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        className="w-full text-xs border border-[var(--rule-strong)] rounded-xs p-2 h-16 bg-[var(--paper)] resize-none focus:outline-none focus:border-[var(--burgundy)]"
      />
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" className="text-xs h-6" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" className="text-xs h-6" onClick={handleSubmit} disabled={saving || !title.trim()}>
          {saving ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function RoomsPage() {
  const [tree, setTree] = useState<RoomTreeNode[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [specs, setSpecs] = useState<SpecItem[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [draftOnly, setDraftOnly] = useState(false);
  const [showNewSpec, setShowNewSpec] = useState(false);
  const [editingSpec, setEditingSpec] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDetail, setEditDetail] = useState('');
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getRoomTree().then((t) => {
      setTree(t);
      setLoading(false);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load rooms');
      setLoading(false);
    });
  }, []);

  const loadSpecs = useCallback(async (roomId: string) => {
    const params: Record<string, string> = { roomId };
    const result = await api.listSpecs(params);
    setSpecs(result);
  }, []);

  useEffect(() => {
    if (selectedRoomId) {
      loadSpecs(selectedRoomId);
    }
  }, [selectedRoomId, loadSpecs]);

  const selectedNode = findNode(tree, selectedRoomId);

  const filteredSpecs = specs.filter((s) => {
    if (typeFilter !== 'All' && s.type !== typeFilter) return false;
    if (draftOnly && s.state !== 'draft') return false;
    return true;
  });

  const handleActivate = async (specId: string) => {
    try {
      await api.updateSpec(specId, { state: 'active' });
      if (selectedRoomId) loadSpecs(selectedRoomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate spec');
    }
  };

  const handleArchive = async (specId: string) => {
    try {
      await api.updateSpec(specId, { state: 'archived' });
      if (selectedRoomId) loadSpecs(selectedRoomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive spec');
    }
  };

  const handleArchiveStale = async () => {
    if (!selectedRoomId) return;
    try {
      const result = await api.archiveStaleSpecs(selectedRoomId);
      alert(`Archived ${result.archived} stale specs`);
      loadSpecs(selectedRoomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive stale specs');
    }
  };

  const handleSaveEdit = async (specId: string) => {
    try {
      await api.updateSpec(specId, { title: editTitle, detail: editDetail });
      setEditingSpec(null);
      if (selectedRoomId) loadSpecs(selectedRoomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save spec');
    }
  };

  const startEdit = (spec: SpecItem) => {
    setEditingSpec(spec._id);
    setEditTitle(spec.title);
    setEditDetail(spec.detail);
  };

  const draftCount = specs.filter((s) => s.state === 'draft').length;

  return (
    <div className="pt-4 space-y-6">
      <header className="pb-5 border-b-2 border-[var(--ink)]">
        <div className="text-kicker text-[var(--burgundy)] mb-2">
          <span>The Library</span>
          <span className="mx-2 text-[var(--rule-strong)]">·</span>
          <span className="text-[var(--muted-foreground)]">Feature Rooms &amp; Specs</span>
        </div>
        <h1 className="text-display-3 text-[var(--ink)]">
          Rooms
          <span className="italic text-[var(--burgundy)]">.</span>
        </h1>
      </header>

      {error && (
        <div
          className="rounded-sm p-2 flex items-center justify-between"
          style={{
            color: 'var(--oxblood)',
            border: '1px solid color-mix(in oklch, var(--oxblood) 30%, transparent)',
            background: 'color-mix(in oklch, var(--oxblood) 8%, transparent)',
          }}
        >
          <span className="text-xs">{error}</span>
          <button className="text-xs underline" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-[300px_1fr] gap-8">
        {/* Left: Room Tree */}
        <aside>
          <div className="text-kicker text-[var(--muted-foreground)] mb-2">Room Tree</div>
          <ScrollArea className="h-[calc(100vh-240px)] border border-[var(--rule)] rounded-sm bg-[var(--surface)]">
            <div className="p-2">
              {loading ? (
                <p className="text-xs text-[var(--muted-foreground)] p-4 italic">Loading…</p>
              ) : tree.length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)] p-4 italic">No rooms found</p>
              ) : (
                tree.map((node) => (
                  <TreeNode
                    key={node._id}
                    node={node}
                    selectedId={selectedRoomId}
                    onSelect={setSelectedRoomId}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Right: Spec Detail */}
        <section>
          {selectedNode ? (
            <div className="mb-4 pb-3 border-b border-[var(--rule)]">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-display-3 text-[var(--ink)]" style={{ fontSize: '1.5rem', lineHeight: 1.2 }}>
                  {selectedNode.name}
                </h2>
                <span
                  className="inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                  style={pillStyle(lifecycleColor[selectedNode.lifecycle] ?? 'var(--muted-foreground)')}
                >
                  {selectedNode.lifecycle}
                </span>
                <span
                  className="inline-flex items-center rounded-full border border-[var(--rule-strong)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-2)]"
                >
                  {selectedNode.type}
                </span>
              </div>
              <p className="text-[10px] text-[var(--muted-foreground)] font-mono">
                {specs.length} specs ({draftCount} draft) · {selectedNode._id}
              </p>
            </div>
          ) : (
            <div className="text-sm text-[var(--muted-foreground)] italic">Select a room</div>
          )}

          {selectedNode && (
            <div>
              {/* Filter bar */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {SPEC_TYPES.map((t) => (
                  <Button
                    key={t}
                    variant={typeFilter === t ? 'default' : 'outline'}
                    size="sm"
                    className="text-[10px] h-6 px-2"
                    onClick={() => setTypeFilter(t)}
                  >
                    {t}
                  </Button>
                ))}
                <label className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] ml-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftOnly}
                    onChange={(e) => setDraftOnly(e.target.checked)}
                    className="size-3"
                  />
                  Draft only
                </label>
                <div className="ml-auto flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[10px] h-6"
                    onClick={() => setShowNewSpec(true)}
                  >
                    <Plus className="size-3 mr-1" /> New Spec
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[10px] h-6"
                    style={{ color: 'var(--oxblood)' }}
                    onClick={handleArchiveStale}
                  >
                    <Archive className="size-3 mr-1" /> Archive Stale
                  </Button>
                </div>
              </div>

              {/* New spec form */}
              {showNewSpec && (
                <div className="mb-3">
                  <NewSpecForm
                    roomId={selectedNode._id}
                    onCreated={() => {
                      setShowNewSpec(false);
                      loadSpecs(selectedNode._id);
                    }}
                    onCancel={() => setShowNewSpec(false)}
                  />
                </div>
              )}

              {/* Spec table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] w-[80px]">Type</TableHead>
                    <TableHead className="text-[10px]">Title</TableHead>
                    <TableHead className="text-[10px] w-[60px]">State</TableHead>
                    <TableHead className="text-[10px] w-[50px]">Score</TableHead>
                    <TableHead className="text-[10px] w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSpecs.map((spec) => (
                    <TableRow key={spec._id}>
                      <TableCell>
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                          style={pillStyle(specTypeColor[spec.type] ?? 'var(--muted-foreground)')}
                        >
                          {spec.type}
                        </span>
                      </TableCell>
                      <TableCell>
                        {editingSpec === spec._id ? (
                          <div className="space-y-1">
                            <Input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="text-xs h-6"
                            />
                            <textarea
                              value={editDetail}
                              onChange={(e) => setEditDetail(e.target.value)}
                              className="w-full text-xs border border-[var(--rule-strong)] rounded-xs p-1.5 h-14 bg-[var(--paper)] resize-none focus:outline-none focus:border-[var(--burgundy)]"
                            />
                            <div className="flex gap-1">
                              <Button size="sm" className="text-[10px] h-5" onClick={() => handleSaveEdit(spec._id)}>
                                Save
                              </Button>
                              <Button variant="outline" size="sm" className="text-[10px] h-5" onClick={() => setEditingSpec(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-1">
                              {spec.state === 'draft' && (
                                <AlertTriangle
                                  className="size-3 flex-shrink-0"
                                  style={{ color: 'var(--mustard)' }}
                                />
                              )}
                              <span className="text-xs text-[var(--ink)]">{spec.title}</span>
                            </div>
                            {spec.provenance?.cycle_tag && (
                              <span className="text-[9px] text-[var(--muted-foreground)] font-mono">
                                {spec.provenance.cycle_tag} · conf {Math.round(spec.provenance.confidence * 100)}%
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                          style={pillStyle(
                            spec.state === 'draft'
                              ? 'var(--mustard)'
                              : spec.state === 'active'
                                ? 'var(--forest)'
                                : 'var(--muted-foreground)'
                          )}
                        >
                          {spec.state}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-[var(--muted-foreground)] font-mono text-tabular">
                        {spec.qualityScore}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {spec.state === 'draft' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-[9px] h-5 px-1.5"
                              onClick={() => handleActivate(spec._id)}
                            >
                              Activate
                            </Button>
                          )}
                          {spec.state !== 'archived' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-[9px] h-5 px-1.5"
                              style={{ color: 'var(--oxblood)' }}
                              onClick={() => handleArchive(spec._id)}
                            >
                              Archive
                            </Button>
                          )}
                          {editingSpec !== spec._id && spec.state !== 'archived' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-[9px] h-5 px-1.5"
                              onClick={() => startEdit(spec)}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredSpecs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-xs text-[var(--muted-foreground)] py-8 italic">
                        {specs.length === 0 ? 'No specs in this room' : 'No specs match filters'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function findNode(tree: RoomTreeNode[], id: string | null): RoomTreeNode | null {
  if (!id) return null;
  for (const node of tree) {
    if (node._id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}
