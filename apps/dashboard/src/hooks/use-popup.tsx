'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export type PopupType = 'cycle' | 'inbox' | 'milestone' | 'rooms' | 'assets' | 'events' | null;

export interface PopupState {
  type: PopupType;
  props?: Record<string, unknown>;
}

export interface PopupController {
  state: PopupState;
  open: (type: Exclude<PopupType, null>, props?: Record<string, unknown>) => void;
  close: () => void;
}

const defaultState: PopupState = { type: null };

const PopupContext = createContext<PopupController | null>(null);

export function usePopup(): PopupController {
  const ctx = useContext(PopupContext);
  if (!ctx) {
    throw new Error('usePopup must be used within a PopupProvider');
  }
  return ctx;
}

export function PopupProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PopupState>(defaultState);

  const open = useCallback(
    (type: Exclude<PopupType, null>, props?: Record<string, unknown>) => setState({ type, props }),
    []
  );
  const close = useCallback(() => setState(defaultState), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.type) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.type, close]);

  return <PopupContext.Provider value={{ state, open, close }}>{children}</PopupContext.Provider>;
}
