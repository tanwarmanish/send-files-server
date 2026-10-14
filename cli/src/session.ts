import { DEFAULT_SERVER } from './protocol.js';
import { Peer } from './peer.js';
import { Signaling } from './signaling.js';
import { fail, info } from './ui.js';

export interface SessionOptions {
  server?: string;
}

export interface Session {
  signaling: Signaling;
  peer: Peer;
  /** Resolves with the room code once the server has created the room (creator only). */
  roomCode: Promise<string>;
  shutdown: (code?: number) => never;
}

const CONNECT_HINT_MS = 5000;

/**
 * Open a signaling connection and wire it to a Peer. The creator waits for PEER_JOINED before
 * starting WebRTC (it makes the offer); the joiner starts on ROOM_JOINED and waits for the offer.
 */
export function openSession(opts: SessionOptions, target: { create: true } | { create: false; roomId: string }): Session {
  const signaling = new Signaling(opts.server ?? process.env.FILEDROP_SERVER ?? DEFAULT_SERVER);
  const peer = new Peer(signaling, target.create ? 'sender' : 'receiver');

  const shutdown = (code = 0): never => {
    peer.close();
    signaling.close();
    // node-datachannel keeps native threads alive, so exit explicitly.
    process.exit(code);
  };

  let resolveCode!: (code: string) => void;
  const roomCode = new Promise<string>((resolve) => {
    resolveCode = resolve;
  });

  const hint = setTimeout(() => info('Connecting to the server (it may be waking up, this can take up to a minute)...'), CONNECT_HINT_MS);

  signaling.on('room-created', (roomId) => {
    clearTimeout(hint);
    resolveCode(roomId);
  });
  signaling.on('peer-joined', () => {
    void peer.start().catch((err) => fail(`Could not start the connection: ${err.message}`));
  });
  signaling.on('room-joined', () => {
    clearTimeout(hint);
    void peer.start().catch((err) => fail(`Could not start the connection: ${err.message}`));
  });
  signaling.on('contract', (data) => void peer.handleSignal(data));
  signaling.on('error', (err) => {
    clearTimeout(hint);
    fail(`Cannot reach the server: ${err.message}`);
  });
  signaling.on('session-expired', () => fail('The session expired.'));
  peer.on('error', (err) => info(`warning: ${err.message}`));

  signaling.connect(target);
  return { signaling, peer, roomCode, shutdown };
}
