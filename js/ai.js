'use strict';

/* =========================================================
   FastGames — ai.js
   Chess AI: minimax + alpha-beta + piece-square tables.
   Memakai window.ChessEngine.ChessGame.
   ========================================================= */

(function () {

  const PIECE_VALUE = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000
  };

  // Piece-square tables (perspektif Putih, index 0 = a8, 63 = h1)
  const PST = {
    p: [
      0, 0, 0, 0, 0, 0, 0, 0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
      5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0,
      5, -5, -10, 0, 0, -10, -5, 5,
      5, 10, 10, -20, -20, 10, 10, 5,
      0, 0, 0, 0, 0, 0, 0, 0
    ],
    n: [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20, 0, 0, 0, 0, -20, -40,
      -30, 0, 10, 15, 15, 10, 0, -30,
      -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30,
      -30, 5, 10, 15, 15, 10, 5, -30,
      -40, -20, 0, 5, 5, 0, -20, -40,
      -50, -40, -30, -30, -30, -30, -40, -50
    ],
    b: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 10, 10, 5, 0, -10,
      -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10,
      -10, 10, 10, 10, 10, 10, 10, -10,
      -10, 5, 0, 0, 0, 0, 5, -10,
      -20, -10, -10, -10, -10, -10, -10, -20
    ],
    r: [
      0, 0, 0, 0, 0, 0, 0, 0,
      5, 10, 10, 10, 10, 10, 10, 5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      0, 0, 0, 5, 5, 0, 0, 0
    ],
    q: [
      -20, -10, -10, -5, -5, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 5, 5, 5, 0, -10,
      -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5,
      -10, 5, 5, 5, 5, 5, 0, -10,
      -10, 0, 5, 0, 0, 0, 0, -10,
      -20, -10, -10, -5, -5, -10, -10, -20
    ],
    k: [
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20,
      -10, -20, -20, -20, -20, -20, -20, -10,
      20, 20, 0, 0, 0, 0, 20, 20,
      20, 30, 10, 0, 0, 10, 30, 20
    ]
  };

  const WHITE = 'w';

  function pstValue(type, color, r, c) {
    const table = PST[type];
    if (!table) return 0;
    const idx = color === WHITE ? (r * 8 + c) : ((7 - r) * 8 + c);
    return table[idx];
  }

  // Evaluasi dari perspektif `color`.
  function evaluate(game, color) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = game.board[r][c];
        if (!p) continue;
        const v = PIECE_VALUE[p.type] + pstValue(p.type, p.color, r, c);
        if (p.color === color) score += v;
        else score -= v;
      }
    }
    return score;
  }

  function search(game, depth, alpha, beta) {
    if (depth <= 0) {
      return evaluate(game, game.turn);
    }

    const moves = game.allLegalMovesFor(game.turn);
    if (moves.length === 0) {
      if (game.inCheckFor(game.turn)) return -999999 - depth;
      return 0;
    }

    let best = -Infinity;
    for (let i = 0; i < moves.length; i++) {
      const info = game.lightMake(moves[i]);
      const score = -search(game, depth - 1, -beta, -alpha);
      game.lightUnmake(info);

      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  function findBestMove(game, depth) {
    const moves = game.allLegalMovesFor(game.turn);
    if (moves.length === 0) return null;

    let best = null;
    let bestScore = -Infinity;
    let alpha = -Infinity;

    // Urutkan: tangkapan dulu (bantu alpha-beta)
    const ordered = moves.slice().sort(function (a, b) {
      const av = a.captured ? PIECE_VALUE[a.captured.type] : 0;
      const bv = b.captured ? PIECE_VALUE[b.captured.type] : 0;
      return bv - av;
    });

    for (let i = 0; i < ordered.length; i++) {
      const move = ordered[i];
      const info = game.lightMake(move);
      const score = -search(game, depth - 1, -Infinity, -alpha);
      game.lightUnmake(info);

      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
      if (score > alpha) alpha = score;
    }

    // Fallback kalau tidak ada yang lebih baik dari -Infinity
    if (!best) best = ordered[0];
    return best;
  }

  window.ChessAI = {
    findBestMove: findBestMove,
    evaluate: evaluate
  };

})();