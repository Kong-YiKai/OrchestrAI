import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, FolderDown, FolderOpen } from 'lucide-react';
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
  return html;
}

export default function Deliverables({
  runId,
  project,
  workspace,
  live,
}: {
  runId: string;
  project: string;
  workspace: string;
  live: boolean;
}) {
  const call = useTeamApi();
  const [open, setOpen] = useState<FileContent>();
  const [html, setHtml] = useState<string>();
  const [folder, setFolder] = useState<FileSystemDirectoryHandle>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const files = useQuery<{ files: TeamFile[] }>(
    ['orchestra-team-files', runId],
    ({ signal }) => call(`/runs/${runId}/files`, 'GET', undefined, undefined, signal),
    { refetchInterval: live ? 4000 : false },
  );
  const list = files.data?.files ?? [];
  const cache = useRef(new Map<string, FileContent>()).current;
  const read = async (file: TeamFile) => {
    const key = `${file.id}:${file.sha256}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const value = await call<FileContent>(`/runs/${runId}/files/${file.id}`);
    cache.set(key, value);
    return value;
  };

  useEffect(() => {
    savedFolder(project).then(setFolder);
  }, [project]);
  useEffect(() => {
    setOpen(undefined);
    setHtml(undefined);
  }, [runId]);

  const show = async (file: TeamFile) => {
    setMessage('');
    const value = await read(file);
    setOpen(value);
    setHtml(value.media_type === 'text/html' ? await previewHtml(value, list, read) : undefined);
  };
  const saveAll = async (choose: boolean) => {
    setBusy(true);
    setMessage('');
    try {
      const all = await Promise.all(list.map(read));
      if (!canPickFolder()) {
        all.forEach(download);
        setMessage('浏览器不支持直接写入文件夹，已逐个下载。建议用 Chrome 或 Edge。');
        return;
      }
      let root = folder;
      if (choose || !root) {
        root = await pickFolder();
        setFolder(root);
        await rememberFolder(project, root);
      }
      const where = await writeFolder(root, workspace, all);
      setMessage(`已保存 ${all.length} 个文件到 ${where}`);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setMessage('保存失败：没有拿到文件夹写入权限，或文件被占用。');
    } finally {
      setBusy(false);
    }
  };

  if (files.isLoading) return <p className="orchestra-small-note">正在读取成果…</p>;
  if (!list.length) return <p className="orchestra-small-note">这次运行还没有写出文件。</p>;
  return (
    <div className="orchestra-team-files">
      <div className="orchestra-team-files-actions">
        <button type="button" className="orchestra-primary" disabled={busy} onClick={() => saveAll(false)}>
          <FolderDown size={15} /> {folder ? `保存到 ${folder.name}/${workspace}` : '保存到本地文件夹'}
        </button>
        {folder && (
          <button type="button" className="orchestra-secondary" disabled={busy} onClick={() => saveAll(true)}>
            <FolderOpen size={15} /> 换个位置
          </button>
        )}
      </div>
      {message && <p className="orchestra-small-note">{message}</p>}
      <ul>
        {list.map((file) => (
          <li key={file.id}>
            <button type="button" aria-pressed={open?.id === file.id} onClick={() => show(file)}>
              <FileText size={14} />
              <span>{file.path}</span>
              <small>{size(file.size)}</small>
            </button>
            <button type="button" className="orchestra-icon-button" aria-label={`下载 ${file.path}`} onClick={async () => download(await read(file))}>
              <Download size={14} />
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <section className="orchestra-team-preview" aria-label={open.path}>
          <h4>{open.path}</h4>
          {html !== undefined ? (
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
      )}
    </div>
  );
}
