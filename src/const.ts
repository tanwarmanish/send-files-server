export enum TYPE {
    CREATE = 1,
    JOIN
};

export interface ConnectionConfig {
    roomId: number,
    key: number
}

export enum USER {
    SENDER = 1,
    RECEIVER,
}

export enum MESSAGE_TYPE {
    CONTRACT = 1,
    PING,
    ROOM_CREATED,
    ROOM_JOINED,
    PEER_JOINED,
    PEER_DISCONNECTED,
}