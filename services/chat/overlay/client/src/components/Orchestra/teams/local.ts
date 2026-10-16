import type { FileContent } from './api';

/**
 * Saving deliverables to a folder on the user's computer via the File System Access API
 * (Chromium browsers). The chosen folder handle is remembered per project in this
 * browser only; elsewhere files download one by one.
 */
type Permissioned = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
};
type Picker = (o: { id?: string; mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;

export const canPickFolder = () => typeof (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker === 'function';

export async function pickFolder() {
  const picker = (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker;
  return picker({ id: 'orchestrai-teams', mode: 'readwrite' });
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('orchestrai-teams', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('folders');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function rememberFolder(project: string, handle: FileSystemDirectoryHandle) {
  try {
    const db = await database();
    db.transaction('folders', 'readwrite').objectStore('folders').put(handle, project);
  } catch {
    /* Private windows may refuse storage; the folder is asked for again next time. */
  }
}

export async function savedFolder(project: string): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const db = await database();
    return await new Promise((resolve) => {
      const request = db.transaction('folders').objectStore('folders').get(project);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

const bytes = (file: FileContent) =>
  file.encoding === 'utf8'
    ? new TextEncoder().encode(file.content)
    : Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0));

export const blobOf = (file: FileContent) => new Blob([bytes(file)], { type: file.media_type });

/** Writes files into <folder>/<workspace>/..., creating subfolders. Must run from a click. */
export async function writeFolder(root: FileSystemDirectoryHandle, workspace: string, files: FileContent[]) {
  const handle = root as Permissioned;
  if ((await handle.queryPermission?.({ mode: 'readwrite' })) !== 'granted') {
    if ((await handle.requestPermission?.({ mode: 'readwrite' })) !== 'granted') throw new Error('permission');
  }
  const base = await root.getDirectoryHandle(workspace, { create: true });
  // Agents sometimes wrap everything in a folder named like the project; don't nest it twice.
  const wrapped = files.length > 0 && files.every((f) => f.path.startsWith(`${workspace}/`));
  for (const file of files) {
    const path = wrapped ? file.path.slice(workspace.length + 1) : file.path;
    const parts = path.split('/').filter((p) => p && p !== '.' && p !== '..');
    let dir = base;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
    const target = await dir.getFileHandle(parts.at(-1)!, { create: true });
    const writable = await (target as FileSystemFileHandle & {
      createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }>;
    }).createWritable();
    await writable.write(blobOf(file));
    await writable.close();
  }
  return `${root.name}/${workspace}`;
}

export function download(file: FileContent) {
  const url = URL.createObjectURL(blobOf(file));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.path.split('/').pop() || 'file';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
