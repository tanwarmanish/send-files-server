import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { noteSession } from './commands/note.js';
import { receive } from './commands/receive.js';
import { send } from './commands/send.js';
import { fail } from './ui.js';

const HELP = `filedrop - send files and text between devices over WebRTC

Usage:
  filedrop send <file...>            Send one or more files
  filedrop send -t "some text"       Send text
  <command> | filedrop send -        Send text read from stdin
  filedrop receive <code> [-o dir]   Receive files/text (default dir: current directory)
  filedrop note [code]               Open a shared notepad; omit the code to start one

Options:
  -t, --text <text>    Text to send (can be combined with files)
  -o, --out <dir>      Directory to save received files in
      --server <url>   Signaling server (default: $FILEDROP_SERVER or the public server)
  -v, --version        Print version
  -h, --help           Show this help

Works with the web app too: a code from "filedrop send" can be entered on the site, and vice versa.`;

/** Injected at build time (tsup `define` / esbuild `define`), so no package.json lookup is needed at runtime. */
declare const __VERSION__: string;

function version(): string {
  return __VERSION__;
}

async function main(): Promise<void> {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof options; allowPositionals: true }>>;
  const options = {
    text: { type: 'string', short: 't' },
    out: { type: 'string', short: 'o' },
    server: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  } as const;

  try {
    parsed = parseArgs({ args: process.argv.slice(2), options, allowPositionals: true });
  } catch (err) {
    fail(`${(err as Error).message}\n\n${HELP}`);
  }

  const { values, positionals } = parsed;
  if (values.version) {
    console.log(version());
    return;
  }

  const [command, ...rest] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return;
  }

  switch (command) {
    case 'send': {
      let text = values.text;
      let files = rest;
      if (rest.includes('-')) {
        files = rest.filter((arg) => arg !== '-');
        if (process.stdin.isTTY) fail('"-" reads text from stdin, but stdin is a terminal. Pipe something in or use --text.');
        text = fs.readFileSync(0, 'utf8');
      }
      await send({ files, text, server: values.server });
      break;
    }
    case 'receive': {
      const [code] = rest;
      if (!code) fail('Missing code. Usage: filedrop receive <6-digit code>');
      await receive({ code, outDir: values.out ?? '.', server: values.server });
      break;
    }
    case 'note':
      await noteSession({ code: rest[0], server: values.server });
      break;
    default:
      fail(`Unknown command "${command}".\n\n${HELP}`);
  }
}

main().catch((err: Error) => fail(err.message));
