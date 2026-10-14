import { EventEmitter } from 'node:events';
import { RTCPeerConnection } from 'node-datachannel/polyfill';
import {
  BUFFER_HIGH_WATER_MARK,
  BUFFER_LOW_WATER_MARK,
  ICE_SERVERS,
  type ControlMessage,
  type IceCandidateInit,
  type PeerRole,
  type SignalingData,
} from './protocol.js';
import type { Signaling } from './signaling.js';

export interface PeerEvents {
  open: [];
  close: [];
  control: [message: ControlMessage];
  chunk: [chunk: Buffer];
  error: [error: Error];
}

type DataChannel = ReturnType<RTCPeerConnection['createDataChannel']>;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One WebRTC connection to the other side of a room.
 * The room creator ('sender') is the initiator: it creates the data channel and the offer,
 * exactly like the web client does when it receives PEER_JOINED.
 */
export class Peer extends EventEmitter<PeerEvents> {
  private pc: RTCPeerConnection | null = null;
  private dc: DataChannel | null = null;
  private pendingCandidates: IceCandidateInit[] = [];
  private closed = false;

  constructor(
    private readonly signaling: Signaling,
    readonly role: PeerRole,
  ) {
    super();
  }

  async start(): Promise<void> {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;

    pc.onicecandidate = (event) => {
      const c = event.candidate;
      if (c && c.candidate) {
        this.signaling.sendContract({
          type: 'ice-candidate',
          // libdatachannel prefixes candidates with "a="; the WebRTC API form has no prefix.
          candidate: { candidate: c.candidate.replace(/^a=/, ''), sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
        this.handleClosed();
      }
    };

    if (this.role === 'sender') {
      this.setupChannel(pc.createDataChannel('fileTransfer', { ordered: true }));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const local = pc.localDescription;
      if (local) this.signaling.sendContract({ type: 'offer', sdp: { type: local.type, sdp: local.sdp } });
    } else {
      pc.ondatachannel = (event) => this.setupChannel(event.channel);
    }
  }

  async handleSignal(data: unknown): Promise<void> {
    if (!data || typeof data !== 'object' || !this.pc) return;
    const signal = data as SignalingData;
    const pc = this.pc;

    try {
      if (signal.type === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp.sdp });
        await this.flushCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const local = pc.localDescription;
        if (local) this.signaling.sendContract({ type: 'answer', sdp: { type: local.type, sdp: local.sdp } });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp.sdp });
        await this.flushCandidates();
      } else if (signal.type === 'ice-candidate' && signal.candidate?.candidate) {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(signal.candidate);
        } else {
          this.pendingCandidates.push(signal.candidate);
        }
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async flushCandidates(): Promise<void> {
    while (this.pendingCandidates.length > 0 && this.pc) {
      const candidate = this.pendingCandidates.shift();
      if (!candidate) continue;
      try {
        await this.pc.addIceCandidate(candidate);
      } catch {
        // A stale or unusable candidate must not abort the connection.
      }
    }
  }

  private setupChannel(dc: DataChannel): void {
    this.dc = dc;
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = BUFFER_LOW_WATER_MARK;
    dc.onopen = () => this.emit('open');
    dc.onclose = () => this.handleClosed();
    dc.onerror = () => this.emit('error', new Error('Data channel error'));
    dc.onmessage = (event) => {
      const data = event.data as unknown;
      if (typeof data === 'string') {
        try {
          this.emit('control', JSON.parse(data) as ControlMessage);
        } catch {
          // Ignore malformed control frames.
        }
      } else if (data instanceof ArrayBuffer) {
        this.emit('chunk', Buffer.from(data));
      } else if (ArrayBuffer.isView(data)) {
        this.emit('chunk', Buffer.from(data.buffer, data.byteOffset, data.byteLength));
      }
    };
  }

  get isOpen(): boolean {
    return this.dc?.readyState === 'open';
  }

  sendControl(message: ControlMessage): void {
    if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify(message));
  }

  /** Send binary data, waiting while the channel's send buffer is above the high-water mark. */
  async sendChunk(chunk: Buffer): Promise<void> {
    const dc = this.dc;
    if (!dc || dc.readyState !== 'open') throw new Error('Data channel is not open');
    while (dc.bufferedAmount > BUFFER_HIGH_WATER_MARK) {
      if (dc.readyState !== 'open') throw new Error('Connection lost during transfer');
      await sleep(5);
    }
    dc.send(chunk);
  }

  /** Resolve once everything queued has left the send buffer (or the channel closes). */
  async drain(timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.dc && this.dc.readyState === 'open' && this.dc.bufferedAmount > 0 && Date.now() < deadline) {
      await sleep(10);
    }
  }

  private handleClosed(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }

  close(): void {
    this.closed = true;
    try {
      this.dc?.close();
      this.pc?.close();
    } catch {
      // Already closed.
    }
    this.dc = null;
    this.pc = null;
  }
}
