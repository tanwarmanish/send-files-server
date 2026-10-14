import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { CONNECTION_TYPE, MESSAGE_TYPE, type SocketMessage } from './protocol.js';

export interface SignalingEvents {
  'room-created': [roomId: string];
  'room-joined': [];
  'peer-joined': [];
  'peer-disconnected': [];
  'session-expired': [];
  contract: [data: unknown];
  close: [code: number];
  error: [error: Error];
}

export type JoinTarget = { create: true } | { create: false; roomId: string };

/** Thin wrapper over the server's WebSocket signaling protocol. */
export class Signaling extends EventEmitter<SignalingEvents> {
  private ws: WebSocket | null = null;

  constructor(private readonly baseUrl: string) {
    super();
  }

  connect(target: JoinTarget): void {
    const url = new URL(this.baseUrl);
    url.searchParams.set('t', String(target.create ? CONNECTION_TYPE.CREATE : CONNECTION_TYPE.JOIN));
    if (!target.create) url.searchParams.set('r', target.roomId);

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('message', (raw) => {
      let message: SocketMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      this.dispatch(message);
    });
    ws.on('error', (err) => this.emit('error', err));
    ws.on('close', (code) => this.emit('close', code));
  }

  private dispatch(message: SocketMessage): void {
    switch (message.type) {
      case MESSAGE_TYPE.ROOM_CREATED: {
        const roomId = (message.data as { roomId?: number | string } | undefined)?.roomId;
        if (roomId !== undefined) this.emit('room-created', String(roomId));
        break;
      }
      case MESSAGE_TYPE.ROOM_JOINED:
        this.emit('room-joined');
        break;
      case MESSAGE_TYPE.PEER_JOINED:
        this.emit('peer-joined');
        break;
      case MESSAGE_TYPE.PEER_DISCONNECTED:
        this.emit('peer-disconnected');
        break;
      case MESSAGE_TYPE.SESSION_EXPIRED:
        this.emit('session-expired');
        break;
      case MESSAGE_TYPE.CONTRACT:
        this.emit('contract', message.data);
        break;
      default:
        break;
    }
  }

  sendContract(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: MESSAGE_TYPE.CONTRACT, data }));
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
