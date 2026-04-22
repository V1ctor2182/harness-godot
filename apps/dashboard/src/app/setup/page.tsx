'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Wand2, Link as LinkIcon, RefreshCw } from 'lucide-react';

import { api, type InitProjectResult } from '@/lib/api';
import { useProject } from '@/hooks/use-project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function SetupPage() {
  const router = useRouter();
  const { state: projectState, reload: reloadProject } = useProject();

  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [conventions, setConventions] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState<InitProjectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectPath, setConnectPath] = useState('');
  const [connecting, setConnecting] = useState(false);

  const handleInit = useCallback(async () => {
    if (!path.trim()) return;
    setDetecting(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.initProject({
        path: path.trim(),
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        conventions: conventions.trim() || undefined,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Init failed');
    } finally {
      setDetecting(false);
    }
  }, [path, name, description, conventions]);

  const handleConnect = useCallback(async () => {
    if (!connectPath.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      await reloadProject();
      if (projectState.loaded) {
        router.push('/');
      } else {
        setError(
          `Could not load project. Make sure PROJECT_REPO_LOCAL_PATH=${connectPath.trim()} is set in .env and .ludus/project.yaml exists in that repo.`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  }, [connectPath, reloadProject, projectState.loaded, router]);

  const handleFinish = useCallback(async () => {
    await reloadProject();
    router.push('/');
  }, [reloadProject, router]);

  // ─── Connected state: editorial summary card ──────────────
  if (projectState.loaded && projectState.config && !result) {
    return (
      <div className="pt-8 max-w-3xl mx-auto">
        <div className="text-kicker text-[var(--burgundy)] mb-2">
          <span>Connected</span>
          <span className="mx-2 text-[var(--rule-strong)]">·</span>
          <span className="text-[var(--muted-foreground)]">Project Ready</span>
        </div>
        <h1 className="text-display-2 text-[var(--ink)]">
          {projectState.config.name}
          <span className="italic text-[var(--burgundy)]">.</span>
        </h1>
        {projectState.config.description && (
          <p className="mt-4 text-lg text-[var(--ink-2)] leading-relaxed font-[var(--font-display)] italic">
            {projectState.config.description}
          </p>
        )}
        <div className="mt-6 pt-6 border-t border-[var(--rule)] space-y-4">
          {projectState.config.stack && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-kicker text-[var(--muted-foreground)]">Stack</span>
              {projectState.config.stack.engine && (
                <span className="inline-flex items-center rounded-full border border-[var(--rule-strong)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-2)]">
                  {projectState.config.stack.engine}
                  {projectState.config.stack.engine_version && ` ${projectState.config.stack.engine_version}`}
                </span>
              )}
              {projectState.config.stack.language && (
                <span className="inline-flex items-center rounded-full border border-[var(--rule-strong)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-2)]">
                  {projectState.config.stack.language}
                </span>
              )}
            </div>
          )}
          {projectState.source && (
            <div>
              <div className="text-kicker text-[var(--muted-foreground)] mb-1">Source</div>
              <div className="text-[11px] font-mono text-[var(--ink-2)] break-all">
                {projectState.source}
              </div>
            </div>
          )}
          <div className="pt-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/')}>
              ← Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-8 max-w-3xl mx-auto">
      {/* Editorial header */}
      <header className="pb-6 border-b-2 border-[var(--ink)]">
        <div className="text-kicker text-[var(--burgundy)] mb-3">
          <span>Getting Started</span>
          <span className="mx-2 text-[var(--rule-strong)]">·</span>
          <span className="text-[var(--muted-foreground)]">Step 1 of 1</span>
        </div>
        <h1 className="text-display-2 text-[var(--ink)]">
          Point Ludus at a project
          <span className="italic text-[var(--burgundy)]">.</span>
        </h1>
        <p className="mt-4 text-base text-[var(--ink-2)] max-w-2xl leading-relaxed">
          <span className="dropcap" style={{ color: 'var(--burgundy)' }}>L</span>
          udus scaffolds a <code className="px-1 py-0.5 rounded-xs bg-[var(--surface)] text-[var(--oxblood)] font-mono text-sm">.ludus/</code> directory in your repo — engine auto-detected, room templates seeded, prd docs discovered. Feed it a path; it does the rest.
        </p>
      </header>

      {error && (
        <div
          className="mt-6 text-sm rounded-sm px-3 py-2"
          style={{
            color: 'var(--oxblood)',
            border: '1px solid color-mix(in oklch, var(--oxblood) 30%, transparent)',
            background: 'color-mix(in oklch, var(--oxblood) 8%, transparent)',
          }}
        >
          {error}
        </div>
      )}

      <Tabs defaultValue="create" className="mt-6">
        <TabsList>
          <TabsTrigger value="create">
            <Wand2 className="size-3.5 mr-1.5" />
            Create New Project
          </TabsTrigger>
          <TabsTrigger value="connect">
            <LinkIcon className="size-3.5 mr-1.5" />
            Connect Existing Repo
          </TabsTrigger>
        </TabsList>

        {/* ── Create new ────────────────────────────── */}
        <TabsContent value="create" className="mt-6 space-y-5">
          <div>
            <label className="text-kicker text-[var(--muted-foreground)]">
              Project repo path (absolute)
            </label>
            <div className="flex gap-2 mt-1.5">
              <Input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/path/to/your-game-repo"
                className="font-mono text-xs flex-1"
              />
              <Button onClick={handleInit} disabled={detecting || !path.trim()}>
                {detecting ? (
                  <>
                    <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
                    Detecting…
                  </>
                ) : (
                  'Detect & Init'
                )}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-kicker text-[var(--muted-foreground)]">
                Project name (optional)
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Auto-derived from dir name"
                className="mt-1.5 text-xs"
              />
            </div>
            <div>
              <label className="text-kicker text-[var(--muted-foreground)]">
                Description (optional)
              </label>
              <Input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What kind of project is this?"
                className="mt-1.5 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-kicker text-[var(--muted-foreground)]">
              Coding conventions (optional, injected into all agent prompts)
            </label>
            <textarea
              value={conventions}
              onChange={(e) => setConventions(e.target.value)}
              rows={4}
              placeholder="Use snake_case for variables. Signals use past tense (health_changed)..."
              className="mt-1.5 w-full rounded-xs border border-[var(--rule-strong)] bg-[var(--surface)] px-3 py-2 text-xs font-mono focus:outline-none focus:border-[var(--burgundy)]"
            />
          </div>

          {/* Detection result */}
          {result && (
            <div
              className="rounded-sm p-5 mt-2"
              style={{
                border: '1px solid color-mix(in oklch, var(--forest) 30%, transparent)',
                background: 'color-mix(in oklch, var(--forest) 6%, transparent)',
              }}
            >
              <div className="text-kicker mb-2" style={{ color: 'var(--forest)' }}>
                Project initialized successfully
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                <div>
                  <span className="text-[var(--muted-foreground)]">Engine: </span>
                  <span className="text-[var(--ink)] font-medium">{result.detected.engine}</span>
                  {result.detected.engine_version && (
                    <span className="text-[var(--ink-2)]"> {result.detected.engine_version}</span>
                  )}
                </div>
                <div>
                  <span className="text-[var(--muted-foreground)]">Language: </span>
                  <span className="text-[var(--ink)] font-medium">{result.detected.language}</span>
                </div>
                {result.detected.test_runner && (
                  <div>
                    <span className="text-[var(--muted-foreground)]">Test runner: </span>
                    <span className="text-[var(--ink)] font-medium">{result.detected.test_runner}</span>
                  </div>
                )}
                <div>
                  <span className="text-[var(--muted-foreground)]">PRD docs: </span>
                  <span className="text-[var(--ink)] font-medium text-tabular">{result.prdDocsFound}</span>
                </div>
              </div>
              <div className="text-[11px] font-mono text-[var(--muted-foreground)] break-all mb-3">
                {result.yamlPath}
              </div>
              <p className="text-xs text-[var(--ink-2)] mb-3 leading-relaxed">
                Next: set{' '}
                <code className="bg-[var(--paper)] px-1 py-0.5 rounded-xs border border-[var(--rule)] text-[var(--oxblood)]">
                  PROJECT_REPO_LOCAL_PATH={result.yamlPath.replace('/.ludus/project.yaml', '')}
                </code>{' '}
                in <code className="bg-[var(--paper)] px-1 py-0.5 rounded-xs border border-[var(--rule)] text-[var(--oxblood)]">.env</code>, then click Finish.
              </p>
              <Button size="sm" onClick={handleFinish}>
                Reload &amp; Go to Dashboard
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ── Connect existing ──────────────────────── */}
        <TabsContent value="connect" className="mt-6 space-y-5">
          <p className="text-sm text-[var(--ink-2)] leading-relaxed">
            If the repo already has a{' '}
            <code className="px-1 py-0.5 rounded-xs bg-[var(--surface)] text-[var(--oxblood)] font-mono text-xs">
              .ludus/project.yaml
            </code>
            , just set the env var and reload.
          </p>
          <div>
            <label className="text-kicker text-[var(--muted-foreground)]">Project repo path</label>
            <div className="flex gap-2 mt-1.5">
              <Input
                type="text"
                value={connectPath}
                onChange={(e) => setConnectPath(e.target.value)}
                placeholder="/path/to/existing-repo"
                className="font-mono text-xs flex-1"
              />
              <Button onClick={handleConnect} disabled={connecting || !connectPath.trim()}>
                {connecting ? 'Loading…' : 'Connect'}
              </Button>
            </div>
          </div>
          <div className="text-xs text-[var(--muted-foreground)] leading-relaxed pt-2 border-t border-[var(--rule)]">
            <span className="text-kicker text-[var(--ink-2)] mr-2">Note</span>
            You need to manually set{' '}
            <code className="px-1 py-0.5 rounded-xs bg-[var(--surface)] text-[var(--oxblood)] font-mono">
              PROJECT_REPO_LOCAL_PATH
            </code>{' '}
            in{' '}
            <code className="px-1 py-0.5 rounded-xs bg-[var(--surface)] text-[var(--oxblood)] font-mono">.env</code>{' '}
            to the path above, then restart the server or click &quot;Connect&quot;. The dashboard reads the env var at server boot time.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
