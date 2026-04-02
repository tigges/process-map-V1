import type { ProcessMapProject, ProjectFolder } from '../types';

const STORAGE_KEY = 'processmap-projects';
const FOLDERS_KEY = 'processmap-folders';

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

export function saveFolders(folders: ProjectFolder[]): void {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
}

export function loadFolders(): ProjectFolder[] {
  const raw = localStorage.getItem(FOLDERS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ProjectFolder[];
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
