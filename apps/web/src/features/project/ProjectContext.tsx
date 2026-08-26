import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'devsquad-stats:selected-project';

interface ProjectContextValue {
  /** Empty string means "all projects" (organization-wide). */
  selectedProject: string;
  setSelectedProject: (project: string) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [selectedProject, setSelectedProjectState] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? '',
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, selectedProject);
  }, [selectedProject]);

  const value = useMemo<ProjectContextValue>(
    () => ({ selectedProject, setSelectedProject: setSelectedProjectState }),
    [selectedProject],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useSelectedProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useSelectedProject must be used within a ProjectProvider');
  return ctx;
}
