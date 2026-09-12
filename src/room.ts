import { MESSAGE_TYPE, USER } from "./const.js";

export class Room {
    private _socket: { [userId: number]: WebSocket } = {};

    constructor(private roomId: number, socket: WebSocket) {
        this._socket[USER.SENDER] = socket;
    }

    private _getSocket(userId: number) {
        const socket = this._socket[userId];
        return socket;
    }

    public join(roomId: number, socket: WebSocket) {
        if (this.roomId != roomId) throw new Error('Invalid Room Id');
        this._socket[USER.RECEIVER] = socket;
    }

    public send(userId: number, message: any) {
        const socket = this._getSocket(userId);
        if (!socket) throw new Error('Invalid User');
        const messagePayload = {
            type: MESSAGE_TYPE.PING,
            data: null,
            ...message
        }
        socket.send(JSON.stringify(messagePayload));
    }

    public broadcast(message: any, exclude: number[] = []) {
        Object.keys(this._socket).forEach((userId) => {
            if (!exclude.includes(+userId)) {
                this.send(+userId, message);
            }
        });
    }

    public close(userId: number) {
        const socket = this._getSocket(userId);
        if (!socket) throw Error('Connection Not Found!!');
        socket.close();
    }

    public closeAll(exclude: number[] = []) {
        Object.keys(this._socket).forEach((userId) => {
            if (!exclude.includes(+userId)) {
                this.close(+userId);
            }
        });
    }
}
