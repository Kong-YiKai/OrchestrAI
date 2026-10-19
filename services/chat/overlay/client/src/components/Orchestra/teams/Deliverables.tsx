import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Folder, FolderDown, FolderOpen, X } from 'lucide-react';
import { useTeamApi } from './api';
import { canPickFolder, download, pickFolder, rememberFolder, savedFolder, writeFolder } from './local';
import type { FileContent, TeamFile } from './api';

const size = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
const resolve = (from: string, ref: string) => {
  const parts = from.split('/').slice(0, -1);
  for (const part of ref.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
};

/** Agent-written HTML runs only inside an opaque-origin sandbox, with sibling CSS/JS inlined. */
async function previewHtml(file: FileContent, files: TeamFile[], read: (f: TeamFile) => Promise<FileContent>) {
  const inline = async (pattern: RegExp, wrap: (text: string) => string, html: string) => {
    let out = html;
    for (const match of html.matchAll(pattern)) {
      const ref = match[1];
      if (/^[a-z]+:|^\/\//i.test(ref)) continue;
      const target = files.find((f) => f.path === resolve(file.path, ref));
      if (target) out = out.replace(match[0], wrap((await read(target)).content));
    }
    return out;
  };
  let html = await inline(/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi, (t) => `<style>${t}</style>`, file.content);
  html = await inline(/<script[^>]+src=["']([^"']+\.js)["'][^>]*><\/script>/gi, (t) => `<script>${t.replace(/<\/script/gi, '<\\/script')}</script>`, html);
  // Relative images (SVG or bitmaps the team wrote) become data URLs inside the sandbox.
  for (const match of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    const ref = match[1];
    if (/^[a-z]+:|^\/\//i.test(ref)) continue;
    const target = files.find((f) => f.path === resolve(file.path, ref));
    if (!target) continue;
    const image = await read(target);
    const data = image.encoding === 'utf8'
      ? `data:${image.media_type};charset=utf-8,${encodeURIComponent(image.content)}`
      : `data:${image.media_type};base64,${image.content}`;
    html = html.replace(match[0], match[0].replace(ref, data));
  }
  return html;
}

/** All files of a run, refreshed while the team works, with a content cache keyed by hash. */
export function useRunFiles(runId: string | undefined, live: boolean) {
  const call = useTeamApi();
  const files = useQuery<{ files: TeamFile[] }>(
    ['orchestra-team-files', runId],
    ({ signal }) => call(`/runs/${runId}/files`, 'GET', undefined, undefined, signal),
    { enabled: !!runId, refetchInterval: live ? 4000 : false },
  );
  const cache = useRef(new Map<string, FileContent>()).current;
  const read = async (file: TeamFile) => {
    const key = `${file.id}:${file.sha256}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const value = await call<FileContent>(`/runs/${runId}/files/${file.id}`);
    cache.set(key, value);
    return value;
  };
  return { list: files.data?.files ?? [], loading: files.isLoading && !!runId, read };
}
export type RunFiles = ReturnType<typeof useRunFiles>;

/** Files grouped by folder; a click opens the preview, the arrow downloads. */
export function FileGroups({ files, all, onOpen }: { files: TeamFile[]; all: RunFiles; onOpen: (file: TeamFile) => void }) {
  const groups = new Map<string, TeamFile[]>();
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
    groups.set(folder, [...(groups.get(folder) ?? []), file]);
  }
  return (
    <div className="orchestra-team-files">
      {[...groups].map(([folder, list]) => (
        <section key={folder || '.'}>
          {folder && (
            <h4>
              <Folder size={13} /> {folder}/
            </h4>
          )}
          <ul>
            {list.map((file) => (
              <li key={file.id}>
                <button type="button" onClick={() => onOpen(file)}>
                  <FileText size={14} />
                  <span>{file.path.split('/').pop()}</span>
                  <small>{size(file.size)}</small>
                </button>
                <button type="button" className="orchestra-icon-button" aria-label={`下载 ${file.path}`} onClick={async () => download(await all.read(file))}>
                  <Download size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Large overlay preview, so a page or picture is seen at a useful size. */
export function FilePreview({ file, all, onClose }: { file?: TeamFile; all: RunFiles; onClose: () => void }) {
  const [open, setOpen] = useState<FileContent>();
  const [html, setHtml] = useState<string>();
  useEffect(() => {
    let live = true;
    setOpen(undefined);
    setHtml(undefined);
    if (!file) return;
    (async () => {
      const value = await all.read(file);
      const page = value.media_type === 'text/html' ? await previewHtml(value, all.list, all.read) : undefined;
      if (live) { setOpen(value); setHtml(page); }
    })().catch(() => live && onClose());
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id, file?.sha256]);
  useEffect(() => {
    if (!file) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [file, onClose]);
  if (!file) return null;
  return (
    <div className="orchestra-team-modal" role="dialog" aria-label={file.path} onClick={onClose}>
      <section className="orchestra-team-preview" onClick={(e) => e.stopPropagation()}>
        <header>
          <h4>{file.path}</h4>
          <button type="button" className="orchestra-icon-button" aria-label="下载" onClick={async () => download(await all.read(file))}>
            <Download size={16} />
          </button>
          <button type="button" className="orchestra-icon-button" aria-label="关闭预览" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        {!open ? (
          <p className="orchestra-small-note">正在打开…</p>
        ) : html !== undefined ? (
          <iframe title={open.path} sandbox="allow-scripts" srcDoc={html} />
        ) : open.media_type === 'image/svg+xml' ? (
          <img alt={open.path} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(open.content)}`} />
        ) : open.encoding === 'utf8' ? (
          <pre>{open.content}</pre>
        ) : open.media_type.startsWith('image/') ? (
          <img alt={open.path} src={`data:${open.media_type};base64,${open.content}`} />
        ) : (
          <p className="orchestra-small-note">二进制文件，请下载查看。</p>
        )}
      </section>
    </div>
  );
}

/** The team's final delivery: files of the final nodes, saved together to a local folder. */
export default function Deliverables({
  project,
  workspace,
  files,
  all,
  onOpen,
}: {
  project: string;
  workspace: string;
  files: TeamFile[];
  all: RunFiles;
  onOpen: (file: TeamFile) => void;
}) {
  const [folder, setFolder] = useState<FileSystemDirectoryHandle>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    savedFolder(project).then(setFolder);
  }, [project]);
  const save = async (choose: boolean) => {
    setBusy(true);
    setMessage('');
    try {
      const contents = await Promise.all(files.map(all.read));
      if (!canPickFolder()) {
        contents.forEach(download);
        setMessage('浏览器不支持直接写入文件夹，已逐个下载。建议用 Chrome 或 Edge。');
        return;
      }
      let root = folder;
      if (choose || !root) {
        root = await pickFolder();
        setFolder(root);
        await rememberFolder(project, root);
      }
      const where = await writeFolder(root, workspace, contents);
      setMessage(`已保存 ${contents.length} 个文件到 ${where}`);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setMessage('保存失败：没有拿到文件夹写入权限，或文件被占用。');
    } finally {
      setBusy(false);
    }
  };
  if (!files.length) return <p className="orchestra-small-note">最后的节点没有写出文件。</p>;
  return (
    <>
      <div className="orchestra-team-files-actions">
        <button type="button" className="orchestra-primary" disabled={busy} onClick={() => save(false)}>
          <FolderDown size={15} /> {folder ? `保存到 ${folder.name}/${workspace}` : '保存到本地文件夹'}
        </button>
        {folder && (
          <button type="button" className="orchestra-secondary" disabled={busy} onClick={() => save(true)}>
            <FolderOpen size={15} /> 换个位置
          </button>
        )}
      </div>
      {message && <p className="orchestra-small-note">{message}</p>}
      <FileGroups files={files} all={all} onOpen={onOpen} />
    </>
  );
}
