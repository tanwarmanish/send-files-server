import { MESSAGE_TYPE, USER } from "./const.js";
import { Room } from "./room.js";

class ConnectionClass {
    private _connections = new Map();
    private _active = new Map();

    constructor() {
        // this._cleanUp();
    }

    _cleanUp() {
        const EXPIRY_TIMEOUT_SECONDS = 60 * 3;
        const CLEANUP_TIMEOUT_SECONDES = 10;

        const callback = () => {
            const collect: number[] = [];
            this._active.keys().forEach(roomId => {
                const lastUpdated = this._active.get(roomId)
                const current = new Date();
                const timeDifference = (current.getTime() - lastUpdated);
                if (timeDifference >= EXPIRY_TIMEOUT_SECONDS * 1e3) {
                    collect.push(roomId);
                }
            });
            console.log("Removing inactive rooms", collect);
            collect.forEach(roomId => {
                const connectionKey = this._toConnectionKey(0, roomId);
                this.close(connectionKey);
            });
        };

        setInterval(callback, 10e2 * CLEANUP_TIMEOUT_SECONDES);
    }

    _toConnectionKey(userId: number, roomId: number): number {
        return (roomId * 10) + userId;
    }

    _toSeperateIds(connectionKey: number): { userId: number, roomId: number } {
        return {
            userId: connectionKey % 10,
            roomId: connectionKey / 10 | 0,
        }
    }

    _selectRoom(connectionKey: number) {
        const { userId, roomId } = this._toSeperateIds(connectionKey);
        const room = this._connections.get(roomId);
        if (!room) return null;
        return {
            userId,
            roomId,
            room,
        };
    }


    _generateRoomId() {
        const min = 10e4;
        const max = 10e5 - 1;
        let roomId = Math.floor(Math.random() * (max - min + 1)) + min;
        if (this._selectRoom(roomId)) {
            roomId = this._generateRoomId();
        }
        return roomId;
    }



    public createRoom(socket: WebSocket): number {
        const roomId = this._generateRoomId();
        const room = new Room(roomId, socket);
        this._connections.set(roomId, room);
        this._active.set(roomId, new Date().getTime());

        const connectionKey = this._toConnectionKey(USER.SENDER, roomId);
        this.notify(connectionKey, { type: MESSAGE_TYPE.ROOM_CREATED, data: { roomId } });
        return connectionKey;
    }

    public joinRoom(roomId: number, socket: WebSocket): number {
        const connectionKey = this._toConnectionKey(USER.RECEIVER, roomId);
        const connection = this._selectRoom(connectionKey);
        if (!connection) return 0;
        try {
            connection.room.join(roomId, socket);
        }
        catch {
            return 0;
        }

        this.notify(connectionKey, { type: MESSAGE_TYPE.ROOM_JOINED });
        this.forward(connectionKey, { type: MESSAGE_TYPE.PEER_JOINED });

        return connectionKey;
    }

    public notify(connectionKey: number, message: any) {
        const connection = this._selectRoom(connectionKey);
        if (!connection) throw new Error('Room Expired');
        const { room, userId } = connection;
        room.send(userId, message);
    }

    public forward(connectionKey: number, message: any) {
        const connection = this._selectRoom(connectionKey);
        if (!connection) throw new Error('Room Expired');
        const { userId, room } = connection;
        room.broadcast(message, [userId]);
    }

    public close(connectionKey: number) {
        const connection = this._selectRoom(connectionKey);
        if (!connection) return;
        const { room, roomId } = connection;
        this._connections.delete(roomId);
        this._active.delete(roomId);
        room.broadcast({ type: MESSAGE_TYPE.PEER_DISCONNECTED });
        room.closeAll();
    }
}

export const Connection = new ConnectionClass();