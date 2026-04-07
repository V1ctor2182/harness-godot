'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, RoomTreeNode, SpecItem } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

const specTypeBadgeColor: Record<string, string> = {
  constraint: 'bg-red-100 text-red-800 border-red-200',
  decision: 'bg-blue-100 text-blue-800 border-blue-200',
  convention: 'bg-purple-100 text-purple-800 border-purple-200',
  context: 'bg-gray-100 text-gray-800 border-gray-200',
  intent: 'bg-green-100 text-green-800 border-green-200',
  contract: 'bg-orange-100 text-orange-800 border-orange-200',
  change: 'bg-yellow-100 text-yellow-800 border-yellow-200',
};

const lifecycleBadgeColor: Record<string, string> = {
  planning: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  stable: 'bg-blue-100 text-blue-700',
  archived: 'bg-red-100 text-red-700',
};

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
        className={`flex items-center gap-1 py-1 px-1 rounded cursor-pointer text-xs hover:bg-muted ${
          isSelected ? 'bg-muted font-semibold' : ''
        }`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
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
              <ChevronDown className="size-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-3" />
        )}
        <span className="truncate flex-1">{node.name}</span>
        {node.specCount.total > 0 && (
          <Badge variant="outline" className="text-[9px] ml-auto">
            {node.specCount.total}
            {node.specCount.draft > 0 && (
              <span className="text-yellow-600 ml-0.5">({node.specCount.draft})</span>
            )}
          </Badge>
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
    <div className="border border-border rounded p-3 space-y-2 bg-muted/30">
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
          className="text-xs border border-border rounded px-2 h-7 bg-background"
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
        className="w-full text-xs border border-border rounded p-2 h-16 bg-background resize-none"
      />
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" className="text-xs h-6" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" className="text-xs h-6" onClick={handleSubmit} disabled={saving || !title.trim()}>
          {saving ? 'Creating...' : 'Create'}
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
    <div className="pt-4 font-mono">
      <h1 className="text-xl font-bold text-foreground mb-1">Rooms</h1>
      <p className="text-xs text-muted-foreground mb-4">
        Feature Rooms & Spec Management
      </p>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded p-2 mb-4 flex items-center justify-between">
          <span className="text-xs text-destructive">{error}</span>
          <button className="text-xs text-destructive underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-[300px_1fr] gap-4">
        {/* Left: Room Tree */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Room Tree</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="p-2">
                {loading ? (
                  <p className="text-xs text-muted-foreground p-4">Loading...</p>
                ) : tree.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-4">No rooms found</p>
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
          </CardContent>
        </Card>

        {/* Right: Spec Detail */}
        <Card>
          <CardHeader className="pb-2">
            {selectedNode ? (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CardTitle className="text-sm">{selectedNode.name}</CardTitle>
                  <Badge className={`text-[9px] ${lifecycleBadgeColor[selectedNode.lifecycle] ?? ''}`}>
                    {selectedNode.lifecycle}
                  </Badge>
                  <Badge variant="outline" className="text-[9px]">{selectedNode.type}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {specs.length} specs ({draftCount} draft) · {selectedNode._id}
                </p>
              </div>
            ) : (
              <CardTitle className="text-sm text-muted-foreground">Select a room</CardTitle>
            )}
          </CardHeader>

          {selectedNode && (
            <CardContent>
              {/* Filter bar */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
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
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground ml-2 cursor-pointer">
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
                    className="text-[10px] h-6 text-destructive"
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
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${specTypeBadgeColor[spec.type] ?? ''}`}
                        >
                          {spec.type}
                        </Badge>
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
                              className="w-full text-xs border border-border rounded p-1.5 h-14 bg-background resize-none"
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
                                <AlertTriangle className="size-3 text-yellow-500 flex-shrink-0" />
                              )}
                              <span className="text-xs">{spec.title}</span>
                            </div>
                            {spec.provenance?.cycle_tag && (
                              <span className="text-[9px] text-muted-foreground">
                                {spec.provenance.cycle_tag} · conf {Math.round(spec.provenance.confidence * 100)}%
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${
                            spec.state === 'draft'
                              ? 'border-yellow-400 text-yellow-700'
                              : spec.state === 'active'
                                ? 'border-green-400 text-green-700'
                                : 'border-gray-300 text-gray-500'
                          }`}
                        >
                          {spec.state}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
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
                              className="text-[9px] h-5 px-1.5 text-destructive"
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
                      <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                        {specs.length === 0 ? 'No specs in this room' : 'No specs match filters'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
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
