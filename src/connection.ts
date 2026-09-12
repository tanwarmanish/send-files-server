import { MESSAGE_TYPE, USER } from "./const.js";
import { Room } from "./room.js";

class ConnectionClass {
    private _connections = new Map();

    constructor() { }

    _toConnectionKey(userId: number, roomId: number): number {
        return (roomId * 10) + userId;
    }

    _toSeperateIds(connectionKey: number): { userId: number, roomId: number } {
        return {
            userId: connectionKey % 10,
            roomId: connectionKey / 10 | 0,
        }
    }

    _generateRoomId() {
        const min = 10e4;
        const max = 10e5 - 1;
        let roomId = Math.floor(Math.random() * (max - min + 1)) + min;
        if (this._connections.get(roomId)) {
            roomId = this._generateRoomId();
        }
        return roomId;
    }

    _selectRoom(connectionKey: number) {
        const { userId, roomId } = this._toSeperateIds(connectionKey);
        const room = this._connections.get(roomId);
        return {
            userId,
            roomId,
            room,
        };
    }

    public createRoom(socket: WebSocket): number {
        const roomId = this._generateRoomId();
        const room = new Room(roomId, socket);
        this._connections.set(roomId, room);

        const connectionKey = this._toConnectionKey(USER.SENDER, roomId);
        this.notify(connectionKey, { type: MESSAGE_TYPE.ROOM_CREATED, data: { roomId } });
        return connectionKey;
    }

    public joinRoom(roomId: number, socket: WebSocket): number {
        const room = this._connections.get(roomId);
        if (!room) return 0;
        try {
            room.join(roomId, socket);
        }
        catch {
            return 0;
        }

        const connectionKey = this._toConnectionKey(USER.RECEIVER, roomId);
        this.notify(connectionKey, { type: MESSAGE_TYPE.ROOM_JOINED });
        this.forward(connectionKey, { type: MESSAGE_TYPE.PEER_JOINED });

        return connectionKey;
    }

    public notify(connectionKey: number, message: any) {
        const { userId, room } = this._selectRoom(connectionKey);
        room.send(userId, message);
    }

    public forward(connectionKey: number, message: any) {
        const { userId, room } = this._selectRoom(connectionKey);
        room.broadcast(message, [userId]);
    }

    public close(connectionKey: number) {
        const { room } = this._selectRoom(connectionKey);
        room.broadcast({ type: MESSAGE_TYPE.PEER_DISCONNECTED });
        room.closeAll();
    }
}

export const Connection = new ConnectionClass();