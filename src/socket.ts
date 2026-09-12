import { WebSocketServer, WebSocket } from 'ws';
import { extractQueryParams } from './utils.js';
import { MESSAGE_TYPE, TYPE, type ConnectionConfig } from './const.js';
import { Connection } from './connection.js';

export function initSocketServer(server: any) {
    const WSS = new WebSocketServer({ server });
    WSS.on('connection', handleConnection);
    WSS.on('close', handleClose);
    WSS.on('error', handleError)
}

function handleConnection(ws: WebSocket, req: Request) {
    const [type, roomId] = extractQueryParams(req);
    let connectionKey = 0;
    try {
        switch (type) {
            case TYPE.CREATE: {
                connectionKey = Connection.createRoom(ws as any);
                break;
            }
            case TYPE.JOIN: {
                if (!roomId) throw new Error('Invalid Room Id');
                connectionKey = Connection.joinRoom(roomId, ws as any);
                if (!connectionKey) throw new Error('Room Expired');
                break;
            }
            default: {
                throw new Error('Invalid connection type');
            }
        }
        ws.on('message', (message) => handleClientMessage(message, connectionKey));
        ws.on('close', ()=>handleClientClose(connectionKey))
    }
    catch (err) {
        ws.close();
    }
}

function handleClose(code: any, reason: any) {
    console.log("Socket::Close");
}

function handleError(err: Error) {
    console.log("Socket:Error");
}

function handleClientMessage(message: any, connectionKey: number) {
    try {
        const { type, data } = JSON.parse(message);
        switch (type) {
            case MESSAGE_TYPE.CONTRACT: {
                Connection.forward(connectionKey, { type, data });
                break;
            }
        }
    }
    catch {
        Connection.close(connectionKey);
    }
}

function handleClientClose(connectionKey:number) {
    Connection.close(connectionKey);
}