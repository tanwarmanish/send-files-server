const isTTY = Boolean(process.stderr.isTTY);

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / 1024 ** i).toFixed(1))} ${units[i]}`;
}

/** Status lines go to stderr so stdout stays clean for piped data (e.g. received text). */
export function info(message: string): void {
  clearLine();
  process.stderr.write(`${message}\n`);
}

export function fail(message: string): never {
  clearLine();
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

function clearLine(): void {
  if (isTTY) process.stderr.write('\r\x1b[K');
}

let lastProgressAt = 0;

export function progress(label: string, done: number, total: number, speedBps: number): void {
  if (!isTTY) return;
  const now = Date.now();
  if (now - lastProgressAt < 100 && done < total) return;
  lastProgressAt = now;
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 100;
  const width = 24;
  const filled = Math.round((pct / 100) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const name = label.length > 28 ? `…${label.slice(-27)}` : label;
  process.stderr.write(`\r\x1b[K${name}  ${bar} ${pct.toFixed(0).padStart(3)}%  ${formatBytes(done)}/${formatBytes(total)}  ${formatBytes(speedBps)}/s`);
}

export function endProgress(): void {
  clearLine();
}
