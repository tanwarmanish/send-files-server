# send-files-server

Signaling server for the Send Files peer-to-peer transfer app ([client](https://github.com/tanwarmanish/send-files-client), [live](https://share.manish.pro)).

Files and notes never pass through this server. It only relays the WebRTC handshake between the two peers in a room.

## Run

```bash
npm install
npm run dev        # watch mode
npm run build && npm start
```

`PORT` defaults to `5000`.

## Protocol

Peers connect over WebSocket:

| Query | Meaning |
| --- | --- |
| `?t=1` | Create a room. The server replies with `ROOM_CREATED` and a 6-digit `roomId`. |
| `?t=2&r=<roomId>` | Join a room. The server replies with `ROOM_JOINED`, and tells the creator `PEER_JOINED`. |

Messages are JSON `{ type, data }`. Types are defined in `src/const.ts`: `CONTRACT` (1) is relayed to the other peer and carries the WebRTC offer, answer and ICE candidates. A room holds one creator and one joiner and is closed when either side disconnects.

## CLI

The [`cli/`](cli) folder contains `filedrop`, a command-line client for the same protocol. See [cli/README.md](cli/README.md).
