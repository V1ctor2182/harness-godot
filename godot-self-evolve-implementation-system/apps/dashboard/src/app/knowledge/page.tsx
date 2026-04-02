'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';

interface KnowledgeFile {
  _id: string;
  category: string;
  title: string;
  snippet: string;
  content: string;
  status: string;
  qualityScore?: number;
  lastReferencedAt?: string;
  source: { type: string };
}

const KNOWLEDGE_CATEGORIES = [
  'skills',
  'decisions',
  'specs',
  'journal',
  'inbox',
  'pruned',
  'retrospectives',
] as const;

interface EditState {
  id: string;
  title: string;
  content: string;
  saving: boolean;
  error: string | null;
}

interface NewFormState {
  title: string;
  category: string;
  content: string;
  saving: boolean;
  error: string | null;
  validationError: string | null;
}

function formatLastReferenced(value?: string): string {
  if (!value) return 'Never';
  const date = new Date(value);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const DEFAULT_NEW_FORM: NewFormState = {
  title: '',
  category: 'journal',
  content: '',
  saving: false,
  error: null,
  validationError: null,
};

export default function KnowledgePage() {
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [category, setCategory] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [showNewForm, setShowNewForm] = useState<boolean>(false);
  const [newForm, setNewForm] = useState<NewFormState>({ ...DEFAULT_NEW_FORM });

  useEffect(() => {
    api.listKnowledge().then((f) => setFiles(f as KnowledgeFile[]));
  }, []);

  const toggleExpand = useCallback(
    (id: string) => {
      // If the file being toggled is in edit mode, cancel edit first
      if (editState?.id === id) {
        setEditState(null);
      }
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [editState]
  );

  const handleArchive = async (f: KnowledgeFile) => {
    setArchiving(f._id);
    try {
      await api.patchKnowledge(f._id, { status: 'archived' });
      setFiles((prev) => prev.filter((file) => file._id !== f._id));
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(f._id);
        return next;
      });
      if (editState?.id === f._id) setEditState(null);
    } finally {
      setArchiving(null);
    }
  };

  const startEdit = (f: KnowledgeFile) => {
    setEditState({ id: f._id, title: f.title, content: f.content, saving: false, error: null });
  };

  const cancelEdit = () => {
    setEditState(null);
  };

  const handleSave = async () => {
    if (!editState) return;
    setEditState((prev) => prev && { ...prev, saving: true, error: null });
    try {
      await api.patchKnowledge(editState.id, {
        title: editState.title,
        content: editState.content,
      });
      setFiles((prev) =>
        prev.map((f) =>
          f._id === editState.id ? { ...f, title: editState.title, content: editState.content } : f
        )
      );
      setEditState(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      setEditState((prev) => prev && { ...prev, saving: false, error: message });
    }
  };

  const handleCreate = async () => {
    if (!newForm.title.trim() || !newForm.content.trim()) {
      setNewForm((prev) => ({
        ...prev,
        validationError: 'Title and content are required.',
      }));
      return;
    }
    setNewForm((prev) => ({ ...prev, saving: true, error: null, validationError: null }));
    try {
      const created = await api.createKnowledge({
        title: newForm.title.trim(),
        category: newForm.category,
        content: newForm.content,
      });
      setFiles((prev) => [created as KnowledgeFile, ...prev]);
      setShowNewForm(false);
      setNewForm({ ...DEFAULT_NEW_FORM });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Create failed';
      setNewForm((prev) => ({ ...prev, saving: false, error: message }));
    }
  };

  const categories = [
    '',
    'skills',
    'decisions',
    'specs',
    'journal',
    'inbox',
    'pruned',
    'retrospectives',
  ];

  const searchLower = search.toLowerCase();
  const filtered = files.filter((f) => {
    if (category && f.category !== category) return false;
    if (
      searchLower &&
      !f.title.toLowerCase().includes(searchLower) &&
      !f.snippet.toLowerCase().includes(searchLower)
    )
      return false;
    return true;
  });

  return (
    <div className="pt-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Knowledge Base</h1>
        <Button
          variant="default"
          size="sm"
          onClick={() => {
            setShowNewForm((prev) => !prev);
            setNewForm({ ...DEFAULT_NEW_FORM });
          }}
        >
          {showNewForm ? 'Cancel' : 'New'}
        </Button>
      </div>

      {showNewForm && (
        <div className="mb-6 rounded border border-border bg-muted/30 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            New Knowledge File
          </h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Title <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={newForm.title}
                onChange={(e) => setNewForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Enter title…"
                className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Category
              </label>
              <select
                value={newForm.category}
                onChange={(e) => setNewForm((prev) => ({ ...prev, category: e.target.value }))}
                className="rounded border border-border bg-background px-2 py-1 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {KNOWLEDGE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Content <span className="text-destructive">*</span>
              </label>
              <textarea
                value={newForm.content}
                onChange={(e) => setNewForm((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="Enter content… (snippet will be auto-derived from the first 150 characters)"
                rows={8}
                className="w-full rounded border border-border bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {(newForm.validationError || newForm.error) && (
              <p className="text-sm text-destructive">{newForm.validationError ?? newForm.error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowNewForm(false);
                  setNewForm({ ...DEFAULT_NEW_FORM });
                }}
                disabled={newForm.saving}
              >
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={handleCreate} disabled={newForm.saving}>
                {newForm.saving ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {categories.map((c) => (
          <Button
            key={c}
            variant={category === c ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategory(c)}
          >
            {c || 'All'}
          </Button>
        ))}
        <div className="flex items-center gap-2 ml-2">
          <label htmlFor="knowledge-search" className="text-sm text-muted-foreground font-mono">
            Search
          </label>
          <input
            id="knowledge-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filter by keyword…"
            className="bg-background text-foreground border border-border rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <span className="text-sm text-muted-foreground font-mono">
          ({filtered.length} result{filtered.length !== 1 ? 's' : ''})
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Last Referenced</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => {
                const isExpanded = expanded.has(f._id);
                const isEditing = editState?.id === f._id;
                return (
                  <React.Fragment key={f._id}>
                    <TableRow
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() => toggleExpand(f._id)}
                    >
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {isExpanded ? '▾' : '▸'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">
                        {f._id}
                      </TableCell>
                      <TableCell>{f.title}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{f.category}</Badge>
                      </TableCell>
                      <TableCell>{f.source.type}</TableCell>
                      <TableCell>{f.qualityScore?.toFixed(2) ?? '0.00'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatLastReferenced(f.lastReferencedAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={f.status} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(f._id);
                          }}
                        >
                          {isExpanded ? 'Hide' : 'View'}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${f._id}-content`}>
                        <TableCell colSpan={9} className="bg-muted/30 p-0">
                          <div className="px-4 py-3">
                            {isEditing ? (
                              /* ── Edit mode ── */
                              <div className="space-y-3">
                                <div>
                                  <label className="text-muted-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">
                                    Title
                                  </label>
                                  <input
                                    type="text"
                                    value={editState.title}
                                    onChange={(e) =>
                                      setEditState(
                                        (prev) => prev && { ...prev, title: e.target.value }
                                      )
                                    }
                                    className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                  />
                                </div>
                                <div>
                                  <label className="text-muted-foreground mb-1 block text-xs font-semibold uppercase tracking-wide">
                                    Content
                                  </label>
                                  <textarea
                                    value={editState.content}
                                    onChange={(e) =>
                                      setEditState(
                                        (prev) => prev && { ...prev, content: e.target.value }
                                      )
                                    }
                                    rows={16}
                                    className="w-full rounded border border-border bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                  />
                                </div>
                                {editState.error && (
                                  <p className="text-sm text-destructive">{editState.error}</p>
                                )}
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={cancelEdit}
                                    disabled={editState.saving}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={handleSave}
                                    disabled={editState.saving}
                                  >
                                    {editState.saving ? 'Saving…' : 'Save'}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              /* ── Read-only mode ── */
                              <>
                                {f.snippet && (
                                  <div className="mb-2">
                                    <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wide">
                                      Snippet
                                    </p>
                                    <p className="text-sm">{f.snippet}</p>
                                  </div>
                                )}
                                <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wide">
                                  Content
                                </p>
                                <pre className="max-h-[400px] overflow-y-auto whitespace-pre-wrap rounded bg-muted p-3 font-mono text-xs leading-relaxed">
                                  {f.content}
                                </pre>
                                <div className="mt-2 flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEdit(f);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleArchive(f)}
                                    disabled={archiving === f._id || f.status === 'archived'}
                                  >
                                    {archiving === f._id ? 'Archiving…' : 'Archive'}
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
