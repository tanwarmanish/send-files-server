# file-drop-cli

Command-line client for the Send Files peer-to-peer app. Files and text go directly between devices over WebRTC; the server is only used to introduce the two sides.

It speaks the same protocol as the web app, so any combination works: CLI to CLI, CLI to browser, browser to CLI.

## Install

```bash
cd cli
npm install
npm run build
npm link          # optional: puts `filedrop` on your PATH
```

Requires Node.js 20 or newer. WebRTC comes from [`node-datachannel`](https://github.com/murat-dogan/node-datachannel), which ships prebuilt binaries for common platforms.

## Usage

```bash
# Send files. Prints a 6-digit code to give to the receiver.
filedrop send report.pdf photos.zip

# Send text, or pipe it in.
filedrop send -t "meeting at 4"
cat notes.txt | filedrop send -

# Receive (files are saved into the current directory unless -o is given).
filedrop receive 123456 -o ~/Downloads

# Shared notepad: every line you type is added to a note both sides see.
filedrop note            # start one and get a code
filedrop note 123456     # join one (from the CLI or the web app)
```

Text received with `filedrop receive` is written to stdout and status messages go to stderr, so it can be piped.

Notepad commands: `/show`, `/clear`, `/quit`.

### Options

| Option | Meaning |
| --- | --- |
| `-t, --text <text>` | Text to send (can be combined with files) |
| `-o, --out <dir>` | Directory for received files |
| `--server <url>` | Signaling server, e.g. `ws://localhost:5000`. Also read from `FILEDROP_SERVER` |

The default server is `wss://send-files-server.onrender.com`. If it is asleep, the first connection can take up to a minute.

## Safety

- Received file names come from the other side, so they are reduced to a plain file name (no directories, no `..`) and never overwrite an existing file; a number is appended instead.
- Files are written to disk as they arrive, so memory use stays flat for large files.
- Directories are not supported yet; zip them first.

## Protocol notes

- Signaling: WebSocket to the server, `?t=1` creates a room and `?t=2&r=<code>` joins it. The room creator is the WebRTC initiator and opens the `fileTransfer` data channel.
- Data channel: JSON control frames (`file-metadata`, `file-end`, `transfer-complete`, `transfer-ack`, `note-update`) plus binary 32 KB chunks.
- Notepad: each edit sends the whole note with a revision number. The highest revision wins; on a tie the room creator wins, so both sides always converge. Notes are limited to 100 KB.

## Development

```bash
npm run typecheck
npm test
```
