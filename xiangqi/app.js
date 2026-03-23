const BOARD_ROWS = 10;
const BOARD_COLS = 9;

const PIECE_LABELS = {
  general: { red: "帅", black: "将" },
  advisor: { red: "仕", black: "士" },
  elephant: { red: "相", black: "象" },
  horse: { red: "马", black: "马" },
  chariot: { red: "车", black: "车" },
  cannon: { red: "炮", black: "炮" },
  soldier: { red: "兵", black: "卒" },
};

const PIECE_NAMES = {
  general: "将帅",
  advisor: "士仕",
  elephant: "象相",
  horse: "马",
  chariot: "车",
  cannon: "炮",
  soldier: "兵卒",
};

const PIECE_VALUES = {
  general: 10000,
  chariot: 900,
  cannon: 450,
  horse: 380,
  elephant: 220,
  advisor: 200,
  soldier: 120,
};

const PRESET_LIBRARY = {
  opening: {
    label: "标准开局",
    currentTurn: "red",
    setup: (place) => {
      ["chariot", "horse", "elephant", "advisor", "general", "advisor", "elephant", "horse", "chariot"].forEach(
        (type, col) => place(0, col, "black", type),
      );
      place(2, 1, "black", "cannon");
      place(2, 7, "black", "cannon");
      [0, 2, 4, 6, 8].forEach((col) => place(3, col, "black", "soldier"));

      ["chariot", "horse", "elephant", "advisor", "general", "advisor", "elephant", "horse", "chariot"].forEach(
        (type, col) => place(9, col, "red", type),
      );
      place(7, 1, "red", "cannon");
      place(7, 7, "red", "cannon");
      [0, 2, 4, 6, 8].forEach((col) => place(6, col, "red", "soldier"));
    },
  },
  "rook-mate": {
    label: "单车逼宫",
    currentTurn: "red",
    setup: (place) => {
      place(0, 4, "black", "general");
      place(1, 4, "red", "chariot");
      place(2, 3, "red", "general");
      place(2, 5, "red", "advisor");
      place(3, 4, "red", "soldier");
    },
  },
  "cannon-pressure": {
    label: "双炮施压",
    currentTurn: "red",
    setup: (place) => {
      place(0, 4, "black", "general");
      place(0, 3, "black", "advisor");
      place(0, 5, "black", "advisor");
      place(2, 4, "black", "cannon");
      place(7, 1, "red", "cannon");
      place(7, 7, "red", "cannon");
      place(9, 4, "red", "general");
      place(8, 4, "red", "soldier");
      place(6, 4, "red", "chariot");
    },
  },
  "endgame-duel": {
    label: "残局对杀",
    currentTurn: "black",
    setup: (place) => {
      place(0, 4, "black", "general");
      place(2, 2, "black", "horse");
      place(2, 6, "black", "cannon");
      place(3, 4, "black", "soldier");
      place(9, 4, "red", "general");
      place(7, 4, "red", "chariot");
      place(6, 2, "red", "horse");
      place(6, 6, "red", "soldier");
    },
  },
};

const boardElement = document.getElementById("board");
const turnBadge = document.getElementById("turnBadge");
const statusText = document.getElementById("statusText");
const detailText = document.getElementById("detailText");
const turnText = document.getElementById("turnText");
const modeText = document.getElementById("modeText");
const moveCountElement = document.getElementById("moveCount");
const redLostElement = document.getElementById("redLost");
const blackLostElement = document.getElementById("blackLost");
const historyList = document.getElementById("historyList");
const undoButton = document.getElementById("undoButton");
const resetButton = document.getElementById("resetButton");
const exportButton = document.getElementById("exportButton");
const copyExportButton = document.getElementById("copyExportButton");
const downloadExportButton = document.getElementById("downloadExportButton");
const exportOutput = document.getElementById("exportOutput");
const exportHint = document.getElementById("exportHint");
const modeSelect = document.getElementById("modeSelect");
const aiLevelSelect = document.getElementById("aiLevelSelect");
const presetSelect = document.getElementById("presetSelect");
const loadPresetButton = document.getElementById("loadPresetButton");

let board = [];
let currentTurn = "red";
let selected = null;
let validMoves = [];
let history = [];
let moveRecords = [];
let gameOver = false;
let gameMode = "pvp";
let aiLevel = "medium";
let presetKey = "opening";
let aiThinking = false;
let winnerText = "";
let aiTurnToken = 0;

const createEmptyBoard = () =>
  Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => null));

const cloneBoard = (sourceBoard) =>
  sourceBoard.map((row) => row.map((piece) => (piece ? { ...piece } : null)));

const isInside = (row, col) => row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;

const isInPalace = (row, col, side) => {
  const rowRange = side === "red" ? [7, 9] : [0, 2];
  return row >= rowRange[0] && row <= rowRange[1] && col >= 3 && col <= 5;
};

const createBoardFromPreset = (key) => {
  const preset = PRESET_LIBRARY[key] || PRESET_LIBRARY.opening;
  const nextBoard = createEmptyBoard();
  const place = (row, col, side, type) => {
    nextBoard[row][col] = { side, type };
  };
  preset.setup(place);
  return { board: nextBoard, currentTurn: preset.currentTurn };
};

const hasPieceBetween = (sourceBoard, from, to) => {
  if (from.row === to.row) {
    const [start, end] = [from.col, to.col].sort((a, b) => a - b);
    let count = 0;
    for (let col = start + 1; col < end; col += 1) {
      if (sourceBoard[from.row][col]) {
        count += 1;
      }
    }
    return count;
  }

  if (from.col === to.col) {
    const [start, end] = [from.row, to.row].sort((a, b) => a - b);
    let count = 0;
    for (let row = start + 1; row < end; row += 1) {
      if (sourceBoard[row][from.col]) {
        count += 1;
      }
    }
    return count;
  }

  return -1;
};

const generalsFacing = (sourceBoard) => {
  let redGeneral = null;
  let blackGeneral = null;

  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = sourceBoard[row][col];
      if (!piece || piece.type !== "general") {
        continue;
      }
      if (piece.side === "red") {
        redGeneral = { row, col };
      } else {
        blackGeneral = { row, col };
      }
    }
  }

  if (!redGeneral || !blackGeneral || redGeneral.col !== blackGeneral.col) {
    return false;
  }

  return hasPieceBetween(sourceBoard, redGeneral, blackGeneral) === 0;
};

const getPseudoMoves = (sourceBoard, row, col, piece) => {
  const moves = [];
  const pushMove = (nextRow, nextCol) => {
    if (!isInside(nextRow, nextCol)) {
      return;
    }
    const target = sourceBoard[nextRow][nextCol];
    if (!target || target.side !== piece.side) {
      moves.push({ row: nextRow, col: nextCol });
    }
  };

  if (piece.type === "general") {
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].forEach(([dr, dc]) => {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (isInPalace(nextRow, nextCol, piece.side)) {
        pushMove(nextRow, nextCol);
      }
    });
    return moves;
  }

  if (piece.type === "advisor") {
    [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ].forEach(([dr, dc]) => {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (isInPalace(nextRow, nextCol, piece.side)) {
        pushMove(nextRow, nextCol);
      }
    });
    return moves;
  }

  if (piece.type === "elephant") {
    [
      [2, 2],
      [2, -2],
      [-2, 2],
      [-2, -2],
    ].forEach(([dr, dc]) => {
      const nextRow = row + dr;
      const nextCol = col + dc;
      const eyeRow = row + dr / 2;
      const eyeCol = col + dc / 2;
      const crossedRiver = piece.side === "red" ? nextRow < 5 : nextRow > 4;
      if (!crossedRiver && !sourceBoard[eyeRow][eyeCol]) {
        pushMove(nextRow, nextCol);
      }
    });
    return moves;
  }

  if (piece.type === "horse") {
    const candidates = [
      { move: [-2, -1], leg: [-1, 0] },
      { move: [-2, 1], leg: [-1, 0] },
      { move: [2, -1], leg: [1, 0] },
      { move: [2, 1], leg: [1, 0] },
      { move: [-1, -2], leg: [0, -1] },
      { move: [1, -2], leg: [0, -1] },
      { move: [-1, 2], leg: [0, 1] },
      { move: [1, 2], leg: [0, 1] },
    ];
    candidates.forEach(({ move, leg }) => {
      const legRow = row + leg[0];
      const legCol = col + leg[1];
      if (isInside(legRow, legCol) && !sourceBoard[legRow][legCol]) {
        pushMove(row + move[0], col + move[1]);
      }
    });
    return moves;
  }

  if (piece.type === "chariot" || piece.type === "cannon") {
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].forEach(([dr, dc]) => {
      let nextRow = row + dr;
      let nextCol = col + dc;
      let jumped = false;

      while (isInside(nextRow, nextCol)) {
        const target = sourceBoard[nextRow][nextCol];
        if (piece.type === "chariot") {
          if (!target) {
            moves.push({ row: nextRow, col: nextCol });
          } else {
            if (target.side !== piece.side) {
              moves.push({ row: nextRow, col: nextCol });
            }
            break;
          }
        } else if (!jumped) {
          if (!target) {
            moves.push({ row: nextRow, col: nextCol });
          } else {
            jumped = true;
          }
        } else if (target) {
          if (target.side !== piece.side) {
            moves.push({ row: nextRow, col: nextCol });
          }
          break;
        }
        nextRow += dr;
        nextCol += dc;
      }
    });
    return moves;
  }

  if (piece.type === "soldier") {
    const direction = piece.side === "red" ? -1 : 1;
    pushMove(row + direction, col);
    const crossedRiver = piece.side === "red" ? row <= 4 : row >= 5;
    if (crossedRiver) {
      pushMove(row, col - 1);
      pushMove(row, col + 1);
    }
  }

  return moves;
};

const applyMoveToBoard = (sourceBoard, from, to) => {
  const nextBoard = cloneBoard(sourceBoard);
  nextBoard[to.row][to.col] = nextBoard[from.row][from.col];
  nextBoard[from.row][from.col] = null;
  return nextBoard;
};

const findGeneral = (sourceBoard, side) => {
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = sourceBoard[row][col];
      if (piece && piece.side === side && piece.type === "general") {
        return { row, col };
      }
    }
  }
  return null;
};

const isSquareAttacked = (sourceBoard, targetRow, targetCol, attackerSide) => {
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = sourceBoard[row][col];
      if (!piece || piece.side !== attackerSide) {
        continue;
      }

      if (piece.type === "general") {
        const sameFile = col === targetCol;
        const distance = Math.abs(row - targetRow);
        if (sameFile && distance > 0 && hasPieceBetween(sourceBoard, { row, col }, { row: targetRow, col: targetCol }) === 0) {
          return true;
        }
      }

      const moves = getPseudoMoves(sourceBoard, row, col, piece);
      if (moves.some((move) => move.row === targetRow && move.col === targetCol)) {
        return true;
      }
    }
  }
  return false;
};

const isInCheck = (sourceBoard, side) => {
  const general = findGeneral(sourceBoard, side);
  if (!general) {
    return true;
  }
  if (generalsFacing(sourceBoard)) {
    return true;
  }
  const opponent = side === "red" ? "black" : "red";
  return isSquareAttacked(sourceBoard, general.row, general.col, opponent);
};

const getLegalMoves = (sourceBoard, row, col) => {
  const piece = sourceBoard[row][col];
  if (!piece) {
    return [];
  }

  const pseudoMoves = getPseudoMoves(sourceBoard, row, col, piece);
  return pseudoMoves.filter((move) => {
    const nextBoard = applyMoveToBoard(sourceBoard, { row, col }, move);
    return !isInCheck(nextBoard, piece.side);
  });
};

const getAllLegalMoves = (sourceBoard, side) => {
  const moves = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = sourceBoard[row][col];
      if (!piece || piece.side !== side) {
        continue;
      }
      getLegalMoves(sourceBoard, row, col).forEach((move) => {
        moves.push({ from: { row, col }, to: move, piece });
      });
    }
  }
  return moves;
};

const countPieces = (sourceBoard, side) => {
  let count = 0;
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      if (sourceBoard[row][col]?.side === side) {
        count += 1;
      }
    }
  }
  return count;
};

const countCaptured = (side) => 16 - countPieces(board, side);

const formatPosition = ({ row, col }) => `(${row + 1},${col + 1})`;

const formatMoveText = ({ piece, from, to, captured }) => {
  const pieceLabel = PIECE_LABELS[piece.type][piece.side];
  const sideLabel = piece.side === "red" ? "红" : "黑";
  const captureLabel = captured ? ` 吃 ${PIECE_LABELS[captured.type][captured.side]}` : "";
  return `${sideLabel}${pieceLabel} ${formatPosition(from)} -> ${formatPosition(to)}${captureLabel}`;
};

const getMaterialScore = (sourceBoard) => {
  let score = 0;
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = sourceBoard[row][col];
      if (!piece) {
        continue;
      }
      const sign = piece.side === "black" ? 1 : -1;
      score += PIECE_VALUES[piece.type] * sign;

      if (piece.type === "soldier") {
        const advanced = piece.side === "black" ? row : 9 - row;
        score += sign * advanced * 8;
      }
      if (piece.type === "general") {
        score += sign * (isInCheck(sourceBoard, piece.side) ? -60 : 40);
      }
    }
  }
  return score;
};

const getMoveBonus = (sourceBoard, move, side) => {
  const target = sourceBoard[move.to.row][move.to.col];
  let bonus = 0;
  if (target) {
    bonus += PIECE_VALUES[target.type] + 40;
  }
  if (move.piece.type === "cannon" && target) {
    bonus += 30;
  }
  const nextBoard = applyMoveToBoard(sourceBoard, move.from, move.to);
  const opponent = side === "red" ? "black" : "red";
  if (isInCheck(nextBoard, opponent)) {
    bonus += 120;
  }
  const centerDistance = Math.abs(4 - move.to.col);
  bonus += Math.max(0, 3 - centerDistance) * 8;
  return bonus;
};

const evaluateBoard = (sourceBoard, sideToMove) => {
  const legalMoves = getAllLegalMoves(sourceBoard, sideToMove);
  if (legalMoves.length === 0) {
    return sideToMove === "black" ? -999999 : 999999;
  }
  let score = getMaterialScore(sourceBoard);
  score += getAllLegalMoves(sourceBoard, "black").length * 4;
  score -= getAllLegalMoves(sourceBoard, "red").length * 4;
  return score;
};

const chooseAiMove = () => {
  const side = "black";
  const moves = getAllLegalMoves(board, side);
  if (moves.length === 0) {
    return null;
  }

  const depthByLevel = {
    easy: 1,
    medium: 2,
    hard: 2,
  };
  const randomnessByLevel = {
    easy: 40,
    medium: 16,
    hard: 4,
  };
  const depth = depthByLevel[aiLevel] || 2;
  const randomness = randomnessByLevel[aiLevel] || 12;

  const minimax = (sourceBoard, sideToMove, depthLeft, alpha, beta) => {
    const legalMoves = getAllLegalMoves(sourceBoard, sideToMove);
    if (depthLeft === 0 || legalMoves.length === 0) {
      return evaluateBoard(sourceBoard, sideToMove);
    }

    if (sideToMove === "black") {
      let best = -Infinity;
      for (const move of legalMoves) {
        const nextBoard = applyMoveToBoard(sourceBoard, move.from, move.to);
        const value = minimax(nextBoard, "red", depthLeft - 1, alpha, beta);
        best = Math.max(best, value);
        alpha = Math.max(alpha, value);
        if (beta <= alpha) {
          break;
        }
      }
      return best;
    }

    let best = Infinity;
    for (const move of legalMoves) {
      const nextBoard = applyMoveToBoard(sourceBoard, move.from, move.to);
      const value = minimax(nextBoard, "black", depthLeft - 1, alpha, beta);
      best = Math.min(best, value);
      beta = Math.min(beta, value);
      if (beta <= alpha) {
        break;
      }
    }
    return best;
  };

  let bestScore = -Infinity;
  let bestMove = moves[0];

  for (const move of moves) {
    const nextBoard = applyMoveToBoard(board, move.from, move.to);
    let score = minimax(nextBoard, "red", depth - 1, -Infinity, Infinity);
    score += getMoveBonus(board, move, side);
    score += Math.random() * randomness;
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
};

const createSnapshot = () => ({
  board: cloneBoard(board),
  currentTurn,
  moveRecords: moveRecords.map((record) => ({ ...record })),
  gameOver,
  winnerText,
});

const updateExportOutput = () => {
  const presetLabel = PRESET_LIBRARY[presetKey]?.label || "标准开局";
  const modeLabel = gameMode === "ai" ? `人机对战（AI: ${aiLevel}）` : "双人对弈";
  const resultText = winnerText || "进行中";
  const moveLines =
    moveRecords.length === 0
      ? ["尚无着法记录。"]
      : moveRecords.map((record) => `${record.index}. ${record.text}`);

  exportOutput.value = [
    `中国象棋棋谱`,
    `残局：${presetLabel}`,
    `模式：${modeLabel}`,
    `结果：${resultText}`,
    `总手数：${moveRecords.length}`,
    ``,
    ...moveLines,
  ].join("\n");
  exportHint.textContent = `当前残局：${presetLabel}，模式：${modeLabel}。`;
};

const renderHistory = () => {
  historyList.innerHTML = "";
  if (moveRecords.length === 0) {
    const item = document.createElement("li");
    item.textContent = "对局尚未开始。";
    historyList.appendChild(item);
    return;
  }

  [...moveRecords].reverse().forEach((record) => {
    const item = document.createElement("li");
    item.textContent = `${record.index}. ${record.text}`;
    historyList.appendChild(item);
  });
};

const updateStatus = () => {
  const turnLabel = currentTurn === "red" ? "红方" : "黑方";
  turnBadge.textContent = aiThinking ? "AI 思考中" : `${turnLabel}行棋`;
  turnBadge.classList.toggle("black-turn", currentTurn === "black" || aiThinking);
  turnText.textContent = turnLabel;
  modeText.textContent = gameMode === "ai" ? `人机` : "双人";
  moveCountElement.textContent = String(moveRecords.length);
  redLostElement.textContent = String(countCaptured("red"));
  blackLostElement.textContent = String(countCaptured("black"));

  if (gameOver) {
    return;
  }

  const legalMoves = getAllLegalMoves(board, currentTurn);
  const checked = isInCheck(board, currentTurn);
  const currentSideLabel = gameMode === "ai" && currentTurn === "black" ? "AI（黑方）" : turnLabel;

  if (legalMoves.length === 0) {
    const winner = currentTurn === "red" ? "黑方" : "红方";
    winnerText = `${winner}获胜`;
    statusText.textContent = winnerText;
    detailText.textContent = checked ? `${turnLabel}已被将死，当前对局结束。` : `${turnLabel}无合法着法，对局结束。`;
    gameOver = true;
    updateExportOutput();
    return;
  }

  statusText.textContent = checked ? `${currentSideLabel}正在被将军` : `请选择${currentSideLabel}棋子`;
  if (aiThinking) {
    detailText.textContent = "AI 正在评估局面并选择下一步。";
  } else if (checked) {
    detailText.textContent = "请立即应将。系统只会显示不会让己方继续被将军的合法走法。";
  } else {
    detailText.textContent = `${currentSideLabel}可以继续布子或发起进攻。`;
  }
};

const renderBoard = () => {
  boardElement.innerHTML = "";

  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);

      if (row === 0) {
        cell.classList.add("edge-top");
      }
      if (row === BOARD_ROWS - 1) {
        cell.classList.add("edge-bottom");
      }
      if (row === 4 || row === 5) {
        cell.classList.add("river-cut");
      }
      if (selected && selected.row === row && selected.col === col) {
        cell.classList.add("is-selected");
      }
      if (validMoves.some((move) => move.row === row && move.col === col)) {
        cell.classList.add("is-valid");
      }

      const piece = board[row][col];
      if (piece) {
        const pieceElement = document.createElement("span");
        pieceElement.className = `piece ${piece.side}`;
        if (selected && selected.row === row && selected.col === col) {
          pieceElement.classList.add("selected");
        }
        pieceElement.textContent = PIECE_LABELS[piece.type][piece.side];
        cell.appendChild(pieceElement);
      }

      cell.addEventListener("click", () => handleCellClick(row, col));
      boardElement.appendChild(cell);
    }
  }

  const riverTop = document.createElement("div");
  riverTop.className = "river-label top";
  riverTop.textContent = "楚 河";
  boardElement.appendChild(riverTop);

  const riverBottom = document.createElement("div");
  riverBottom.className = "river-label bottom";
  riverBottom.textContent = "汉 界";
  boardElement.appendChild(riverBottom);

  ["black-a", "black-b", "red-a", "red-b"].forEach((className) => {
    const line = document.createElement("div");
    line.className = `palace-line ${className}`;
    boardElement.appendChild(line);
  });

  updateStatus();
  renderHistory();
  updateExportOutput();
};

const finalizeTurnState = () => {
  selected = null;
  validMoves = [];
  renderBoard();
  scheduleAiTurn();
};

const performMove = (from, to, meta = {}) => {
  const movingPiece = board[from.row][from.col];
  const captured = board[to.row][to.col];
  const text = formatMoveText({ piece: movingPiece, from, to, captured });
  history.unshift(createSnapshot());
  board = applyMoveToBoard(board, from, to);
  moveRecords.push({
    index: moveRecords.length + 1,
    text,
    piece: movingPiece.type,
    side: movingPiece.side,
    from: formatPosition(from),
    to: formatPosition(to),
    captured: captured ? captured.type : null,
    by: meta.by || movingPiece.side,
  });
  currentTurn = currentTurn === "red" ? "black" : "red";
  winnerText = "";
  finalizeTurnState();
};

const scheduleAiTurn = () => {
  if (gameMode !== "ai" || currentTurn !== "black" || gameOver || aiThinking) {
    return;
  }

  aiThinking = true;
  aiTurnToken += 1;
  const turnToken = aiTurnToken;
  updateStatus();
  window.setTimeout(() => {
    if (turnToken !== aiTurnToken) {
      return;
    }
    const move = chooseAiMove();
    aiThinking = false;
    if (!move) {
      renderBoard();
      return;
    }
    performMove(move.from, move.to, { by: "ai" });
  }, 260);
};

function handleCellClick(row, col) {
  if (gameOver || aiThinking) {
    return;
  }

  if (gameMode === "ai" && currentTurn === "black") {
    statusText.textContent = "当前由 AI 行棋";
    detailText.textContent = "请等待 AI 完成思考。";
    return;
  }

  const piece = board[row][col];

  if (selected && validMoves.some((move) => move.row === row && move.col === col)) {
    performMove({ ...selected }, { row, col }, { by: "human" });
    return;
  }

  if (!piece) {
    selected = null;
    validMoves = [];
    renderBoard();
    return;
  }

  if (piece.side !== currentTurn) {
    statusText.textContent = `当前轮到${currentTurn === "red" ? "红方" : "黑方"}`;
    detailText.textContent = "只能选择当前行棋方的棋子。";
    return;
  }

  selected = { row, col };
  validMoves = getLegalMoves(board, row, col);

  if (validMoves.length === 0) {
    statusText.textContent = `${PIECE_NAMES[piece.type]}没有合法走法`;
    detailText.textContent = "这枚棋子当前无法移动，请尝试其他棋子。";
  } else {
    statusText.textContent = `已选中${PIECE_LABELS[piece.type][piece.side]}`;
    detailText.textContent = `共有 ${validMoves.length} 个合法落点可选。`;
  }

  renderBoard();
}

const loadPreset = (key, preserveMode = false) => {
  if (!preserveMode) {
    gameMode = modeSelect.value;
    aiLevel = aiLevelSelect.value;
  }
  aiTurnToken += 1;
  presetKey = key;
  const presetState = createBoardFromPreset(key);
  board = presetState.board;
  currentTurn = presetState.currentTurn;
  selected = null;
  validMoves = [];
  history = [];
  moveRecords = [];
  gameOver = false;
  aiThinking = false;
  winnerText = "";
  renderBoard();
};

const resetGame = () => {
  gameMode = modeSelect.value;
  aiLevel = aiLevelSelect.value;
  loadPreset(presetSelect.value, true);
};

const undoMoves = (steps) => {
  if (history.length === 0) {
    statusText.textContent = "当前没有可悔棋的记录";
    detailText.textContent = "请先走子，再使用悔棋。";
    return;
  }

  let actualSteps = Math.min(steps, history.length);
  while (actualSteps > 0) {
    const previous = history.shift();
    board = cloneBoard(previous.board);
    currentTurn = previous.currentTurn;
    moveRecords = previous.moveRecords.map((record) => ({ ...record }));
    gameOver = previous.gameOver;
    winnerText = previous.winnerText;
    actualSteps -= 1;
  }

  selected = null;
  validMoves = [];
  aiThinking = false;
  aiTurnToken += 1;
  renderBoard();
  statusText.textContent = "已回退局面";
  detailText.textContent = gameMode === "ai" ? "人机模式下默认回退一整轮。": "已经返回上一步局面。";
};

modeSelect.addEventListener("change", () => {
  gameMode = modeSelect.value;
  resetGame();
});

aiLevelSelect.addEventListener("change", () => {
  aiLevel = aiLevelSelect.value;
  updateExportOutput();
});

presetSelect.addEventListener("change", () => {
  presetKey = presetSelect.value;
  updateExportOutput();
});

loadPresetButton.addEventListener("click", () => {
  loadPreset(presetSelect.value, true);
});

undoButton.addEventListener("click", () => {
  const steps = gameMode === "ai" && currentTurn === "red" && history.length >= 2 ? 2 : 1;
  undoMoves(steps);
});

resetButton.addEventListener("click", resetGame);

exportButton.addEventListener("click", () => {
  updateExportOutput();
  exportOutput.focus();
  exportOutput.select();
});

copyExportButton.addEventListener("click", async () => {
  updateExportOutput();
  exportOutput.focus();
  exportOutput.select();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(exportOutput.value);
    } else {
      document.execCommand("copy");
    }
    detailText.textContent = "棋谱文本已复制到剪贴板。";
  } catch (error) {
    detailText.textContent = "复制失败，请手动复制导出框中的文本。";
  }
});

downloadExportButton.addEventListener("click", () => {
  const payload = {
    game: "xiangqi",
    preset: presetKey,
    presetLabel: PRESET_LIBRARY[presetKey]?.label || presetKey,
    mode: gameMode,
    aiLevel: gameMode === "ai" ? aiLevel : null,
    result: winnerText || "进行中",
    moveCount: moveRecords.length,
    moves: moveRecords,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `xiangqi-record-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  detailText.textContent = "棋谱 JSON 已开始下载。";
});

modeSelect.value = gameMode;
aiLevelSelect.value = aiLevel;
presetSelect.value = presetKey;
loadPreset(presetKey, true);
