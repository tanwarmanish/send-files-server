/**
 * Wire protocol shared with send-files-server and send-files-client.
 * Keep in sync with `src/const.ts` on the server and `src/lib/types.ts` on the client.
 */

export enum MESSAGE_TYPE {
  CONTRACT = 1,
  PING,
  ROOM_CREATED,
  ROOM_JOINED,
  PEER_JOINED,
  PEER_DISCONNECTED,
  SESSION_EXPIRED,
}

/** Connection type sent as the `t` query param when opening the WebSocket. */
export enum CONNECTION_TYPE {
  CREATE = 1,
  JOIN = 2,
}

export interface SocketMessage<T = unknown> {
  type: MESSAGE_TYPE;
  data?: T;
}

export interface IceCandidateInit {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

/** WebRTC signaling payloads, relayed by the server inside CONTRACT messages. */
export type SignalingData =
  | { type: 'offer'; sdp: { type: 'offer'; sdp: string } }
  | { type: 'answer'; sdp: { type: 'answer'; sdp: string } }
  | { type: 'ice-candidate'; candidate: IceCandidateInit };

/** Which side of the room a peer is on. The room creator is always the WebRTC initiator. */
export type PeerRole = 'sender' | 'receiver';

export interface FileMetadataMessage {
  action: 'file-metadata';
  id: string;
  name: string;
  size: number;
  mimeType: string;
  totalFiles: number;
  fileIndex: number;
}

export interface FileEndMessage {
  action: 'file-end';
  id: string;
}

export interface TransferCompleteMessage {
  action: 'transfer-complete';
}

/** Sent by the receiver once it has handled `transfer-complete`, so the sender can exit safely. */
export interface TransferAckMessage {
  action: 'transfer-ack';
}

/**
 * Full snapshot of the shared notepad. Last write wins, ordered by `rev`;
 * ties are broken in favour of the room creator (`role: 'sender'`).
 */
export interface NoteUpdateMessage {
  action: 'note-update';
  text: string;
  rev: number;
  role: PeerRole;
}

export type ControlMessage =
  | FileMetadataMessage
  | FileEndMessage
  | TransferCompleteMessage
  | TransferAckMessage
  | NoteUpdateMessage;

export const CHUNK_SIZE = 32 * 1024;
export const BUFFER_HIGH_WATER_MARK = 256 * 1024;
export const BUFFER_LOW_WATER_MARK = 64 * 1024;

/** Notepad snapshots must fit comfortably inside one data-channel message (browsers allow ~256 KB). */
export const MAX_NOTE_BYTES = 100 * 1024;

export const DEFAULT_SERVER = 'wss://send-files-server.onrender.com';
export const WEB_APP_URL = 'https://share.manish.pro';

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.services.mozilla.com' },
];
