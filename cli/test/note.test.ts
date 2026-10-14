import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SharedNote } from '../src/note.js';
import { MAX_NOTE_BYTES } from '../src/protocol.js';

test('local edits bump the revision and produce a snapshot', () => {
  const note = new SharedNote('sender');
  const msg = note.edit('hello');
  assert.deepEqual(msg, { action: 'note-update', text: 'hello', rev: 1, role: 'sender' });
  assert.equal(note.edit('hello world').rev, 2);
});

test('a higher remote revision replaces local text', () => {
  const note = new SharedNote('receiver');
  note.edit('mine');
  assert.equal(note.receive({ action: 'note-update', text: 'theirs', rev: 5, role: 'sender' }), true);
  assert.equal(note.text, 'theirs');
  assert.equal(note.rev, 5);
});

test('a lower remote revision is ignored', () => {
  const note = new SharedNote('receiver');
  note.edit('a');
  note.edit('b');
  assert.equal(note.receive({ action: 'note-update', text: 'stale', rev: 1, role: 'sender' }), false);
  assert.equal(note.text, 'b');
});

test('after remote text arrives the next local edit gets a higher revision', () => {
  const note = new SharedNote('receiver');
  note.receive({ action: 'note-update', text: 'x', rev: 7, role: 'sender' });
  assert.equal(note.edit('y').rev, 8);
});

test('concurrent edits with equal revisions converge on the sender (room creator) text', () => {
  const sender = new SharedNote('sender');
  const receiver = new SharedNote('receiver');
  const fromSender = sender.edit('sender text');
  const fromReceiver = receiver.edit('receiver text');
  assert.equal(fromSender.rev, fromReceiver.rev);

  sender.receive(fromReceiver);
  receiver.receive(fromSender);
  assert.equal(sender.text, 'sender text');
  assert.equal(receiver.text, 'sender text');
});

test('oversized or malformed remote messages are rejected', () => {
  const note = new SharedNote('receiver');
  const huge = 'x'.repeat(MAX_NOTE_BYTES + 1);
  assert.equal(note.receive({ action: 'note-update', text: huge, rev: 9, role: 'sender' }), false);
  assert.equal(note.receive({ action: 'note-update', text: 5 as unknown as string, rev: 9, role: 'sender' }), false);
  assert.equal(note.receive({ action: 'note-update', text: 'ok', rev: Number.NaN, role: 'sender' }), false);
  assert.equal(note.text, '');
});

test('oversized local edits throw instead of being sent', () => {
  const note = new SharedNote('sender');
  assert.throws(() => note.edit('x'.repeat(MAX_NOTE_BYTES + 1)), /too large/);
});
