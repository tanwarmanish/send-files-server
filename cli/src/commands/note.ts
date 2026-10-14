import readline from 'node:readline';
import { SharedNote } from '../note.js';
import { WEB_APP_URL, type ControlMessage } from '../protocol.js';
import { openSession, type SessionOptions } from '../session.js';
import { fail, info } from '../ui.js';

export interface NoteOptions extends SessionOptions {
  /** Join this room; omit to create a new one. */
  code?: string;
}

/**
 * Interactive shared notepad. Each line you type is appended to the shared note;
 * the peer's changes are printed as they arrive. Works with the web app's notepad.
 */
export async function noteSession(opts: NoteOptions): Promise<void> {
  const creating = opts.code === undefined;
  if (!creating && !/^\d{6}$/.test(opts.code ?? '')) fail('The code must be 6 digits, e.g. 123456.');

  const role = creating ? 'sender' : 'receiver';
  const note = new SharedNote(role);
  const target = creating ? ({ create: true } as const) : ({ create: false, roomId: opts.code as string } as const);
  const { peer, signaling, roomCode, shutdown } = openSession(opts, target);
  process.on('SIGINT', () => shutdown(130));

  let connected = false;
  signaling.on('close', () => {
    if (!connected && !creating) fail(`Could not join room ${opts.code}. It may not exist or has expired.`);
  });

  if (creating) {
    const code = await roomCode;
    info(`Shared notepad code: ${code}`);
    info(`On the other device run:  filedrop note ${code}`);
    info(`or open ${WEB_APP_URL}, join with the code and use the notepad.`);
    info('Waiting for the other side...');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, prompt: '> ', terminal: Boolean(process.stdin.isTTY) });

  /** Print above the prompt without clobbering what the user is typing. */
  const say = (text: string) => {
    if (process.stderr.isTTY) process.stderr.write('\r\x1b[K');
    process.stderr.write(`${text}\n`);
    if (connected) rl.prompt(true);
  };

  const broadcast = (text: string) => {
    try {
      peer.sendControl(note.edit(text));
    } catch (err) {
      say(`error: ${(err as Error).message}`);
    }
  };

  peer.on('open', () => {
    connected = true;
    say('Connected. Type a line and press Enter to add it to the note. Commands: /show /clear /quit');
    // Bring the other side up to date if we already hold content.
    if (note.rev > 0) peer.sendControl(note.snapshot());
    rl.prompt();
  });

  peer.on('close', () => {
    if (connected) say('The other side left.');
    shutdown(0);
  });

  peer.on('control', (msg: ControlMessage) => {
    if (msg.action !== 'note-update') return;
    const previous = note.text;
    if (!note.receive(msg)) return;
    if (note.text.startsWith(previous)) {
      const added = note.text.slice(previous.length).replace(/\n$/, '');
      for (const line of added.split('\n')) say(`< ${line}`);
    } else {
      say('--- note replaced by the other side ---');
      if (note.text) say(note.text.replace(/\n$/, ''));
    }
  });

  rl.on('line', (line) => {
    const input = line.trim();
    if (input === '/quit') return shutdown(0);
    if (input === '/show') {
      say(note.text ? note.text.replace(/\n$/, '') : '(empty)');
      return;
    }
    if (input === '/clear') {
      broadcast('');
      say('(note cleared)');
      return;
    }
    if (!connected) {
      say('Not connected yet.');
      return;
    }
    if (line.length > 0) broadcast(`${note.text}${line}\n`);
    rl.prompt();
  });

  // Piped input finished (e.g. `echo hi | filedrop note 123456`): let it flush, then leave.
  rl.on('close', () => {
    void peer.drain().then(() => setTimeout(() => shutdown(0), 300));
  });
}
