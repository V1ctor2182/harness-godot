'use client';

import type { ReactNode } from 'react';
import { PopupProvider } from '@/hooks/use-popup';
import { PopupPreview } from '@/components/popup-preview';
import { popupRenderers } from '@/components/popup-renderers';
import { TopNav } from '@/components/top-nav';

export function AppShell({ projectName, children }: { projectName: string; children: ReactNode }) {
  return (
    <PopupProvider>
      <TopNav projectName={projectName} />
      <main className="max-w-[1280px] mx-auto px-6 py-8">{children}</main>
      <PopupPreview renderers={popupRenderers} />
    </PopupProvider>
  );
}
