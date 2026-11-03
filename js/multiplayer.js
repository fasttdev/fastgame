'use strict';

/* =========================================================
   FastGames — multiplayer.js
   WebSocket client untuk room multiplayer.
   Server: server.js (Node.js, ws).
   ========================================================= */

(function () {

  let ws = null;
  let isConnecting = false;
  let pendingAction = null;   // { type: 'create' } atau { type: 'join', code }

  function ui() { return window.ChessUI; }

  function serverUrl() {
    if (location.protocol === 'file:') return null;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/ws';
  }

  function reportError(msg) {
    const u = ui();
    if (u && u.onError) u.onError(msg);
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return true;
    }
    if (isConnecting) return false;

    const url = serverUrl();
    if (!url) {
      reportError('Multiplayer butuh server. Jalankan "node server.js" dan buka lewat http://IP:8080/chess.html');
      return false;
    }

    isConnecting = true;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      isConnecting = false;
      reportError('Gagal membuat koneksi WebSocket.');
      return false;
    }

    ws.addEventListener('open', function () {
      isConnecting = false;
      if (pendingAction) {
        sendRaw(pendingAction);
        pendingAction = null;
      }
    });

    ws.addEventListener('message', function (ev) {
      handleMessage(ev.data);
    });

    ws.addEventListener('close', function () {
      isConnecting = false;
      const u = ui();
      if (u && u.onDisconnect) u.onDisconnect();
    });

    ws.addEventListener('error', function () {
      isConnecting = false;
      reportError('Koneksi ke server gagal. Pastikan server.js berjalan.');
    });

    return true;
  }

  function sendRaw(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try { ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function handleMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    const u = ui();
    if (!u) return;

    switch (msg.type) {
      case 'created':
        if (u.onRoomCreated) u.onRoomCreated(msg.code);
        break;
      case 'joined':
        if (u.onRoomJoined) u.onRoomJoined(msg.code);
        break;
      case 'opponent-joined':
        if (u.onOpponentJoined) u.onOpponentJoined();
        break;
      case 'opponent-left':
        if (u.onOpponentLeft) u.onOpponentLeft();
        break;
      case 'move':
        if (u.onRemoteMove) u.onRemoteMove(msg.move);
        break;
      case 'error':
        if (u.onError) u.onError(msg.message || 'Terjadi kesalahan pada server.');
        break;
    }
  }

  function createRoom() {
    if (!connect()) {
      // Kalau connect() return false karena masih connecting, antrikan
      if (isConnecting) {
        pendingAction = { type: 'create' };
      }
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      sendRaw({ type: 'create' });
    } else {
      pendingAction = { type: 'create' };
    }
  }

  function joinRoom(code) {
    const action = { type: 'join', code: code };
    if (!connect()) {
      if (isConnecting) pendingAction = action;
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      sendRaw(action);
    } else {
      pendingAction = action;
    }
  }

  function sendMove(move) {
    sendRaw({ type: 'move', move: move });
  }

  function disconnect() {
    pendingAction = null;
    if (ws) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'leave' }));
        }
        ws.close();
      } catch (e) {}
      ws = null;
    }
    isConnecting = false;
  }

  window.FastMultiplayer = {
    createRoom: createRoom,
    joinRoom: joinRoom,
    sendMove: sendMove,
    disconnect: disconnect
  };

})();