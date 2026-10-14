import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { FileReceiver, resolveFiles, sanitizeFileName } from '../src/transfer.js';

test('sanitizeFileName strips directories and traversal attempts', () => {
  assert.equal(sanitizeFileName('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFileName('C:\\Windows\\system32\\evil.dll'), 'evil.dll');
  assert.equal(sanitizeFileName('/abs/path/file.txt'), 'file.txt');
});

test('sanitizeFileName removes control and reserved characters and leading dots', () => {
  assert.equal(sanitizeFileName('a\u0000b\nc.txt'), 'a_b_c.txt');
  assert.equal(sanitizeFileName('we<ir>d:na"me?.txt'), 'we_ir_d_na_me_.txt');
  assert.equal(sanitizeFileName('.hidden'), 'hidden');
});

test('sanitizeFileName never returns an empty or dot-only name', () => {
  assert.equal(sanitizeFileName(''), 'file');
  assert.equal(sanitizeFileName('..'), 'file');
  assert.equal(sanitizeFileName('/'), 'file');
});

test('FileReceiver writes inside the target directory and never overwrites', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filedrop-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'report.txt'), 'original');
    const receiver = new FileReceiver(dir);
    receiver.onMetadata({
      action: 'file-metadata',
      id: '1',
      name: '../../report.txt',
      size: 5,
      mimeType: 'text/plain',
      totalFiles: 1,
      fileIndex: 0,
    });
    receiver.onChunk(Buffer.from('hello'));
    receiver.onFileEnd();

    assert.equal(fs.readFileSync(path.join(dir, 'report.txt'), 'utf8'), 'original');
    assert.equal(fs.readFileSync(path.join(dir, 'report (1).txt'), 'utf8'), 'hello');
    assert.equal(receiver.received.length, 1);
    assert.equal(path.dirname(receiver.received[0]!.path), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveFiles rejects directories and missing paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filedrop-test-'));
  try {
    assert.throws(() => resolveFiles([dir]), /directory/);
    assert.throws(() => resolveFiles([path.join(dir, 'nope')]), /Cannot read/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
