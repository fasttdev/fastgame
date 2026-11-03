'use strict';

/* =========================================================
   FastGames — server.js
   Static file server + WebSocket room server untuk multiplayer.
   Jalankan: node server.js
   Akses dari perangkat lain di jaringan yang sama: http://<IP-lokal>:8080
   ========================================================= */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

// ---------------- HTTP ----------------
const httpServer = http.createServer(function (req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';

  // Cegah path traversal
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

// ---------------- WebSocket ----------------
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// rooms: code -> { host, guest }
const rooms = new Map();
// ws -> { roomCode, role }
const wsMeta = new WeakMap();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode() {
  let code;
  let attempts = 0;
  do {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    attempts++;
  } while (rooms.has(code) && attempts < 100);
  return code;
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(msg)); } catch (e) {}
  }
}

function broadcastToRoom(code, msg, exceptWs) {
  const room = rooms.get(code);
  if (!room) return;
  if (room.host && room.host !== exceptWs) send(room.host, msg);
  if (room.guest && room.guest !== exceptWs) send(room.guest, msg);
}

function cleanupClient(ws) {
  const meta = wsMeta.get(ws);
  if (!meta) return;
  const code = meta.roomCode;
  wsMeta.delete(ws);

  const room = rooms.get(code);
  if (!room) return;

  if (meta.role === 'host') {
    if (room.guest) {
      send(room.guest, { type: 'opponent-left' });
      wsMeta.delete(room.guest);
    }
    rooms.delete(code);
    console.log('[room] ' + code + ' closed (host left)');
  } else if (meta.role === 'guest') {
    room.guest = null;
    if (room.host) {
      send(room.host, { type: 'opponent-left' });
    }
    console.log('[room] ' + code + ' guest left');
  }
}

wss.on('connection', function (ws) {
  ws.on('message', function (raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return send(ws, { type: 'error', message: 'Format pesan tidak valid' });
    }

    if (msg.type === 'create') {
      if (wsMeta.has(ws)) {
        return send(ws, { type: 'error', message: 'Sudah di dalam room' });
      }
      const code = generateCode();
      rooms.set(code, { host: ws, guest: null });
      wsMeta.set(ws, { roomCode: code, role: 'host' });
      send(ws, { type: 'created', code: code });
      console.log('[room] ' + code + ' created');
      return;
    }

    if (msg.type === 'join') {
      if (wsMeta.has(ws)) {
        return send(ws, { type: 'error', message: 'Sudah di dalam room' });
      }
      const code = String(msg.code || '').toUpperCase().trim();
      if (!code) {
        return send(ws, { type: 'error', message: 'Kode room kosong' });
      }
      const room = rooms.get(code);
      if (!room) {
        return send(ws, { type: 'error', message: 'Room tidak ditemukan' });
      }
      if (room.guest) {
        return send(ws, { type: 'error', message: 'Room sudah penuh' });
      }
      room.guest = ws;
      wsMeta.set(ws, { roomCode: code, role: 'guest' });
      send(ws, { type: 'joined', code: code });
      send(room.host, { type: 'opponent-joined' });
      console.log('[room] ' + code + ' guest joined');
      return;
    }

    if (msg.type === 'move') {
      const meta = wsMeta.get(ws);
      if (!meta) return;
      const room = rooms.get(meta.roomCode);
      if (!room) return;
      if (meta.role === 'host' && room.guest) {
        send(room.guest, { type: 'move', move: msg.move });
      } else if (meta.role === 'guest' && room.host) {
        send(room.host, { type: 'move', move: msg.move });
      }
      return;
    }

    if (msg.type === 'leave') {
      cleanupClient(ws);
      return;
    }
  });

  ws.on('close', function () {
    cleanupClient(ws);
  });

  ws.on('error', function () {
    cleanupClient(ws);
  });
});

// ---------------- Listen ----------------
httpServer.listen(PORT, '0.0.0.0', function () {
  console.log('');
  console.log('  FastGames server berjalan');
  console.log('  --------------------------------');
  console.log('  http://localhost:' + PORT);
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(function (name) {
    ifaces[name].forEach(function (iface) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log('  http://' + iface.address + ':' + PORT + '   (' + name + ')');
      }
    });
  });
  console.log('');
  console.log('  Bagikan URL IP ke teman di jaringan yang sama.');
  console.log('  Tekan Ctrl+C untuk berhenti.');
  console.log('');
});