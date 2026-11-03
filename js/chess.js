'use strict';

/* =========================================================
   FastGames — chess.js
   Implementasi lengkap permainan catur.
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

  const START_FEN_BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const FILE_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  // ---------- Util ----------
  function cloneBoard(board) {
    return board.map(function (row) {
      return row.map(function (p) {
        return p ? { type: p.type, color: p.color } : null;
      });
    });
  }

  function opposite(color) {
    return color === WHITE ? BLACK : WHITE;
  }

  function colorName(color) {
    return color === WHITE ? 'Putih' : 'Hitam';
  }

  function squareName(r, c) {
    return FILE_LETTERS[c] + (8 - r);
  }

  function isInside(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  // ---------- Kelas Game ----------
  function ChessGame() {
    this.reset();
  }

  ChessGame.prototype.reset = function () {
    this.board = this.buildInitialBoard();
    this.turn = WHITE;
    this.castling = { wK: true, wQ: true, bK: true, bQ: true };
    this.enPassant = null;
    this.halfmove = 0;
    this.fullmove = 1;
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

  ChessGame.prototype.buildInitialBoard = function () {
    const board = [];
    for (let r = 0; r < 8; r++) {
      board.push([null, null, null, null, null, null, null, null]);
    }
    for (let c = 0; c < 8; c++) {
      board[0][c] = { type: START_FEN_BACK[c], color: BLACK };
      board[1][c] = { type: 'p', color: BLACK };
      board[6][c] = { type: 'p', color: WHITE };
      board[7][c] = { type: START_FEN_BACK[c], color: WHITE };
    }
    return board;
  };

  ChessGame.prototype.get = function (r, c) {
    if (!isInside(r, c)) return null;
    return this.board[r][c];
  };

  ChessGame.prototype.set = function (r, c, piece) {
    if (!isInside(r, c)) return;
    this.board[r][c] = piece;
  };

  // ---------- Snapshot ----------
  ChessGame.prototype.snapshot = function () {
    return {
      board: cloneBoard(this.board),
      turn: this.turn,
      castling: Object.assign({}, this.castling),
      enPassant: this.enPassant ? { r: this.enPassant.r, c: this.enPassant.c } : null,
      halfmove: this.halfmove,
      fullmove: this.fullmove,
      lastMove: this.lastMove ? {
        from: { r: this.lastMove.from.r, c: this.lastMove.from.c },
        to: { r: this.lastMove.to.r, c: this.lastMove.to.c }
      } : null,
      captured: {
        w: this.captured.w.slice(),
        b: this.captured.b.slice()
      },
      inCheck: this.inCheck
    };
  };

  ChessGame.prototype.restore = function (snap) {
    this.board = cloneBoard(snap.board);
    this.turn = snap.turn;
    this.castling = Object.assign({}, snap.castling);
    this.enPassant = snap.enPassant ? { r: snap.enPassant.r, c: snap.enPassant.c } : null;
    this.halfmove = snap.halfmove;
    this.fullmove = snap.fullmove;
    this.lastMove = snap.lastMove ? {
      from: { r: snap.lastMove.from.r, c: snap.lastMove.from.c },
      to: { r: snap.lastMove.to.r, c: snap.lastMove.to.c }
    } : null;
    this.captured = {
      w: snap.captured.w.slice(),
      b: snap.captured.b.slice()
    };
    this.inCheck = snap.inCheck;
    this.gameOver = false;
    this.result = null;
    this.pendingPromotion = null;
    this.selected = null;
    this.legalMoves = [];
  };

  // ---------- Move generation ----------
  ChessGame.prototype.pieceMoves = function (r, c) {
    const piece = this.get(r, c);
    if (!piece) return [];
    switch (piece.type) {
      case 'p': return this.pawnMoves(r, c, piece.color);
      case 'n': return this.knightMoves(r, c, piece.color);
      case 'b': return this.slidingMoves(r, c, piece.color, [[-1, -1], [-1, 1], [1, -1], [1, 1]]);
      case 'r': return this.slidingMoves(r, c, piece.color, [[-1, 0], [1, 0], [0, -1], [0, 1]]);
      case 'q': return this.slidingMoves(r, c, piece.color, [
        [-1, -1], [-1, 1], [1, -1], [1, 1],
        [-1, 0], [1, 0], [0, -1], [0, 1]
      ]);
      case 'k': return this.kingMoves(r, c, piece.color);
      default: return [];
    }
  };

  ChessGame.prototype.pawnMoves = function (r, c, color) {
    const moves = [];
    const dir = color === WHITE ? -1 : 1;
    const startRow = color === WHITE ? 6 : 1;
    const promoRow = color === WHITE ? 0 : 7;

    const oneR = r + dir;
    if (isInside(oneR, c) && !this.get(oneR, c)) {
      this.addPawnMove(moves, r, c, oneR, c, promoRow, null);
      const twoR = r + dir * 2;
      if (r === startRow && !this.get(twoR, c)) {
        moves.push({
          from: { r: r, c: c },
          to: { r: twoR, c: c },
          piece: 'p',
          color: color,
          captured: null,
          special: 'double-pawn',
          promotion: null
        });
      }
    }

    const caps = [[dir, -1], [dir, 1]];
    for (let i = 0; i < caps.length; i++) {
      const dR = caps[i][0];
      const dC = caps[i][1];
      const nr = r + dR;
      const nc = c + dC;
      if (!isInside(nr, nc)) continue;
      const target = this.get(nr, nc);
      if (target && target.color !== color) {
        this.addPawnMove(moves, r, c, nr, nc, promoRow, target);
      } else if (!target && this.enPassant && this.enPassant.r === nr && this.enPassant.c === nc) {
        moves.push({
          from: { r: r, c: c },
          to: { r: nr, c: nc },
          piece: 'p',
          color: color,
          captured: { type: 'p', color: opposite(color) },
          special: 'en-passant',
          promotion: null
        });
      }
    }
    return moves;
  };

  ChessGame.prototype.addPawnMove = function (moves, r, c, nr, nc, promoRow, captured) {
    const piece = this.get(r, c);
    if (nr === promoRow) {
      ['q', 'r', 'b', 'n'].forEach(function (p) {
        moves.push({
          from: { r: r, c: c },
          to: { r: nr, c: nc },
          piece: 'p',
          color: piece.color,
          captured: captured,
          special: 'promotion',
          promotion: p
        });
      });
    } else {
      moves.push({
        from: { r: r, c: c },
        to: { r: nr, c: nc },
        piece: 'p',
        color: piece.color,
        captured: captured,
        special: null,
        promotion: null
      });
    }
  };

  ChessGame.prototype.knightMoves = function (r, c, color) {
    const moves = [];
    const offsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    for (let i = 0; i < offsets.length; i++) {
      const nr = r + offsets[i][0];
      const nc = c + offsets[i][1];
      if (!isInside(nr, nc)) continue;
      const target = this.get(nr, nc);
      if (target && target.color === color) continue;
      moves.push({
        from: { r: r, c: c },
        to: { r: nr, c: nc },
        piece: 'n',
        color: color,
        captured: target,
        special: null,
        promotion: null
      });
    }
    return moves;
  };

  ChessGame.prototype.slidingMoves = function (r, c, color, dirs) {
    const moves = [];
    for (let i = 0; i < dirs.length; i++) {
      let nr = r + dirs[i][0];
      let nc = c + dirs[i][1];
      while (isInside(nr, nc)) {
        const target = this.get(nr, nc);
        if (!target) {
          moves.push({
            from: { r: r, c: c },
            to: { r: nr, c: nc },
            piece: this.get(r, c).type,
            color: color,
            captured: null,
            special: null,
            promotion: null
          });
        } else {
          if (target.color !== color) {
            moves.push({
              from: { r: r, c: c },
              to: { r: nr, c: nc },
              piece: this.get(r, c).type,
              color: color,
              captured: target,
              special: null,
              promotion: null
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
        const target = this.get(nr, nc);
        if (target && target.color === color) continue;
        moves.push({
          from: { r: r, c: c },
          to: { r: nr, c: nc },
          piece: 'k',
          color: color,
          captured: target,
          special: null,
          promotion: null
        });
      }
    }

    const homeRow = color === WHITE ? 7 : 0;
    if (r === homeRow && c === 4 && !this.inCheckFor(color)) {
      const kRight = color === WHITE ? this.castling.wK : this.castling.bK;
      if (kRight &&
          !this.get(homeRow, 5) &&
          !this.get(homeRow, 6) &&
          this.get(homeRow, 7) &&
          this.get(homeRow, 7).type === 'r' &&
          this.get(homeRow, 7).color === color &&
          !this.squareAttacked(homeRow, 5, opposite(color)) &&
          !this.squareAttacked(homeRow, 6, opposite(color))) {
        moves.push({
          from: { r: r, c: c },
          to: { r: homeRow, c: 6 },
          piece: 'k',
          color: color,
          captured: null,
          special: 'castle-k',
          promotion: null
        });
      }
      const qRight = color === WHITE ? this.castling.wQ : this.castling.bQ;
      if (qRight &&
          !this.get(homeRow, 3) &&
          !this.get(homeRow, 2) &&
          !this.get(homeRow, 1) &&
          this.get(homeRow, 0) &&
          this.get(homeRow, 0).type === 'r' &&
          this.get(homeRow, 0).color === color &&
          !this.squareAttacked(homeRow, 3, opposite(color)) &&
          !this.squareAttacked(homeRow, 2, opposite(color))) {
        moves.push({
          from: { r: r, c: c },
          to: { r: homeRow, c: 2 },
          piece: 'k',
          color: color,
          captured: null,
          special: 'castle-q',
          promotion: null
        });
      }
    }

    return moves;
  };

  // ---------- Attack detection ----------
  ChessGame.prototype.squareAttacked = function (r, c, byColor) {
    const pawnDir = byColor === WHITE ? 1 : -1;
    for (let dc = -1; dc <= 1; dc += 2) {
      const pr = r + pawnDir;
      const pc = c + dc;
      if (isInside(pr, pc)) {
        const p = this.get(pr, pc);
        if (p && p.type === 'p' && p.color === byColor) return true;
      }
    }

    const knightOffsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    for (let i = 0; i < knightOffsets.length; i++) {
      const nr = r + knightOffsets[i][0];
      const nc = c + knightOffsets[i][1];
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
    for (let i = 0; i < diagDirs.length; i++) {
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

    const straightDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let i = 0; i < straightDirs.length; i++) {
      let nr = r + straightDirs[i][0];
      let nc = c + straightDirs[i][1];
      while (isInside(nr, nc)) {
        const p = this.get(nr, nc);
        if (p) {
          if (p.color === byColor && (p.type === 'r' || p.type === 'q')) return true;
          break;
        }
        nr += straightDirs[i][0];
        nc += straightDirs[i][1];
      }
    }

    return false;
  };

  ChessGame.prototype.findKing = function (color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.get(r, c);
        if (p && p.type === 'k' && p.color === color) {
          return { r: r, c: c };
        }
      }
    }
    return null;
  };

  ChessGame.prototype.inCheckFor = function (color) {
    const king = this.findKing(color);
    if (!king) return false;
    return this.squareAttacked(king.r, king.c, opposite(color));
  };

  // ---------- Legal filtering ----------
  ChessGame.prototype.legalMovesFrom = function (r, c) {
    const piece = this.get(r, c);
    if (!piece || piece.color !== this.turn) return [];
    const pseudo = this.pieceMoves(r, c);
    const legal = [];
    for (let i = 0; i < pseudo.length; i++) {
      const m = pseudo[i];
      if (this.wouldLeaveInCheck(m, piece.color)) continue;
      legal.push(m);
    }
    return legal;
  };

  ChessGame.prototype.wouldLeaveInCheck = function (move, color) {
    const savedBoard = cloneBoard(this.board);
    this.applyMoveOnBoard(move);
    const inCheck = this.inCheckFor(color);
    this.board = savedBoard;
    return inCheck;
  };

  ChessGame.prototype.applyMoveOnBoard = function (move) {
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
        if (p && p.color === color) {
          const pseudo = this.pieceMoves(r, c);
          for (let i = 0; i < pseudo.length; i++) {
            if (!this.wouldLeaveInCheck(pseudo[i], color)) {
              all.push(pseudo[i]);
            }
          }
        }
      }
    }
    return all;
  };

  // ---------- Move execution ----------
  ChessGame.prototype.findMove = function (from, to, promotion) {
    const candidates = this.legalMovesFrom(from.r, from.c);
    for (let i = 0; i < candidates.length; i++) {
      const m = candidates[i];
      if (m.to.r === to.r && m.to.c === to.c) {
        if (m.special === 'promotion') {
          if (promotion && m.promotion === promotion) return m;
        } else {
          return m;
        }
      }
    }
    return null;
  };

  ChessGame.prototype.makeMove = function (move, san) {
    this.snapshots.push(this.snapshot());

    const piece = this.get(move.from.r, move.from.c);
    if (!piece) return false;

    if (move.captured) {
      this.captured[move.captured.color].push(move.captured.type);
    }

    this.applyMoveOnBoard(move);

    this.updateCastlingRights(move, piece);

    this.enPassant = null;
    if (move.special === 'double-pawn') {
      this.enPassant = { r: (move.from.r + move.to.r) / 2, c: move.to.c };
    }

    if (piece.type === 'p' || move.captured) {
      this.halfmove = 0;
    } else {
      this.halfmove++;
    }

    if (this.turn === BLACK) this.fullmove++;

    this.lastMove = {
      from: { r: move.from.r, c: move.from.c },
      to: { r: move.to.r, c: move.to.c }
    };

    this.history.push({
      san: san || this.toSan(move),
      move: move,
      turn: this.turn
    });

    this.turn = opposite(this.turn);

    this.inCheck = this.inCheckFor(this.turn);
    this.checkGameEnd();

    return true;
  };

  ChessGame.prototype.updateCastlingRights = function (move, piece) {
    if (piece.type === 'k') {
      if (piece.color === WHITE) {
        this.castling.wK = false;
        this.castling.wQ = false;
      } else {
        this.castling.bK = false;
        this.castling.bQ = false;
      }
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
          winner: opposite(this.turn),
          message: 'Skakmat! ' + colorName(opposite(this.turn)) + ' menang.'
        };
      } else {
        this.result = {
          type: 'stalemate',
          winner: null,
          message: 'Stalemate. Permainan seri.'
        };
      }
      return;
    }
    if (this.halfmove >= 100) {
      this.gameOver = true;
      this.result = { type: 'fifty-move', winner: null, message: 'Aturan 50 langkah. Seri.' };
      return;
    }
    if (this.isInsufficientMaterial()) {
      this.gameOver = true;
      this.result = { type: 'insufficient', winner: null, message: 'Materi tidak cukup. Seri.' };
    }
  };

  ChessGame.prototype.isInsufficientMaterial = function () {
    const pieces = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.get(r, c);
        if (p) pieces.push(p);
      }
    }
    if (pieces.length > 4) return false;
    const nonKings = pieces.filter(function (p) { return p.type !== 'k'; });
    if (nonKings.length === 0) return true;
    if (nonKings.length === 1 && (nonKings[0].type === 'b' || nonKings[0].type === 'n')) return true;
    if (nonKings.length === 2 && nonKings[0].type === 'b' && nonKings[1].type === 'b') return true;
    return false;
  };

  // ---------- SAN notation ----------
  ChessGame.prototype.toSan = function (move) {
    if (move.special === 'castle-k') return this.suffixCheck('O-O', move);
    if (move.special === 'castle-q') return this.suffixCheck('O-O-O', move);

    const piece = this.get(move.from.r, move.from.c);
    let san = '';

    if (piece.type === 'p') {
      if (move.captured || move.special === 'en-passant') {
        san += FILE_LETTERS[move.from.c] + 'x';
      }
      san += squareName(move.to.r, move.to.c);
      if (move.promotion) san += '=' + move.promotion.toUpperCase();
    } else {
      san += piece.type.toUpperCase();
      const dis = this.disambiguation(move, piece);
      san += dis + (move.captured ? 'x' : '') + squareName(move.to.r, move.to.c);
    }
    return this.suffixCheck(san, move);
  };

  ChessGame.prototype.disambiguation = function (move, piece) {
    const others = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (r === move.from.r && c === move.from.c) continue;
        const p = this.get(r, c);
        if (!p || p.type !== piece.type || p.color !== piece.color) continue;
        const candidates = this.pieceMoves(r, c);
        for (let i = 0; i < candidates.length; i++) {
          if (candidates[i].to.r === move.to.r && candidates[i].to.c === move.to.c) {
            others.push({ r: r, c: c });
            break;
          }
        }
      }
    }
    if (others.length === 0) return '';
    const sameFile = others.some(function (o) { return o.c === move.from.c; });
    const sameRank = others.some(function (o) { return o.r === move.from.r; });
    if (!sameFile) return FILE_LETTERS[move.from.c];
    if (!sameRank) return String(8 - move.from.r);
    return squareName(move.from.r, move.from.c);
  };

  ChessGame.prototype.suffixCheck = function (san, move) {
    const savedBoard = cloneBoard(this.board);
    const savedCastling = Object.assign({}, this.castling);
    const savedEnPassant = this.enPassant;
    const savedTurn = this.turn;

    this.applyMoveOnBoard(move);
    this.turn = opposite(this.turn);
    const check = this.inCheckFor(this.turn);
    const hasReply = this.allLegalMovesFor(this.turn).length > 0;

    this.board = savedBoard;
    this.castling = savedCastling;
    this.enPassant = savedEnPassant;
    this.turn = savedTurn;

    if (check && !hasReply) return san + '#';
    if (check) return san + '+';
    return san;
  };

  // ---------- Undo ----------
  ChessGame.prototype.undo = function () {
    if (this.snapshots.length === 0) return false;
    const snap = this.snapshots.pop();
    this.restore(snap);
    this.history.pop();
    return true;
  };

  // ---------- Interaksi UI ----------
  const refs = {};
  let game = null;

  function cacheRefs() {
    refs.board = document.getElementById('board');
    refs.turnValue = document.getElementById('turnValue');
    refs.turnDot = document.getElementById('turnDot');
    refs.statusLine = document.getElementById('statusLine');
    refs.historyList = document.getElementById('historyList');
    refs.capturedByWhite = document.getElementById('capturedByWhite');
    refs.capturedByBlack = document.getElementById('capturedByBlack');
    refs.btnNewGame = document.getElementById('btnNewGame');
    refs.btnUndo = document.getElementById('btnUndo');
    refs.btnFlip = document.getElementById('btnFlip');
    refs.promoOverlay = document.getElementById('promotionOverlay');
    refs.promoOptions = document.getElementById('promotionOptions');
    refs.rankLabels = document.getElementById('rankLabels');
    refs.fileLabels = document.getElementById('fileLabels');
    refs.stageFoot = document.querySelector('.stage-foot');
  }

  function buildCoordinateLabels() {
    if (refs.rankLabels) {
      refs.rankLabels.innerHTML = '';
      for (let c = 0; c < 8; c++) {
        const span = document.createElement('span');
        span.textContent = FILE_LETTERS[game.flipped ? 7 - c : c];
        refs.rankLabels.appendChild(span);
      }
    }
    if (refs.fileLabels) {
      refs.fileLabels.innerHTML = '';
      for (let c = 0; c < 8; c++) {
        const span = document.createElement('span');
        span.textContent = FILE_LETTERS[game.flipped ? 7 - c : c];
        refs.fileLabels.appendChild(span);
      }
    }
  }

  function renderBoard() {
    if (!refs.board) return;
    refs.board.innerHTML = '';

    const rows = game.flipped ? 7 : 0;
    const rowStep = game.flipped ? -1 : 1;
    const cols = game.flipped ? 7 : 0;
    const colStep = game.flipped ? -1 : 1;

    for (let i = 0; i < 8; i++) {
      const r = rows + i * rowStep;
      for (let j = 0; j < 8; j++) {
        const c = cols + j * colStep;
        const sq = document.createElement('div');
        sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
        sq.dataset.r = r;
        sq.dataset.c = c;
        sq.setAttribute('role', 'gridcell');
        sq.setAttribute('aria-label', squareName(r, c));

        if (game.lastMove) {
          if ((game.lastMove.from.r === r && game.lastMove.from.c === c) ||
              (game.lastMove.to.r === r && game.lastMove.to.c === c)) {
            sq.classList.add('last-move');
          }
        }
        if (game.selected && game.selected.r === r && game.selected.c === c) {
          sq.classList.add('selected');
        }

        const isLegal = game.legalMoves.some(function (m) {
          return m.to.r === r && m.to.c === c;
        });
        if (isLegal) {
          const hasPiece = !!game.get(r, c);
          sq.classList.add(hasPiece ? 'capture-move' : 'legal-move');
        }

        if (game.inCheck) {
          const king = game.findKing(game.turn);
          if (king && king.r === r && king.c === c) {
            sq.classList.add('check');
          }
        }

        const piece = game.get(r, c);
        if (piece) {
          const el = document.createElement('span');
          el.className = 'piece';
          el.textContent = PIECE_SYMBOL[piece.color + '-' + piece.type];
          sq.appendChild(el);
        }

        sq.addEventListener('click', (function (rr, cc) {
          return function () { handleSquareClick(rr, cc); };
        })(r, c));

        refs.board.appendChild(sq);
      }
    }
  }

  function renderSidebar() {
    if (refs.turnValue) {
      refs.turnValue.textContent = colorName(game.turn);
    }
    if (refs.turnDot) {
      refs.turnDot.classList.toggle('black', game.turn === BLACK);
    }
    if (refs.statusLine) {
      refs.statusLine.className = 'status-line';
      if (game.gameOver && game.result) {
        refs.statusLine.textContent = game.result.message;
        refs.statusLine.classList.add(game.result.type === 'checkmate' ? 'success' : 'danger');
      } else if (game.inCheck) {
        refs.statusLine.textContent = 'Skak! ' + colorName(game.turn) + ' harus menyelamatkan raja.';
        refs.statusLine.classList.add('alert');
      } else {
        refs.statusLine.textContent = 'Pilih bidak untuk memulai langkah ' + colorName(game.turn) + '.';
      }
    }

    renderCaptured();
    renderHistory();
  }

  function renderCaptured() {
    if (refs.capturedByWhite) {
      refs.capturedByWhite.innerHTML = '';
      game.captured.b.forEach(function (type) {
        const s = document.createElement('span');
        s.className = 'cap-piece';
        s.textContent = PIECE_SYMBOL['b-' + type];
        refs.capturedByWhite.appendChild(s);
      });
    }
    if (refs.capturedByBlack) {
      refs.capturedByBlack.innerHTML = '';
      game.captured.w.forEach(function (type) {
        const s = document.createElement('span');
        s.className = 'cap-piece';
        s.textContent = PIECE_SYMBOL['w-' + type];
        refs.capturedByBlack.appendChild(s);
      });
    }
  }

  function renderHistory() {
    if (!refs.historyList) return;
    refs.historyList.innerHTML = '';
    if (game.history.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'history-empty';
      empty.textContent = 'Belum ada langkah.';
      refs.historyList.appendChild(empty);
      return;
    }

    const pairs = [];
    for (let i = 0; i < game.history.length; i += 2) {
      pairs.push({
        num: Math.floor(i / 2) + 1,
        white: game.history[i],
        black: game.history[i + 1] || null
      });
    }

    pairs.forEach(function (pair) {
      const numEl = document.createElement('div');
      numEl.className = 'hist-num';
      numEl.textContent = pair.num + '.';
      refs.historyList.appendChild(numEl);

      const wEl = document.createElement('div');
      wEl.className = 'hist-move';
      wEl.textContent = pair.white ? pair.white.san : '';
      refs.historyList.appendChild(wEl);

      const bEl = document.createElement('div');
      bEl.className = 'hist-move' + (pair.black ? '' : ' empty');
      bEl.textContent = pair.black ? pair.black.san : '—';
      refs.historyList.appendChild(bEl);
    });

    refs.historyList.scrollTop = refs.historyList.scrollHeight;
  }

  function render() {
    renderBoard();
    renderSidebar();
    buildCoordinateLabels();
  }

  // ---------- Klik handler ----------
  function handleSquareClick(r, c) {
    if (game.gameOver) return;
    if (game.pendingPromotion) return;

    const piece = game.get(r, c);

    if (game.selected) {
      const from = game.selected;
      const targetMove = game.legalMoves.find(function (m) {
        return m.to.r === r && m.to.c === c;
      });

      if (targetMove) {
        if (targetMove.special === 'promotion') {
          openPromotion(from, { r: r, c: c });
          return;
        }
        const san = game.toSan(targetMove);
        game.makeMove(targetMove, san);
        game.selected = null;
        game.legalMoves = [];
        render();
        afterMove();
        return;
      }

      if (piece && piece.color === game.turn) {
        game.selected = { r: r, c: c };
        game.legalMoves = game.legalMovesFrom(r, c);
        render();
        return;
      }

      game.selected = null;
      game.legalMoves = [];
      render();
      return;
    }

    if (piece && piece.color === game.turn) {
      game.selected = { r: r, c: c };
      game.legalMoves = game.legalMovesFrom(r, c);
      render();
    }
  }

  // ---------- Promotion ----------
  function openPromotion(from, to) {
    game.pendingPromotion = { from: from, to: to };
    if (!refs.promoOverlay) return;
    refs.promoOptions.innerHTML = '';
    const color = game.turn;
    ['q', 'r', 'b', 'n'].forEach(function (type) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'promo-btn';
      btn.textContent = PIECE_SYMBOL[color + '-' + type];
      btn.setAttribute('aria-label', PIECE_NAMES[type]);
      btn.addEventListener('click', function () {
        completePromotion(type);
      });
      refs.promoOptions.appendChild(btn);
    });
    refs.promoOverlay.hidden = false;
  }

  function completePromotion(type) {
    if (!game.pendingPromotion) return;
    const from = game.pendingPromotion.from;
    const to = game.pendingPromotion.to;
    const move = game.findMove(from, to, type);
    if (move) {
      const san = game.toSan(move);
      game.makeMove(move, san);
    }
    game.pendingPromotion = null;
    game.selected = null;
    game.legalMoves = [];
    if (refs.promoOverlay) refs.promoOverlay.hidden = true;
    render();
    afterMove();
  }

  function afterMove() {
    if (game.gameOver && game.result) {
      setTimeout(function () {
        if (window.FG && window.FG.toast) {
          window.FG.toast(game.result.message, 3000);
        }
      }, 200);
    }
  }

  // ---------- Tombol kontrol ----------
  function bindControls() {
    if (refs.btnNewGame) {
      refs.btnNewGame.addEventListener('click', function () {
        game.reset();
        render();
        if (window.FG && window.FG.toast) window.FG.toast('Game baru dimulai.');
      });
    }
    if (refs.btnUndo) {
      refs.btnUndo.addEventListener('click', function () {
        if (game.undo()) {
          render();
        } else if (window.FG && window.FG.toast) {
          window.FG.toast('Tidak ada langkah untuk dibatalkan.');
        }
      });
    }
    if (refs.btnFlip) {
      refs.btnFlip.addEventListener('click', function () {
        game.flipped = !game.flipped;
        render();
      });
    }
  }

  // ---------- Init ----------
  function init() {
    cacheRefs();
    if (!refs.board) return;
    game = new ChessGame();
    bindControls();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();