import type { ProcessMapProject } from '../types';

const STORAGE_KEY = 'processmap-projects';

export function saveProjects(projects: ProcessMapProject[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function loadProjects(): ProcessMapProject[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ProcessMapProject[];
  } catch {
    return [];
  }
}

export function exportProject(project: ProcessMapProject): string {
  return JSON.stringify(project, null, 2);
}

export function importProject(json: string): ProcessMapProject {
  return JSON.parse(json) as ProcessMapProject;
}
