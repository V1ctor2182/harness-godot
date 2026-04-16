'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Wand2, Link as LinkIcon, RefreshCw } from 'lucide-react';

import { api, type InitProjectResult } from '@/lib/api';
import { useProject } from '@/hooks/use-project';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
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
      // The connect flow just reloads the project config.
      // The user must have set PROJECT_REPO_LOCAL_PATH in .env to the path.
      // We inform them if the config can't load.
      await reloadProject();
      if (projectState.loaded) {
        router.push('/');
      } else {
        setError(
          `Could not load project. Make sure PROJECT_REPO_LOCAL_PATH=${connectPath.trim()} is set in .env and .harness/project.yaml exists in that repo.`
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

  // If project is already loaded, show a summary + option to change
  if (projectState.loaded && projectState.config && !result) {
    return (
      <div className="pt-8 max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Project Setup</h1>
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary">{projectState.config.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {projectState.config.description && (
              <p className="text-muted-foreground">{projectState.config.description}</p>
            )}
            {projectState.config.stack && (
              <div className="flex flex-wrap gap-1 text-[10px]">
                {projectState.config.stack.engine && (
                  <span className="px-1.5 py-0.5 rounded bg-muted">
                    {projectState.config.stack.engine}
                    {projectState.config.stack.engine_version && ` ${projectState.config.stack.engine_version}`}
                  </span>
                )}
                {projectState.config.stack.language && (
                  <span className="px-1.5 py-0.5 rounded bg-muted">{projectState.config.stack.language}</span>
                )}
              </div>
            )}
            {projectState.source && (
              <div className="text-[10px] font-mono text-muted-foreground break-all">
                {projectState.source}
              </div>
            )}
            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={() => router.push('/')}>
                ← Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="pt-8 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Project Setup</h1>
      <p className="text-sm text-muted-foreground">
        Point the harness at a game project. It will auto-detect the engine and scaffold the
        configuration.
      </p>

      {error && (
        <div className="text-sm border rounded px-3 py-2 text-destructive border-destructive/30 bg-destructive/10">
          {error}
        </div>
      )}

      <Tabs defaultValue="create">
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
        <TabsContent value="create">
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Project repo path (absolute)
                </label>
                <div className="flex gap-2 mt-1">
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Project name (optional)
                  </label>
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Auto-derived from dir name"
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Description (optional)
                  </label>
                  <Input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What kind of project is this?"
                    className="mt-1 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Coding conventions (optional, injected into all agent prompts)
                </label>
                <textarea
                  value={conventions}
                  onChange={(e) => setConventions(e.target.value)}
                  rows={4}
                  placeholder="Use snake_case for variables. Signals use past tense (health_changed)..."
                  className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono"
                />
              </div>

              {/* Detection result */}
              {result && (
                <Card className="border-success/30 bg-success/5">
                  <CardContent className="pt-3 pb-3 space-y-2">
                    <div className="text-sm font-semibold text-success">
                      Project initialized successfully
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Engine:</span>{' '}
                        <span className="font-semibold">{result.detected.engine}</span>
                        {result.detected.engine_version && ` ${result.detected.engine_version}`}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Language:</span>{' '}
                        <span className="font-semibold">{result.detected.language}</span>
                      </div>
                      {result.detected.test_runner && (
                        <div>
                          <span className="text-muted-foreground">Test runner:</span>{' '}
                          <span className="font-semibold">{result.detected.test_runner}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">PRD docs found:</span>{' '}
                        <span className="font-semibold">{result.prdDocsFound}</span>
                      </div>
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground break-all">
                      {result.yamlPath}
                    </div>
                    <div className="pt-2">
                      <p className="text-xs text-muted-foreground mb-2">
                        Next: set{' '}
                        <code className="bg-muted px-1 py-0.5 rounded">
                          PROJECT_REPO_LOCAL_PATH={result.yamlPath.replace('/.harness/project.yaml', '')}
                        </code>{' '}
                        in <code className="bg-muted px-1 py-0.5 rounded">.env</code>, then click
                        Finish.
                      </p>
                      <Button size="sm" onClick={handleFinish}>
                        Reload & Go to Dashboard
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Connect existing ──────────────────────── */}
        <TabsContent value="connect">
          <Card>
            <CardContent className="pt-5 space-y-4">
              <p className="text-xs text-muted-foreground">
                If the repo already has a <code className="bg-muted px-1 py-0.5 rounded">.harness/project.yaml</code>,
                just set the env var and reload.
              </p>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Project repo path
                </label>
                <div className="flex gap-2 mt-1">
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
              <div className="text-xs text-muted-foreground">
                <strong>Note:</strong> You need to manually set{' '}
                <code className="bg-muted px-1 py-0.5 rounded">PROJECT_REPO_LOCAL_PATH</code> in{' '}
                <code className="bg-muted px-1 py-0.5 rounded">.env</code> to the path above, then
                restart the server or click "Connect". The dashboard reads the env var at server boot
                time.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
