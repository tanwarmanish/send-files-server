import path from 'node:path';
import { SharedNote } from '../note.js';
import type { ControlMessage } from '../protocol.js';
import { openSession, type SessionOptions } from '../session.js';
import { FileReceiver } from '../transfer.js';
import { fail, info } from '../ui.js';

export interface ReceiveOptions extends SessionOptions {
  code: string;
  outDir: string;
}

export async function receive(opts: ReceiveOptions): Promise<void> {
  if (!/^\d{6}$/.test(opts.code)) fail('The code must be 6 digits, e.g. 123456.');

  const outDir = path.resolve(opts.outDir);
  const files = new FileReceiver(outDir);
  const note = new SharedNote('receiver');
  const { peer, signaling, shutdown } = openSession(opts, { create: false, roomId: opts.code });
  process.on('SIGINT', () => shutdown(130));

  let finished = false;
  let connected = false;

  signaling.on('close', () => {
    if (!connected) fail(`Could not join room ${opts.code}. It may not exist or has expired.`);
  });

  peer.on('open', () => {
    connected = true;
    info(`Connected. Receiving into ${outDir}`);
  });

  peer.on('close', () => {
    if (finished) return;
    files.abandonCurrent();
    fail('Connection to the sender was lost before the transfer finished.');
  });

  peer.on('chunk', (chunk) => files.onChunk(chunk));

  peer.on('control', (msg: ControlMessage) => {
    try {
      switch (msg.action) {
        case 'file-metadata':
          files.onMetadata(msg);
          break;
        case 'file-end':
          files.onFileEnd();
          break;
        case 'note-update':
          // Text goes to stdout so it can be piped; everything else stays on stderr.
          if (note.receive(msg)) process.stdout.write(`${msg.text}${msg.text.endsWith('\n') ? '' : '\n'}`);
          break;
        case 'transfer-complete':
          finished = true;
          peer.sendControl({ action: 'transfer-ack' });
          void peer.drain().then(() => {
            const count = files.received.length;
            info(count > 0 ? `Done. Received ${count} file${count > 1 ? 's' : ''}.` : 'Done.');
            // Give the ack a moment to leave before tearing the connection down.
            setTimeout(() => shutdown(0), 300);
          });
          break;
        default:
          break;
      }
    } catch (err) {
      fail((err as Error).message);
    }
  });
}
