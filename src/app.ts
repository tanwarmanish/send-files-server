// import express from 'express';
// import { config } from 'dotenv';
// import { createServer } from 'http';
// import { initSocketServer } from './socket.js';

// config();
// const app = express();
// const server = createServer(app);
// initSocketServer(server);

// // check route
// app.get('/', (_req, res) => {
//   res.type('html').send(`<h1 style="text-align:center;margin:10%;">🚀🚀 Active 🚀🚀</h1>`);
// });


// // listening @
// const PORT = process.env.PORT || 5000;
// server.listen(PORT,()=>{
//   console.log(`🚀 listening at ::${PORT}`);
// })

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // Root check route
    if (url.pathname === '/' && request.method === 'GET') {
      const upgradeHeader = request.headers.get('Upgrade');

      // If Postman/Client is requesting a WebSocket upgrade
      if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
        const webSocketPair = new WebSocketPair();
        const [client, server] = Object.values(webSocketPair);
        if(!server) return new Response('Not Found', { status: 404 });

        server.accept();

        server.addEventListener('message', (event) => {
          server.send(`Echo: ${event.data}`);
        });

        server.addEventListener('close', () => {
          server.close();
        });

        return new Response(null, {
          status: 101,
          webSocket: client,
        } as any);
      }

      // Default HTML page
      return new Response(
        `<h1 style="text-align:center;margin:10%;">🚀🚀 Active 🚀🚀</h1>`,
        {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }

    return new Response('Not Found', { status: 404 });
  },
};