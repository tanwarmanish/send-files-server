import { SharedNote } from '../note.js';
import { WEB_APP_URL, type ControlMessage } from '../protocol.js';
import { openSession, type SessionOptions } from '../session.js';
import { resolveFiles, sendFiles } from '../transfer.js';
import { fail, formatBytes, info } from '../ui.js';

export interface SendOptions extends SessionOptions {
  files: string[];
  text?: string;
}

const ACK_TIMEOUT_MS = 5000;

export async function send(opts: SendOptions): Promise<void> {
  if (opts.files.length === 0 && opts.text === undefined) {
    fail('Nothing to send. Pass files, --text "..." or "-" to read text from stdin.');
  }

  let files: ReturnType<typeof resolveFiles> = [];
  try {
    files = resolveFiles(opts.files);
  } catch (err) {
    fail((err as Error).message);
  }

  const { peer, roomCode, shutdown } = openSession(opts, { create: true });
  process.on('SIGINT', () => shutdown(130));

  const code = await roomCode;
  const total = files.reduce((sum, f) => sum + f.size, 0);
  const what = [
    files.length > 0 ? `${files.length} file${files.length > 1 ? 's' : ''} (${formatBytes(total)})` : '',
    opts.text !== undefined ? 'text' : '',
  ]
    .filter(Boolean)
    .join(' + ');
  info(`Sending ${what}`);
  info('');
  info(`  Code: ${code}`);
  info('');
  info(`On the other device run:  filedrop receive ${code}`);
  info(`or open ${WEB_APP_URL} and enter the code.`);
  info('Waiting for the receiver...');

  let finished = false;
  const acked = new Promise<void>((resolve) => {
    peer.on('control', (msg: ControlMessage) => {
      if (msg.action === 'transfer-ack') resolve();
    });
    peer.on('close', () => resolve());
  });

  peer.on('close', () => {
    if (!finished) fail('Connection to the receiver was lost before the transfer finished.');
  });

  peer.on('open', () => {
    void (async () => {
      try {
        info('Connected. Sending...');
        if (opts.text !== undefined) peer.sendControl(new SharedNote('sender').edit(opts.text));
        await sendFiles(peer, files);
        peer.sendControl({ action: 'transfer-complete' });
        await peer.drain();
        // Newer receivers acknowledge; older ones (and the web app) do not, so don't wait forever.
        await Promise.race([acked, new Promise((r) => setTimeout(r, ACK_TIMEOUT_MS))]);
        finished = true;
        info('Done.');
        shutdown(0);
      } catch (err) {
        fail((err as Error).message);
      }
    })();
  });
}
