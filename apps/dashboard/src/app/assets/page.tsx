'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';

import { api, type AssetSpec, type AssetStatus } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

const CATEGORY_META: Record<string, { label: string; en: string; icon: string }> = {
  sprite: { label: '精灵/图片', en: 'Sprites', icon: '🎨' },
  tilemap: { label: '地图瓦片', en: 'Tilemaps', icon: '🗺️' },
  ui: { label: '界面素材', en: 'UI', icon: '🖥️' },
  animation: { label: '动画', en: 'Animations', icon: '🎬' },
  vfx: { label: '视觉特效', en: 'VFX', icon: '✨' },
  audio_sfx: { label: '音效', en: 'SFX', icon: '🔊' },
  audio_bgm: { label: '背景音乐', en: 'BGM', icon: '🎵' },
};

const STATUS_COLOR: Record<AssetStatus, string> = {
  planned: 'var(--muted-foreground)',
  placeholder: 'var(--mustard)',
  replaced: 'var(--burgundy)',
  final: 'var(--forest)',
};

function statusBadge(s: AssetStatus): string {
  if (s === 'planned') return '○';
  if (s === 'placeholder') return '◐';
  if (s === 'replaced') return '◑';
  return '●';
}

// ─── Preview renderers per type ─────────────────────────────────────

function TexturePreview({ assetId, large = false }: { assetId: string; large?: boolean }) {
  const src = `${API_URL}/assets/${encodeURIComponent(assetId)}/file`;
  return (
    <img
      src={src}
      alt={assetId}
      style={{ imageRendering: 'pixelated' }}
      className={large ? 'max-w-full max-h-[400px] object-contain' : 'max-h-20 max-w-full object-contain'}
      loading="lazy"
    />
  );
}

function AudioPreview({ assetId }: { assetId: string }) {
  const src = `${API_URL}/assets/${encodeURIComponent(assetId)}/file`;
  return <audio controls preload="metadata" src={src} className="w-full h-8" />;
}

function FontPreview({ assetId, sample = 'The quick brown fox 0123456789' }: { assetId: string; sample?: string }) {
  const [loaded, setLoaded] = useState(false);
  const fontFamily = `asset-${assetId.replace(/[^a-z0-9]/g, '-')}`;

  useEffect(() => {
    const src = `${API_URL}/assets/${encodeURIComponent(assetId)}/file`;
    const face = new FontFace(fontFamily, `url(${src})`);
    face
      .load()
      .then((f) => {
        document.fonts.add(f);
        setLoaded(true);
      })
      .catch(() => setLoaded(false));
  }, [assetId, fontFamily]);

  if (!loaded) return <div className="text-[10px] text-muted-foreground">Loading font…</div>;
  return (
    <div style={{ fontFamily }} className="text-sm">
      {sample}
    </div>
  );
}

function PlaceholderTile({ status, spec }: { status: AssetStatus; spec?: string }) {
  return (
    <div
      className="flex items-center justify-center h-20 text-[10px] border border-dashed rounded-xs"
      style={{
        borderColor: 'var(--rule-strong)',
        color: 'var(--muted-foreground)',
      }}
    >
      <div className="text-center px-2">
        <div className="uppercase tracking-[0.08em] font-mono">{status}</div>
        {spec && <div className="truncate max-w-[120px] mt-0.5 italic">{spec}</div>}
      </div>
    </div>
  );
}

function AssetThumbnail({ asset }: { asset: AssetSpec }) {
  if (!asset.file) return <PlaceholderTile status={asset.status} spec={asset.spec} />;

  switch (asset.type) {
    case 'texture':
      return <TexturePreview assetId={asset.assetId} />;
    case 'audio':
      return <AudioPreview assetId={asset.assetId} />;
    case 'font':
      return <FontPreview assetId={asset.assetId} sample="Aa 1" />;
    case 'spriteframes':
    case 'particles':
    case 'theme':
    case 'shader':
      return <PlaceholderTile status={asset.status} spec={asset.type} />;
    default:
      return <PlaceholderTile status={asset.status} spec={asset.spec} />;
  }
}

// ─── Detail modal ───────────────────────────────────────────────────

function AssetDetailModal({
  asset,
  onClose,
}: {
  asset: AssetSpec | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!asset} onOpenChange={(v) => !v && onClose()}>
      {asset && (
        <DialogContent className="max-w-[800px]">
          <div className="space-y-4">
            <div>
              <DialogTitle>
                <span className="mr-2">{CATEGORY_META[asset.category]?.icon ?? '📦'}</span>
                {asset.name}
              </DialogTitle>
              <DialogDescription className="font-mono text-xs">{asset.assetId}</DialogDescription>
            </div>

            <div className="flex items-center justify-center bg-muted/20 rounded p-6 min-h-[200px]">
              {asset.file ? (
                asset.type === 'texture' ? (
                  <TexturePreview assetId={asset.assetId} large />
                ) : asset.type === 'audio' ? (
                  <AudioPreview assetId={asset.assetId} />
                ) : asset.type === 'font' ? (
                  <FontPreview assetId={asset.assetId} />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Preview not supported for type: {asset.type}
                  </div>
                )
              ) : (
                <div className="text-center text-muted-foreground">
                  <div className="text-xs uppercase tracking-wider">{asset.status}</div>
                  <div className="text-xs mt-1">no file yet</div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</div>
                <div>{asset.category}{asset.subcategory ? ` · ${asset.subcategory}` : ''}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</div>
                <div>{asset.type}</div>
              </div>
              <div>
                <div className="text-kicker text-[var(--muted-foreground)]">Status</div>
                <div style={{ color: STATUS_COLOR[asset.status] }}>{asset.status}</div>
              </div>
              {asset.milestone && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Milestone</div>
                  <div>{asset.milestone}</div>
                </div>
              )}
              {asset.priority && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Priority</div>
                  <div>{asset.priority}</div>
                </div>
              )}
              {asset.spec && (
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Spec</div>
                  <div>{asset.spec}</div>
                </div>
              )}
            </div>

            {asset.file && (
              <div className="border-t border-border pt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Path</div>
                  <code className="text-[10px] break-all">{asset.file.relPath}</code>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Size</div>
                  <div className="font-mono">{(asset.file.sizeBytes / 1024).toFixed(1)} KB</div>
                </div>
                {asset.file.width && asset.file.height && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Dimensions</div>
                    <div className="font-mono">
                      {asset.file.width}×{asset.file.height}
                    </div>
                  </div>
                )}
                {asset.file.sha256 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">SHA256</div>
                    <code className="text-[10px]">{asset.file.sha256.slice(0, 16)}…</code>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

// ─── Page ───────────────────────────────────────────────────────────

export default function AssetsPage() {
  const [assets, setAssets] = useState<AssetSpec[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<AssetStatus | null>(null);
  const [selected, setSelected] = useState<AssetSpec | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listAssets();
      setAssets(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assets');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRescan = useCallback(async () => {
    setRescanning(true);
    try {
      await fetch(`${API_URL}/assets/rescan`, { method: 'POST' });
      await refresh();
    } finally {
      setRescanning(false);
    }
  }, [refresh]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) set.add(a.category);
    return Array.from(set).sort();
  }, [assets]);

  const milestones = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) if (a.milestone) set.add(a.milestone);
    return Array.from(set).sort();
  }, [assets]);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (selectedCategory && a.category !== selectedCategory) return false;
      if (selectedMilestone && a.milestone !== selectedMilestone) return false;
      if (selectedStatus && a.status !== selectedStatus) return false;
      return true;
    });
  }, [assets, selectedCategory, selectedMilestone, selectedStatus]);

  const counts = useMemo(() => {
    const c = { total: assets.length, planned: 0, placeholder: 0, replaced: 0, final: 0 };
    for (const a of assets) c[a.status] += 1;
    return c;
  }, [assets]);

  const filterChipStyle = (active: boolean): React.CSSProperties => ({
    color: active ? 'var(--burgundy)' : 'var(--muted-foreground)',
    borderBottom: `2px solid ${active ? 'var(--burgundy)' : 'transparent'}`,
  });

  return (
    <div className="pt-4 space-y-6">
      {/* Editorial header */}
      <header className="pb-5 border-b-2 border-[var(--ink)]">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-kicker text-[var(--burgundy)] mb-2">
              <span>The Gallery</span>
              <span className="mx-2 text-[var(--rule-strong)]">·</span>
              <span className="text-[var(--muted-foreground)]">
                {counts.total} total · {counts.planned} planned · {counts.placeholder} placeholder · {counts.replaced} replaced · {counts.final} final
              </span>
            </div>
            <h1 className="text-display-3 text-[var(--ink)]">
              Assets
              <span className="italic text-[var(--burgundy)]">.</span>
            </h1>
          </div>
          <Button size="sm" variant="outline" onClick={handleRescan} disabled={rescanning}>
            <RefreshCw className={`size-3.5 mr-1.5 ${rescanning ? 'animate-spin' : ''}`} />
            {rescanning ? 'Scanning…' : 'Rescan'}
          </Button>
        </div>
      </header>

      {error && (
        <div
          className="text-xs rounded-sm px-3 py-1.5"
          style={{
            color: 'var(--oxblood)',
            border: '1px solid color-mix(in oklch, var(--oxblood) 30%, transparent)',
            background: 'color-mix(in oklch, var(--oxblood) 8%, transparent)',
          }}
        >
          {error}
        </div>
      )}

      {/* Category filter — editorial tabs */}
      <div className="flex gap-4 flex-wrap">
        <button
          type="button"
          onClick={() => setSelectedCategory(null)}
          className="text-meta pb-1"
          style={filterChipStyle(!selectedCategory)}
        >
          All
        </button>
        {categories.map((c) => {
          const meta = CATEGORY_META[c];
          return (
            <button
              key={c}
              type="button"
              onClick={() => setSelectedCategory(selectedCategory === c ? null : c)}
              className="text-meta pb-1"
              style={filterChipStyle(selectedCategory === c)}
            >
              <span className="mr-1">{meta?.icon ?? '📦'}</span>
              {meta?.en ?? c}
            </button>
          );
        })}
      </div>

      {/* Milestone + Status filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-kicker text-[var(--muted-foreground)]">Milestone</span>
        <button
          type="button"
          onClick={() => setSelectedMilestone(null)}
          className="text-[10px] px-1.5 py-0.5 rounded-full border font-mono uppercase tracking-[0.08em]"
          style={{
            color: !selectedMilestone ? 'var(--burgundy)' : 'var(--muted-foreground)',
            borderColor: !selectedMilestone
              ? 'color-mix(in oklch, var(--burgundy) 30%, transparent)'
              : 'var(--rule-strong)',
          }}
        >
          All
        </button>
        {milestones.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setSelectedMilestone(selectedMilestone === m ? null : m)}
            className="text-[10px] px-1.5 py-0.5 rounded-full border font-mono uppercase tracking-[0.08em]"
            style={{
              color: selectedMilestone === m ? 'var(--burgundy)' : 'var(--muted-foreground)',
              borderColor:
                selectedMilestone === m
                  ? 'color-mix(in oklch, var(--burgundy) 30%, transparent)'
                  : 'var(--rule-strong)',
            }}
          >
            {m}
          </button>
        ))}
        <span className="text-kicker text-[var(--muted-foreground)] ml-3">Status</span>
        {(['planned', 'placeholder', 'replaced', 'final'] as AssetStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSelectedStatus(selectedStatus === s ? null : s)}
            className="text-[10px] px-1.5 py-0.5 rounded-full border font-mono uppercase tracking-[0.08em]"
            style={{
              color: selectedStatus === s ? STATUS_COLOR[s] : 'var(--muted-foreground)',
              borderColor:
                selectedStatus === s
                  ? `color-mix(in oklch, ${STATUS_COLOR[s]} 40%, transparent)`
                  : 'var(--rule-strong)',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Asset grid */}
      <section>
        <div className="text-kicker text-[var(--muted-foreground)] mb-3">
          {filtered.length} asset{filtered.length === 1 ? '' : 's'}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {filtered.map((a) => (
            <button
              key={a.assetId}
              type="button"
              onClick={() => setSelected(a)}
              className="text-left border border-[var(--rule-strong)] rounded-xs p-2 hover:border-[var(--burgundy)] hover:bg-[var(--surface)] transition-colors"
            >
              <div className="h-20 flex items-center justify-center bg-[var(--surface)] rounded-xs mb-1.5 overflow-hidden">
                <AssetThumbnail asset={a} />
              </div>
              <div className="flex items-center gap-1">
                <span style={{ color: STATUS_COLOR[a.status] }}>{statusBadge(a.status)}</span>
                <span className="text-[11px] font-mono truncate text-[var(--ink)]">{a.name}</span>
              </div>
              <div className="flex items-center gap-1 text-[9px] text-[var(--muted-foreground)] font-mono text-tabular">
                {a.milestone && <span>{a.milestone}</span>}
                {a.file?.width && a.file?.height && (
                  <span>
                    {a.file.width}×{a.file.height}
                  </span>
                )}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center text-sm text-[var(--muted-foreground)] py-8 italic">
              No assets match filters.
            </div>
          )}
        </div>
      </section>

      <AssetDetailModal asset={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
