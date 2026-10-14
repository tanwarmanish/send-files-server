import fs from 'node:fs';
import path from 'node:path';
import type { Peer } from './peer.js';
import { CHUNK_SIZE, type FileMetadataMessage } from './protocol.js';
import { endProgress, formatBytes, info, progress } from './ui.js';

const MIME_TYPES: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.csv': 'text/csv',
};

export function guessMimeType(file: string): string {
  return MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export interface LocalFile {
  path: string;
  name: string;
  size: number;
}

/** Validate paths up front so we fail before opening a room, not halfway through a transfer. */
export function resolveFiles(paths: string[]): LocalFile[] {
  return paths.map((p) => {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(p);
    } catch {
      throw new Error(`Cannot read "${p}"`);
    }
    if (stat.isDirectory()) throw new Error(`"${p}" is a directory. Zip it first (directories are not supported yet).`);
    if (!stat.isFile()) throw new Error(`"${p}" is not a regular file`);
    return { path: p, name: path.basename(p), size: stat.size };
  });
}

/** Stream files over the data channel using the same framing as the web client. */
export async function sendFiles(peer: Peer, files: LocalFile[]): Promise<void> {
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  let sentTotal = 0;
  const startedAt = Date.now();
  const buffer = Buffer.allocUnsafe(CHUNK_SIZE);

  for (const [index, file] of files.entries()) {
    const id = `${Date.now()}-${index}-${file.name}`;
    peer.sendControl({
      action: 'file-metadata',
      id,
      name: file.name,
      size: file.size,
      mimeType: guessMimeType(file.path),
      totalFiles: files.length,
      fileIndex: index,
    });

    const fd = fs.openSync(file.path, 'r');
    try {
      let offset = 0;
      while (offset < file.size) {
        const bytesRead = fs.readSync(fd, buffer, 0, Math.min(CHUNK_SIZE, file.size - offset), offset);
        if (bytesRead === 0) throw new Error(`"${file.name}" changed while sending`);
        // Copy: the shared read buffer is reused on the next iteration.
        await peer.sendChunk(Buffer.from(buffer.subarray(0, bytesRead)));
        offset += bytesRead;
        sentTotal += bytesRead;
        const elapsed = Math.max((Date.now() - startedAt) / 1000, 0.001);
        progress(`${index + 1}/${files.length} ${file.name}`, sentTotal, totalSize, sentTotal / elapsed);
      }
    } finally {
      fs.closeSync(fd);
    }
    peer.sendControl({ action: 'file-end', id });
  }
  endProgress();
}

/** Make an untrusted, peer-supplied file name safe to use inside `dir`. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 200);
  return cleaned || 'file';
}

function openUnique(dir: string, fileName: string): { fd: number; filePath: string } {
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);
  for (let n = 0; n < 1000; n++) {
    const candidate = path.join(dir, n === 0 ? fileName : `${stem} (${n})${ext}`);
    try {
      // 'wx' fails if the file exists, so an incoming file can never overwrite an existing one.
      return { fd: fs.openSync(candidate, 'wx'), filePath: candidate };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error(`Could not find a free file name for "${fileName}"`);
}

export interface ReceivedFileInfo {
  path: string;
  size: number;
}

/** Writes incoming files straight to disk, one chunk at a time, so memory use stays flat. */
export class FileReceiver {
  readonly received: ReceivedFileInfo[] = [];
  private current: { meta: FileMetadataMessage; fd: number; filePath: string; written: number } | null = null;
  private totalExpected = 0;
  private totalWritten = 0;
  private startedAt = 0;

  constructor(private readonly outDir: string) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  onMetadata(meta: FileMetadataMessage): void {
    this.abandonCurrent();
    if (meta.fileIndex === 0) {
      this.totalExpected = 0;
      this.totalWritten = 0;
      this.startedAt = Date.now();
    }
    this.totalExpected += Number(meta.size) || 0;
    const { fd, filePath } = openUnique(this.outDir, sanitizeFileName(String(meta.name)));
    this.current = { meta, fd, filePath, written: 0 };
  }

  onChunk(chunk: Buffer): void {
    const cur = this.current;
    if (!cur) return;
    fs.writeSync(cur.fd, chunk);
    cur.written += chunk.byteLength;
    this.totalWritten += chunk.byteLength;
    const elapsed = Math.max((Date.now() - this.startedAt) / 1000, 0.001);
    progress(
      `${cur.meta.fileIndex + 1}/${cur.meta.totalFiles} ${path.basename(cur.filePath)}`,
      this.totalWritten,
      this.totalExpected,
      this.totalWritten / elapsed,
    );
  }

  onFileEnd(): void {
    const cur = this.current;
    if (!cur) return;
    fs.closeSync(cur.fd);
    this.current = null;
    endProgress();
    if (cur.written !== cur.meta.size) {
      info(`warning: ${path.basename(cur.filePath)} is ${formatBytes(cur.written)}, expected ${formatBytes(cur.meta.size)}`);
    }
    this.received.push({ path: cur.filePath, size: cur.written });
    info(`saved ${cur.filePath} (${formatBytes(cur.written)})`);
  }

  /** Close a half-written file (connection lost); it is kept on disk so nothing is silently deleted. */
  abandonCurrent(): void {
    if (!this.current) return;
    fs.closeSync(this.current.fd);
    info(`incomplete: ${this.current.filePath}`);
    this.current = null;
  }
}
