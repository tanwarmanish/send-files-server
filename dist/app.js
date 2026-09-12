// src/app.ts
import express from "express";
import { config } from "dotenv";
import { createServer } from "http";

// src/socket.ts
import { WebSocketServer } from "ws";

// src/utils.ts
function extractQueryParams(req) {
  const queryParams = new URLSearchParams(req.url.split("?")[1]);
  const allowedQP = ["t", "r"];
  return allowedQP.map((query) => {
    try {
      return +queryParams.get(query);
    } catch {
    }
    return null;
  });
}

// src/room.ts
var Room = class {
  constructor(roomId, socket) {
    this.roomId = roomId;
    this._socket[1 /* SENDER */] = socket;
  }
  roomId;
  _socket = {};
  _getSocket(userId) {
    const socket = this._socket[userId];
    return socket;
  }
  join(roomId, socket) {
    if (this.roomId != roomId) throw new Error("Invalid Room Id");
    this._socket[2 /* RECEIVER */] = socket;
  }
  send(userId, message) {
    const socket = this._getSocket(userId);
    if (!socket) throw new Error("Invalid User");
    const messagePayload = {
      type: 2 /* PING */,
      data: null,
      ...message
    };
    socket.send(JSON.stringify(messagePayload));
  }
  broadcast(message, exclude = []) {
    Object.keys(this._socket).forEach((userId) => {
      if (!exclude.includes(+userId)) {
        this.send(+userId, message);
      }
    });
  }
  close(userId) {
    const socket = this._getSocket(userId);
    if (!socket) throw Error("Connection Not Found!!");
    socket.close();
  }
  closeAll(exclude = []) {
    Object.keys(this._socket).forEach((userId) => {
      if (!exclude.includes(+userId)) {
        this.close(+userId);
      }
    });
  }
};

// src/connection.ts
var ConnectionClass = class {
  _connections = /* @__PURE__ */ new Map();
  constructor() {
  }
  _toConnectionKey(userId, roomId) {
    return roomId * 10 + userId;
  }
  _toSeperateIds(connectionKey) {
    return {
      userId: connectionKey % 10,
      roomId: connectionKey / 10 | 0
    };
  }
  _generateRoomId() {
    const min = 1e5;
    const max = 1e6 - 1;
    let roomId = Math.floor(Math.random() * (max - min + 1)) + min;
    if (this._connections.get(roomId)) {
      roomId = this._generateRoomId();
    }
    return roomId;
  }
  _selectRoom(connectionKey) {
    const { userId, roomId } = this._toSeperateIds(connectionKey);
    const room = this._connections.get(roomId);
    return {
      userId,
      roomId,
      room
    };
  }
  createRoom(socket) {
    const roomId = this._generateRoomId();
    const room = new Room(roomId, socket);
    this._connections.set(roomId, room);
    const connectionKey = this._toConnectionKey(1 /* SENDER */, roomId);
    this.notify(connectionKey, { type: 3 /* ROOM_CREATED */, data: { roomId } });
    return connectionKey;
  }
  joinRoom(roomId, socket) {
    const room = this._connections.get(roomId);
    if (!room) return 0;
    try {
      room.join(roomId, socket);
    } catch {
      return 0;
    }
    const connectionKey = this._toConnectionKey(2 /* RECEIVER */, roomId);
    this.notify(connectionKey, { type: 4 /* ROOM_JOINED */ });
    this.forward(connectionKey, { type: 5 /* PEER_JOINED */ });
    return connectionKey;
  }
  notify(connectionKey, message) {
    const { userId, room } = this._selectRoom(connectionKey);
    room.send(userId, message);
  }
  forward(connectionKey, message) {
    const { userId, room } = this._selectRoom(connectionKey);
    room.broadcast(message, [userId]);
  }
  close(connectionKey) {
    const { room } = this._selectRoom(connectionKey);
    room.broadcast({ type: 6 /* PEER_DISCONNECTED */ });
    room.closeAll();
  }
};
var Connection = new ConnectionClass();

// src/socket.ts
function initSocketServer(server2) {
  const WSS = new WebSocketServer({ server: server2 });
  WSS.on("connection", handleConnection);
  WSS.on("close", handleClose);
  WSS.on("error", handleError);
}
function handleConnection(ws, req) {
  const [type, roomId] = extractQueryParams(req);
  let connectionKey = 0;
  try {
    switch (type) {
      case 1 /* CREATE */: {
        connectionKey = Connection.createRoom(ws);
        break;
      }
      case 2 /* JOIN */: {
        if (!roomId) throw new Error("Invalid Room Id");
        connectionKey = Connection.joinRoom(roomId, ws);
        if (!connectionKey) throw new Error("Room Expired");
        break;
      }
      default: {
        throw new Error("Invalid connection type");
      }
    }
    ws.on("message", (message) => handleClientMessage(message, connectionKey));
    ws.on("close", () => handleClientClose(connectionKey));
  } catch (err) {
    ws.close();
  }
}
function handleClose(code, reason) {
  console.log("Socket::Close");
}
function handleError(err) {
  console.log("Socket:Error");
}
function handleClientMessage(message, connectionKey) {
  try {
    const { type, data } = JSON.parse(message);
    switch (type) {
      case 1 /* CONTRACT */: {
        Connection.forward(connectionKey, { type, data });
        break;
      }
    }
  } catch {
    Connection.close(connectionKey);
  }
}
function handleClientClose(connectionKey) {
  Connection.close(connectionKey);
}

// src/app.ts
config();
var app = express();
var server = createServer(app);
initSocketServer(server);
app.get("/", (_req, res) => {
  res.type("html").send(`<h1 style="text-align:center;margin:10%;">\u{1F680}\u{1F680} Active \u{1F680}\u{1F680}</h1>`);
});
var PORT = process.env.PORT || 5e3;
server.listen(PORT, () => {
  console.log(`\u{1F680} listening at ::${PORT}`);
});
