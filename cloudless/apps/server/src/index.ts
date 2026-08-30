if (!(Promise as any).withResolvers) {
  (Promise as any).withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';

const app = express();
app.use(cors());
app.use(express.json());

const HTTP_PORT = process.env.PORT || 3001;
const P2P_PORT = process.env.P2P_PORT || 9091;

// --- MOCK LEDGER (Layer 3) ---
const permissions: Record<string, string[]> = {}; // docId -> pk[]

app.post('/api/ledger/grant', (req, res) => {
  const { docId, pk } = req.body;
  if (!permissions[docId]) {
    permissions[docId] = [];
  }
  if (!permissions[docId].includes(pk)) {
    permissions[docId].push(pk);
  }
  console.log(`[Ledger] Granted ${pk} access to ${docId}`);
  res.json({ success: true });
});

app.get('/api/ledger/verify', (req, res) => {
  const { docId, pk } = req.query;
  const allowed = permissions[docId as string]?.includes(pk as string) || false;
  res.json({ allowed });
});

// --- TRADITIONAL OT WEBSOCKET (Layer 2 - Web2 Mode) ---
const wss = new WebSocketServer({ noServer: true });
const rooms: Record<string, Set<WebSocket>> = {};

function broadcastClientCount(docId: string) {
  const count = rooms[docId]?.size || 0;
  const msg = JSON.stringify({ type: 'system', action: 'clients_update', count });
  for (const client of rooms[docId] || []) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

wss.on('connection', (ws, req) => {
  const docId = req.url?.split('/').pop() || 'default';
  if (!rooms[docId]) rooms[docId] = new Set();
  rooms[docId].add(ws);

  console.log(`[OT Server] Client joined ${docId} (Total: ${rooms[docId].size})`);
  broadcastClientCount(docId);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp }));
        return;
      }
    } catch (e) {
      // Ignore parse error
    }

    // Broadcast to others in the room
    for (const client of rooms[docId]) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message.toString());
      }
    }
  });

  ws.on('close', () => {
    rooms[docId].delete(ws);
    console.log(`[OT Server] Client left ${docId} (Total: ${rooms[docId].size})`);
    broadcastClientCount(docId);
  });
});

const server = app.listen(HTTP_PORT, () => {
  console.log(`[HTTP/OT] Server running on port ${HTTP_PORT}`);
});

server.on('upgrade', (request, socket, head) => {
  if (request.url?.startsWith('/ot')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// --- LIBP2P RELAY NODE (Layer 2 - Web3 Mode) ---
async function startP2PNode() {
  const node = await createLibp2p({
    addresses: {
      listen: [
        `/ip4/0.0.0.0/tcp/${P2P_PORT}/ws`
      ]
    },
    transports: [
      webSockets()
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      relay: circuitRelayServer()
    }
  });

  console.log('[P2P Relay] Node started with id:', node.peerId.toString());
  node.getMultiaddrs().forEach((ma) => {
    console.log('[P2P Relay] Listening on:', ma.toString());
  });
}

startP2PNode().catch(console.error);
