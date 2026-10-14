import { MAX_NOTE_BYTES, type NoteUpdateMessage, type PeerRole } from './protocol.js';

/**
 * State for the shared notepad. Every edit sends a full snapshot with a Lamport-style
 * revision; the highest revision wins and ties go to the room creator ('sender').
 * Mirrors `NoteState` in the web client so both sides converge identically.
 */
export class SharedNote {
  text = '';
  rev = 0;

  constructor(private readonly role: PeerRole) {}

  /** Record a local edit and return the message to send to the peer. */
  edit(text: string): NoteUpdateMessage {
    if (Buffer.byteLength(text, 'utf8') > MAX_NOTE_BYTES) {
      throw new Error(`Note is too large (limit ${MAX_NOTE_BYTES / 1024} KB)`);
    }
    this.text = text;
    this.rev += 1;
    return { action: 'note-update', text, rev: this.rev, role: this.role };
  }

  /** The current state as a message, e.g. to bring a peer that just connected up to date. */
  snapshot(): NoteUpdateMessage {
    return { action: 'note-update', text: this.text, rev: this.rev, role: this.role };
  }

  /** Apply a remote snapshot. Returns true when it replaced the local text. */
  receive(message: NoteUpdateMessage): boolean {
    if (typeof message.text !== 'string' || !Number.isFinite(message.rev)) return false;
    if (Buffer.byteLength(message.text, 'utf8') > MAX_NOTE_BYTES) return false;

    const remoteWins =
      message.rev > this.rev || (message.rev === this.rev && message.role === 'sender' && this.role !== 'sender');
    if (!remoteWins) return false;

    const changed = message.text !== this.text;
    this.text = message.text;
    this.rev = message.rev;
    return changed;
  }
}
