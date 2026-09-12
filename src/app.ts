import express from 'express';
import { config } from 'dotenv';
import { createServer } from 'http';
import { initSocketServer } from './socket.js';

config();
const app = express();
const server = createServer(app);
initSocketServer(server);

// check route
app.get('/', (_req, res) => {
  res.type('html').send(`<h1 style="text-align:center;margin:10%;">🚀🚀 Active 🚀🚀</h1>`);
});


// listening @
const PORT = process.env.PORT || 5000;
server.listen(PORT,()=>{
  console.log(`🚀 listening at ::${PORT}`);
})