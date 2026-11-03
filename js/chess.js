'use strict';

/* =========================================================
   FastGames — chess.js
   Chess engine + UI layer + mode coordination.
   Mode: 'local' | 'ai' | 'multi'
   ========================================================= */

(function () {

  // ---------- Konstanta ----------
  const WHITE = 'w';
  const BLACK = 'b';

  const PIECE_SYMBOL = {
    'w-p': '\u2659', 'w-n': '\u2658', 'w-b': '\u2657', 'w-r': '\u2656', 'w-q': '\u2655', 'w-k': '\u2654',
    'b-p': '\u265F', 'b-n': '\u265E', 'b-b': '\u265D', 'b-r': '\u265C', 'b-q': '\u265B', 'b-k': '\u265A'
  };

  const PIECE_NAMES = {
    p: 'Pion', n: 'Kuda', b: 'Uskup', r: 'Benteng', q: 'Ratu', k: 'Raja'
  };

  const START_BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  // ---------- Util ----------
  function cloneBoard(board) {
    const out = [];
    for (let r = 0; r < 8; r++) {
      const row = board[r];
      const nr = [];
      for (let c = 0; c < 8; c++) {
        const p = row[c];
        nr.push(p ? { type: p.type, color: p.color } : null);
      }
      out.push(nr);
    }
    return out;
  }

  function opposite(color) { return color === WHITE ? BLACK : WHITE; }
  function colorName(color) { return color === WHITE ? 'Putih' : 'Hitam'; }
  function squareName(r, c) { return FILES[c] + (8 - r); }
  function isInside(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

  // =========================================================
  // ChessGame
  // =========================================================
  function ChessGame() { this.reset(); }

  ChessGame.prototype.reset = function () {
    const board = [];
    for (let r = 0; r < 8; r++) {
      board.push([null, null, null, null, null, null, null, null]);
    }
    for (let c = 0; c < 8; c++) {
      board[0][c] = { type: START_BACK[c], color: BLACK };
      board[1][c] = { type: 'p', color: BLACK };
      board[6][c] = { type: 'p', color: WHITE };
      board[7][c] = { type: START_BACK[c], color: WHITE };
    }
    this.board = board;
    this.turn = WHITE;
    this.castling = { wK: true, wQ: true, bK: true, bQ: true };
    this.enPassant = null;
    this.halfmove = 0;
    this.history = [];
    this.snapshots = [];
    this.selected = null;
    this.legalMoves = [];
    this.lastMove = null;
    this.gameOver = false;
    this.result = null;
    this.flipped = false;
    this.captured = { w: [], b: [] };
    this.pendingPromotion = null;
    this.inCheck = false;
  };

  ChessGame.prototype.get = function (r, c) {
    if (!isInside(r, c)) return null;
    return this.board[r][c];
  };

  ChessGame.prototype.set = function (r, c, piece) {
    if (!isInside(r, c)) return;
    this.board[r][c] = piece;
  };

  ChessGame.prototype.snapshot = function () {
    return {
      board: cloneBoard(this.board),
      turn: this.turn,
      castling: Object.assign({}, this.castling),
      enPassant: this.enPassant ? { r: this.enPassant.r, c: this.enPassant.c } : null,
      halfmove: this.halfmove,
      lastMove: this.lastMove ? {
        from: { r: this.lastMove.from.r, c: this.lastMove.from.c },
        to: { r: this.lastMove.to.r, c: this.lastMove.to.c }
      } : null,
      captured: { w: this.captured.w.slice(), b: this.captured.b.slice() },
      inCheck: this.inCheck
    };
  };

  ChessGame.prototype.restore = function (s) {
    this.board = cloneBoard(s.board);
    this.turn = s.turn;
    this.castling = Object.assign({}, s.castling);
    this.enPassant = s.enPassant ? { r: s.enPassant.r, c: s.enPassant.c } : null;
    this.halfmove = s.halfmove;
    this.lastMove = s.lastMove ? {
      from: { r: s.lastMove.from.r, c: s.lastMove.from.c },
      to: { r: s.lastMove.to.r, c: s.lastMove.to.c }
    } : null;
    this.captured = { w: s.captured.w.slice(), b: s.captured.b.slice() };
    this.inCheck = s.inCheck;
    this.gameOver = false;
    this.result = null;
    this.pendingPromotion = null;
    this.selected = null;
    this.legalMoves = [];
  };

  // ---------- Move gen ----------
  ChessGame.prototype.pieceMoves = function (r, c) {
    const p = this.get(r, c);
    if (!p) return [];
    switch (p.type) {
      case 'p': return this.pawnMoves(r, c, p.color);
      case 'n': return this.knightMoves(r, c, p.color);
      case 'b': return this.slide(r, c, p.color, [[-1, -1], [-1, 1], [1, -1], [1, 1]]);
      case 'r': return this.slide(r, c, p.color, [[-1, 0], [1, 0], [0, -1], [0, 1]]);
      case 'q': return this.slide(r, c, p.color, [
        [-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]
      ]);
      case 'k': return this.kingMoves(r, c, p.color);
    }
    return [];
  };

  ChessGame.prototype.pawnMoves = function (r, c, color) {
    const moves = [];
    const dir = color === WHITE ? -1 : 1;
    const startRow = color === WHITE ? 6 : 1;
    const promoRow = color === WHITE ? 0 : 7;

    const oneR = r + dir;
    if (isInside(oneR, c) && !this.get(oneR, c)) {
      this.pushPawnMove(moves, r, c, oneR, c, promoRow, null, color);
      const twoR = r + dir * 2;
      if (r === startRow && !this.get(twoR, c)) {
        moves.push({
          from: { r: r, c: c }, to: { r: twoR, c: c },
          piece: 'p', color: color, captured: null,
          special: 'double-pawn', promotion: null
        });
      }
    }

    const caps = [[dir, -1], [dir, 1]];
    for (let i = 0; i < 2; i++) {
      const nr = r + caps[i][0];
      const nc = c + caps[i][1];
      if (!isInside(nr, nc)) continue;
      const t = this.get(nr, nc);
      if (t && t.color !== color) {
        this.pushPawnMove(moves, r, c, nr, nc, promoRow, t, color);
      } else if (!t && this.enPassant && this.enPassant.r === nr && this.enPassant.c === nc) {
        moves.push({
          from: { r: r, c: c }, to: { r: nr, c: nc },
          piece: 'p', color: color, captured: { type: 'p', color: opposite(color) },
          special: 'en-passant', promotion: null
        });
      }
    }
    return moves;
  };

  ChessGame.prototype.pushPawnMove = function (moves, r, c, nr, nc, promoRow, captured, color) {
    if (nr === promoRow) {
      const promos = ['q', 'r', 'b', 'n'];
      for (let i = 0; i < 4; i++) {
        moves.push({
          from: { r: r, c: c }, to: { r: nr, c: nc },
          piece: 'p', color: color, captured: captured,
          special: 'promotion', promotion: promos[i]
        });
      }
    } else {
      moves.push({
        from: { r: r, c: c }, to: { r: nr, c: nc },
        piece: 'p', color: color, captured: captured,
        special: null, promotion: null
      });
    }
  };

  ChessGame.prototype.knightMoves = function (r, c, color) {
    const moves = [];
    const offs = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    for (let i = 0; i < offs.length; i++) {
      const nr = r + offs[i][0];
      const nc = c + offs[i][1];
      if (!isInside(nr, nc)) continue;
      const t = this.get(nr, nc);
      if (t && t.color === color) continue;
      moves.push({
        from: { r: r, c: c }, to: { r: nr, c: nc },
        piece: 'n', color: color, captured: t,
        special: null, promotion: null
      });
    }
    return moves;
  };

  ChessGame.prototype.slide = function (r, c, color, dirs) {
    const moves = [];
    const pieceType = this.get(r, c).type;
    for (let i = 0; i < dirs.length; i++) {
      let nr = r + dirs[i][0];
      let nc = c + dirs[i][1];
      while (isInside(nr, nc)) {
        const t = this.get(nr, nc);
        if (!t) {
          moves.push({
            from: { r: r, c: c }, to: { r: nr, c: nc },
            piece: pieceType, color: color, captured: null,
            special: null, promotion: null
          });
        } else {
          if (t.color !== color) {
            moves.push({
              from: { r: r, c: c }, to: { r: nr, c: nc },
              piece: pieceType, color: color, captured: t,
              special: null, promotion: null
            });
          }
          break;
        }
        nr += dirs[i][0];
        nc += dirs[i][1];
      }
    }
    return moves;
  };

  ChessGame.prototype.kingMoves = function (r, c, color) {
    const moves = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (!isInside(nr, nc)) continue;
        const t = this.get(nr, nc);
        if (t && t.color === color) continue;
        moves.push({
          from: { r: r, c: c }, to: { r: nr, c: nc },
          piece: 'k', color: color, captured: t,
          special: null, promotion: null
        });
      }
    }

    const home = color === WHITE ? 7 : 0;
    if (r === home && c === 4 && !this.inCheckFor(color)) {
      const kRight = color === WHITE ? this.castling.wK : this.castling.bK;
      if (kRight &&
          !this.get(home, 5) && !this.get(home, 6) &&
          this.get(home, 7) && this.get(home, 7).type === 'r' && this.get(home, 7).color === color &&
          !this.squareAttacked(home, 5, opposite(color)) &&
          !this.squareAttacked(home, 6, opposite(color))) {
        moves.push({
          from: { r: r, c: c }, to: { r: home, c: 6 },
          piece: 'k', color: color, captured: null,
          special: 'castle-k', promotion: null
        });
      }
      const qRight = color === WHITE ? this.castling.wQ : this.castling.bQ;
      if (qRight &&
          !this.get(home, 3) && !this.get(home, 2) && !this.get(home, 1) &&
          this.get(home, 0) && this.get(home, 0).type === 'r' && this.get(home, 0).color === color &&
          !this.squareAttacked(home, 3, opposite(color)) &&
          !this.squareAttacked(home, 2, opposite(color))) {
        moves.push({
          from: { r: r, c: c }, to: { r: home, c: 2 },
          piece: 'k', color: color, captured: null,
          special: 'castle-q', promotion: null
        });
      }
    }
    return moves;
  };

  // ---------- Attack detection ----------
  ChessGame.prototype.squareAttacked = function (r, c, byColor) {
    const pdir = byColor === WHITE ? 1 : -1;
    for (let dc = -1; dc <= 1; dc += 2) {
      const pr = r + pdir;
      const pc = c + dc;
      if (!isInside(pr, pc)) continue;
      const p = this.get(pr, pc);
      if (p && p.type === 'p' && p.color === byColor) return true;
    }

    const kOffs = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    for (let i = 0; i < kOffs.length; i++) {
      const nr = r + kOffs[i][0];
      const nc = c + kOffs[i][1];
      if (!isInside(nr, nc)) continue;
      const p = this.get(nr, nc);
      if (p && p.type === 'n' && p.color === byColor) return true;
    }

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (!isInside(nr, nc)) continue;
        const p = this.get(nr, nc);
        if (p && p.type === 'k' && p.color === byColor) return true;
      }
    }

    const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (let i = 0; i < 4; i++) {
      let nr = r + diagDirs[i][0];
      let nc = c + diagDirs[i][1];
      while (isInside(nr, nc)) {
        const p = this.get(nr, nc);
        if (p) {
          if (p.color === byColor && (p.type === 'b' || p.type === 'q')) return true;
          break;
        }
        nr += diagDirs[i][0];
        nc += diagDirs[i][1];
      }
    }

    const strDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let i = 0; i < 4; i++) {
      let nr = r + strDirs[i][0];
      let nc = c + strDirs[i][1];
      while (isInside(nr, nc)) {
        const p = this.get(nr, nc);
        if (p) {
          if (p.color === byColor && (p.type === 'r' || p.type === 'q')) return true;
          break;
        }
        nr += strDirs[i][0];
        nc += strDirs[i][1];
      }
    }
    return false;
  };

  ChessGame.prototype.findKing = function (color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.get(r, c);
        if (p && p.type === 'k' && p.color === color) return { r: r, c: c };
      }
    }
    return null;
  };

  ChessGame.prototype.inCheckFor = function (color) {
    const k = this.findKing(color);
    if (!k) return false;
    return this.squareAttacked(k.r, k.c, opposite(color));
  };

  // ---------- Legal ----------
  ChessGame.prototype.legalMovesFrom = function (r, c) {
    const p = this.get(r, c);
    if (!p || p.color !== this.turn) return [];
    const pseudo = this.pieceMoves(r, c);
    const legal = [];
    for (let i = 0; i < pseudo.length; i++) {
      if (!this.wouldLeaveInCheck(pseudo[i], p.color)) legal.push(pseudo[i]);
    }
    return legal;
  };

  ChessGame.prototype.wouldLeaveInCheck = function (move, color) {
    const saved = cloneBoard(this.board);
    this.applyOnBoard(move);
    const bad = this.inCheckFor(color);
    this.board = saved;
    return bad;
  };

  ChessGame.prototype.applyOnBoard = function (move) {
    const piece = this.get(move.from.r, move.from.c);
    if (!piece) return;
    this.set(move.to.r, move.to.c, { type: move.promotion || piece.type, color: piece.color });
    this.set(move.from.r, move.from.c, null);
    if (move.special === 'castle-k') {
      const row = move.from.r;
      const rook = this.get(row, 7);
      this.set(row, 7, null);
      this.set(row, 5, rook);
    } else if (move.special === 'castle-q') {
      const row = move.from.r;
      const rook = this.get(row, 0);
      this.set(row, 0, null);
      this.set(row, 3, rook);
    } else if (move.special === 'en-passant') {
      const capRow = move.to.r - (piece.color === WHITE ? -1 : 1);
      this.set(capRow, move.to.c, null);
    }
  };

  ChessGame.prototype.allLegalMovesFor = function (color) {
    const all = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.get(r, c);
        if (!p || p.color !== color) continue;
        const pseudo = this.pieceMoves(r, c);
        for (let i = 0; i < pseudo.length; i++) {
          if (!this.wouldLeaveInCheck(pseudo[i], color)) all.push(pseudo[i]);
        }
      }
    }
    return all;
  };

  // ---------- Exec ----------
  ChessGame.prototype.findMove = function (from, to, promo) {
    const candidates = this.legalMovesFrom(from.r, from.c);
    for (let i = 0; i < candidates.length; i++) {
      const m = candidates[i];
      if (m.to.r !== to.r || m.to.c !== to.c) continue;
      if (m.special === 'promotion') {
        if (promo && m.promotion === promo) return m;
      } else {
        return m;
      }
    }
    return null;
  };

  ChessGame.prototype.makeMove = function (move, san) {
    this.snapshots.push(this.snapshot());
    const piece = this.get(move.from.r, move.from.c);
    if (!piece) return false;

    if (move.captured) this.captured[move.captured.color].push(move.captured.type);

    this.applyOnBoard(move);
    this.updateCastling(move, piece);

    this.enPassant = null;
    if (move.special === 'double-pawn') {
      this.enPassant = { r: (move.from.r + move.to.r) / 2, c: move.to.c };
    }

    this.halfmove = (piece.type === 'p' || move.captured) ? 0 : this.halfmove + 1;

    this.lastMove = {
      from: { r: move.from.r, c: move.from.c },
      to: { r: move.to.r, c: move.to.c }
    };

    this.history.push({ san: san || this.toSan(move), turn: this.turn });
    this.turn = opposite(this.turn);
    this.inCheck = this.inCheckFor(this.turn);
    this.checkGameEnd();
    return true;
  };

  ChessGame.prototype.updateCastling = function (move, piece) {
    if (piece.type === 'k') {
      if (piece.color === WHITE) { this.castling.wK = false; this.castling.wQ = false; }
      else { this.castling.bK = false; this.castling.bQ = false; }
    }
    if (piece.type === 'r') {
      if (piece.color === WHITE) {
        if (move.from.r === 7 && move.from.c === 0) this.castling.wQ = false;
        if (move.from.r === 7 && move.from.c === 7) this.castling.wK = false;
      } else {
        if (move.from.r === 0 && move.from.c === 0) this.castling.bQ = false;
        if (move.from.r === 0 && move.from.c === 7) this.castling.bK = false;
      }
    }
    if (move.to.r === 0 && move.to.c === 0) this.castling.bQ = false;
    if (move.to.r === 0 && move.to.c === 7) this.castling.bK = false;
    if (move.to.r === 7 && move.to.c === 0) this.castling.wQ = false;
    if (move.to.r === 7 && move.to.c === 7) this.castling.wK = false;
  };

  ChessGame.prototype.checkGameEnd = function () {
    const moves = this.allLegalMovesFor(this.turn);
    if (moves.length === 0) {
      this.gameOver = true;
      if (this.inCheck) {
        this.result = {
          type: 'checkmate',
          message: 'Skakmat! ' + colorName(opposite(this.turn)) + ' menang.'
        };
      } else {
        this.result = { type: 'stalemate', message: 'Stalemate. Permainan seri.' };
      }
      return;
    }
    if (this.halfmove >= 100) {
      this.gameOver = true;
      this.result = { type: 'fifty-move', message: 'Aturan 50 langkah. Seri.' };
      return;
    }
    if (this.isInsufficient()) {
      this.gameOver = true;
      this.result = { type: 'insufficient', message: 'Materi tidak cukup. Seri.' };
    }
  };

  ChessGame.prototype.isInsufficient = function () {
    let total = 0;
    const nonKing = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.get(r, c);
        if (!p) continue;
        total++;
        if (p.type !== 'k') nonKing.push(p);
      }
    }
    if (total > 4) return false;
    if (nonKing.length === 0) return true;
    if (nonKing.length === 1 && (nonKing[0].type === 'b' || nonKing[0].type === 'n')) return true;
    if (nonKing.length === 2 && nonKing[0].type === 'b' && nonKing[1].type === 'b') return true;
    return false;
  };

  // ---------- SAN ----------
  ChessGame.prototype.toSan = function (move) {
    if (move.special === 'castle-k') return this.suffix('O-O', move);
    if (move.special === 'castle-q') return this.suffix('O-O-O', move);

    const piece = this.get(move.from.r, move.from.c);
    let san = '';

    if (piece.type === 'p') {
      if (move.captured || move.special === 'en-passant') san += FILES[move.from.c] + 'x';
      san += squareName(move.to.r, move.to.c);
      if (move.promotion) san += '=' + move.promotion.toUpperCase();
    } else {
      san += piece.type.toUpperCase();
      san += this.disambig(move, piece);
      if (move.captured) san += 'x';
      san += squareName(move.to.r, move.to.c);
    }
    return this.suffix(san, move);
  };

  ChessGame.prototype.disambig = function (move, piece) {
    const others = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (r === move.from.r && c === move.from.c) continue;
        const p = this.get(r, c);
        if (!p || p.type !== piece.type || p.color !== piece.color) continue;
        const cands = this.pieceMoves(r, c);
        for (let i = 0; i < cands.length; i++) {
          if (cands[i].to.r === move.to.r && cands[i].to.c === move.to.c) {
            others.push({ r: r, c: c });
            break;
          }
        }
      }
    }
    if (others.length === 0) return '';
    const sameFile = others.some(function (o) { return o.c === move.from.c; });
    const sameRank = others.some(function (o) { return o.r === move.from.r; });
    if (!sameFile) return FILES[move.from.c];
    if (!sameRank) return String(8 - move.from.r);
    return squareName(move.from.r, move.from.c);
  };

  ChessGame.prototype.suffix = function (san, move) {
    const savedBoard = cloneBoard(this.board);
    const savedCast = Object.assign({}, this.castling);
    const savedEp = this.enPassant;
    const savedTurn = this.turn;

    this.applyOnBoard(move);
    this.turn = opposite(this.turn);
    const check = this.inCheckFor(this.turn);
    const hasReply = this.allLegalMovesFor(this.turn).length > 0;

    this.board = savedBoard;
    this.castling = savedCast;
    this.enPassant = savedEp;
    this.turn = savedTurn;

    if (check && !hasReply) return san + '#';
    if (check) return san + '+';
    return san;
  };

  ChessGame.prototype.undo = function () {
    if (this.snapshots.length === 0) return false;
    this.restore(this.snapshots.pop());
    this.history.pop();
    return true;
  };

  // ---------- Light make / unmake untuk AI ----------
  ChessGame.prototype.lightMake = function (move) {
    const info = {
      board: cloneBoard(this.board),
      turn: this.turn,
      castling: Object.assign({}, this.castling),
      enPassant: this.enPassant ? { r: this.enPassant.r, c: this.enPassant.c } : null
    };
    const piece = this.get(move.from.r, move.from.c);
    this.applyOnBoard(move);
    this.updateCastling(move, piece);
    this.enPassant = null;
    if (move.special === 'double-pawn') {
      this.enPassant = { r: (move.from.r + move.to.r) / 2, c: move.to.c };
    }
    this.turn = opposite(this.turn);
    return info;
  };

  ChessGame.prototype.lightUnmake = function (info) {
    this.board = info.board;
    this.turn = info.turn;
    this.castling = info.castling;
    this.enPassant = info.enPassant;
  };

  // ---------- Expose engine ----------
  window.ChessEngine = {
    WHITE: WHITE,
    BLACK: BLACK,
    ChessGame: ChessGame,
    opposite: opposite,
    colorName: colorName,
    squareName: squareName,
    PIECE_SYMBOL: PIECE_SYMBOL
  };

  // =========================================================
  // UI State
  // =========================================================
  const state = {
    mode: null,                // 'local' | 'ai' | 'multi' | null
    game: null,
    squares: [],
    built: false,
    rafId: 0,
    aiThinking: false,
    humanColor: WHITE,         // untuk mode AI
    aiColor: BLACK,
    multi: {
      connected: false,
      opponentConnected: false,
      isHost: false,
      myColor: WHITE,
      roomCode: null
    },
    refs: {}
  };

  function cacheRefs() {
    const r = state.refs;
    r.modeScreen = document.getElementById('modeScreen');
    r.multiScreen = document.getElementById('multiScreen');
    r.gameLayout = document.getElementById('gameLayout');
    r.board = document.getElementById('board');
    r.turnValue = document.getElementById('turnValue');
    r.turnDot = document.getElementById('turnDot');
    r.statusLine = document.getElementById('statusLine');
    r.historyList = document.getElementById('historyList');
    r.capturedWhite = document.getElementById('capturedByWhite');
    r.capturedBlack = document.getElementById('capturedByBlack');
    r.btnNewGame = document.getElementById('btnNewGame');
    r.btnUndo = document.getElementById('btnUndo');
    r.btnFlip = document.getElementById('btnFlip');
    r.btnMenu = document.getElementById('btnMenu');
    r.btnBackMode = document.getElementById('btnBackMode');
    r.promoOverlay = document.getElementById('promotionOverlay');
    r.promoOptions = document.getElementById('promotionOptions');
    r.multiStatus = document.getElementById('multiStatus');
    r.btnCreateRoom = document.getElementById('btnCreateRoom');
    r.btnJoinRoom = document.getElementById('btnJoinRoom');
    r.roomCodeInput = document.getElementById('roomCodeInput');
    r.roomBox = document.getElementById('roomBox');
    r.roomCodeDisplay = document.getElementById('roomCodeDisplay');
    r.infoMode = document.getElementById('infoMode');
    r.infoColor = document.getElementById('infoColor');
    r.infoColorRow = document.getElementById('infoColorRow');
    r.stageSub = document.getElementById('stageSub');
  }

  // ---------- Board build ----------
  function buildBoard() {
    const board = state.refs.board;
    if (!board) return;
    board.innerHTML = '';
    const squares = state.squares;
    squares.length = 0;
    for (let r = 0; r < 8; r++) {
      const row = [];
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('div');
        sq.className = 'square';
        sq.dataset.r = r;
        sq.dataset.c = c;
        sq.setAttribute('role', 'gridcell');
        sq.addEventListener('click', (function (rr, cc) {
          return function () { handleClick(rr, cc); };
        })(r, c));
        board.appendChild(sq);
        row.push(sq);
      }
      squares.push(row);
    }
    state.built = true;
  }

  function reorderForFlip() {
    const board = state.refs.board;
    if (!board) return;
    const flipped = state.game.flipped;
    for (let i = 0; i < 8; i++) {
      const r = flipped ? 7 - i : i;
      for (let j = 0; j < 8; j++) {
        const c = flipped ? 7 - j : j;
        board.appendChild(state.squares[r][c]);
      }
    }
  }

  // ---------- Paint ----------
  function paintBoard() {
    const g = state.game;
    const squares = state.squares;
    const sel = g.selected;
    const lastMove = g.lastMove;
    const inCheck = g.inCheck;
    const kingPos = inCheck ? g.findKing(g.turn) : null;

    const legalSet = new Set();
    for (let i = 0; i < g.legalMoves.length; i++) {
      const m = g.legalMoves[i];
      legalSet.add(m.to.r * 8 + m.to.c);
    }

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = squares[r][c];
        const base = ((r + c) & 1) === 0 ? 'square light' : 'square dark';
        let cls = base;

        if (lastMove) {
          if ((lastMove.from.r === r && lastMove.from.c === c) ||
              (lastMove.to.r === r && lastMove.to.c === c)) {
            cls += ' last-move';
          }
        }
        if (sel && sel.r === r && sel.c === c) cls += ' selected';
        if (kingPos && kingPos.r === r && kingPos.c === c) cls += ' check';

        if (legalSet.has(r * 8 + c)) {
          cls += g.get(r, c) ? ' capture-move' : ' legal-move';
        }

        if (sq.className !== cls) sq.className = cls;

        const piece = g.board[r][c];
        const first = sq.firstElementChild;
        if (piece) {
          const sym = PIECE_SYMBOL[piece.color + '-' + piece.type];
          if (!first) {
            const el = document.createElement('span');
            el.className = 'piece';
            el.textContent = sym;
            sq.appendChild(el);
          } else if (first.textContent !== sym) {
            first.textContent = sym;
          }
        } else if (first) {
          sq.removeChild(first);
        }
      }
    }
  }

  function paintSidebar() {
    const g = state.game;
    const r = state.refs;

    if (r.turnValue) r.turnValue.textContent = colorName(g.turn);
    if (r.turnDot) {
      if (g.turn === BLACK) r.turnDot.classList.add('black');
      else r.turnDot.classList.remove('black');
    }

    if (r.statusLine) {
      let cls = 'status-line';
      let text;
      if (state.aiThinking) {
        text = 'Komputer sedang berpikir...';
        cls += ' alert';
      } else if (g.gameOver && g.result) {
        text = g.result.message;
        cls += g.result.type === 'checkmate' ? ' success' : ' danger';
      } else if (g.inCheck) {
        text = 'Skak! ' + colorName(g.turn) + ' harus menyelamatkan raja.';
        cls += ' alert';
      } else if (state.mode === 'multi' && !state.multi.opponentConnected) {
        text = 'Menunggu lawan...';
        cls += ' alert';
      } else if (state.mode === 'multi' && g.turn === state.multi.myColor) {
        text = 'Giliran Anda.';
      } else if (state.mode === 'multi') {
        text = 'Menunggu langkah lawan...';
      } else {
        text = 'Pilih bidak untuk memulai langkah ' + colorName(g.turn) + '.';
      }
      if (r.statusLine.className !== cls) r.statusLine.className = cls;
      if (r.statusLine.textContent !== text) r.statusLine.textContent = text;
    }

    paintCaptured();
    paintHistory();
  }

  function paintCaptured() {
    const g = state.game;
    const r = state.refs;
    if (r.capturedWhite) {
      let html = '';
      for (let i = 0; i < g.captured.b.length; i++) {
        html += '<span class="cap-piece">' + PIECE_SYMBOL['b-' + g.captured.b[i]] + '</span>';
      }
      if (r.capturedWhite.innerHTML !== html) r.capturedWhite.innerHTML = html;
    }
    if (r.capturedBlack) {
      let html = '';
      for (let i = 0; i < g.captured.w.length; i++) {
        html += '<span class="cap-piece">' + PIECE_SYMBOL['w-' + g.captured.w[i]] + '</span>';
      }
      if (r.capturedBlack.innerHTML !== html) r.capturedBlack.innerHTML = html;
    }
  }

  function paintHistory() {
    const g = state.game;
    const el = state.refs.historyList;
    if (!el) return;

    if (g.history.length === 0) {
      if (el.dataset.empty !== '1') {
        el.innerHTML = '<div class="history-empty">Belum ada langkah.</div>';
        el.dataset.empty = '1';
      }
      return;
    }
    el.dataset.empty = '0';

    let html = '';
    for (let i = 0; i < g.history.length; i += 2) {
      const num = (i / 2) + 1;
      const w = g.history[i] ? g.history[i].san : '';
      const b = g.history[i + 1] ? g.history[i + 1].san : '';
      html += '<div class="hist-num">' + num + '.</div>';
      html += '<div class="hist-move">' + w + '</div>';
      html += '<div class="hist-move">' + (b || '—') + '</div>';
    }
    if (el.innerHTML !== html) {
      el.innerHTML = html;
      el.scrollTop = el.scrollHeight;
    }
  }

  function paintInfo() {
    const r = state.refs;
    if (r.infoMode) {
      let label = '-';
      if (state.mode === 'local') label = 'Lokal';
      else if (state.mode === 'ai') label = 'Vs Komputer';
      else if (state.mode === 'multi') label = 'Multiplayer';
      r.infoMode.textContent = label;
    }
    if (r.infoColor && r.infoColorRow) {
      if (state.mode === 'ai') {
        r.infoColorRow.hidden = false;
        r.infoColor.textContent = colorName(state.humanColor);
      } else if (state.mode === 'multi') {
        r.infoColorRow.hidden = false;
        r.infoColor.textContent = colorName(state.multi.myColor);
      } else {
        r.infoColorRow.hidden = true;
      }
    }
    if (r.stageSub) {
      if (state.mode === 'local') r.stageSub.textContent = 'Dua pemain, satu perangkat.';
      else if (state.mode === 'ai') r.stageSub.textContent = 'Anda melawan komputer.';
      else if (state.mode === 'multi') r.stageSub.textContent = 'Room: ' + (state.multi.roomCode || '-');
    }
  }

  function schedulePaint() {
    if (state.rafId) return;
    state.rafId = requestAnimationFrame(function () {
      state.rafId = 0;
      paintBoard();
      paintSidebar();
    });
  }

  function paintAll() {
    paintBoard();
    paintSidebar();
    paintInfo();
  }

  // ---------- Mode control ----------
  function setMode(mode) {
    state.mode = mode;
    const r = state.refs;
    r.modeScreen.hidden = true;
    r.multiScreen.hidden = true;
    r.gameLayout.hidden = false;

    if (mode === 'local') {
      state.game = new ChessEngine.ChessGame();
      state.game.flipped = false;
      reorderForFlip();
      paintAll();
    } else if (mode === 'ai') {
      state.game = new ChessEngine.ChessGame();
      state.game.flipped = false;
      state.humanColor = WHITE;
      state.aiColor = BLACK;
      state.aiThinking = false;
      reorderForFlip();
      paintAll();
    } else if (mode === 'multi') {
      // game akan dibuat setelah kedua pemain terhubung
      paintAll();
    }
  }

  function backToMenu() {
    const r = state.refs;
    r.modeScreen.hidden = false;
    r.multiScreen.hidden = true;
    r.gameLayout.hidden = true;

    // Reset state
    state.mode = null;
    state.game = null;
    state.aiThinking = false;

    // Tutup multiplayer
    if (window.FastMultiplayer) {
      window.FastMultiplayer.disconnect();
    }
    state.multi = {
      connected: false,
      opponentConnected: false,
      isHost: false,
      myColor: WHITE,
      roomCode: null
    };
    setMultiStatus('');
    if (r.roomBox) r.roomBox.h