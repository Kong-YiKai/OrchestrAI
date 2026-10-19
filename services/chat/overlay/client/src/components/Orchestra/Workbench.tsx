import { createContext, useContext, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ReactNode } from 'react';

export type WorkbenchView = 'dashboard' | 'chat' | 'canvas' | 'research' | 'context';
const views: WorkbenchView[] = ['dashboard', 'chat', 'canvas', 'research', 'context'];
const WorkbenchContext = createContext<{
  view: WorkbenchView;
  setView: (view: WorkbenchView) => void;
} | null>(null);

/** URL-backed presentation state only. Conversations, files and research remain server owned. */
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('view') as WorkbenchView;
  const view = views.includes(requested) ? requested : 'chat';
  const value = useMemo(
    () => ({
      view,
      setView: (next: WorkbenchView) => {
        setParams((previous) => {
          const updated = new URLSearchParams(previous);
          if (next === 'chat') updated.delete('view');
          else updated.set('view', next);
          return updated;
        });
      },
    }),
    [view, setParams],
  );
  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench() {
  const value = useContext(WorkbenchContext);
  if (!value) throw new Error('WorkbenchProvider is required');
  return value;
}
