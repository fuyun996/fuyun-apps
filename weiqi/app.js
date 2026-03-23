const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const BOARD_CANVAS_SIZE = 760;
const BOARD_OPTIONS = [9, 13, 19];
const COLUMNS = "ABCDEFGHJKLMNOPQRST";
const STAR_POINTS = {
  9: [2, 4, 6],
  13: [3, 6, 9],
  19: [3, 9, 15],
};
const RULESET_CONFIG = {
  cn: { label: "中国规则", komi: 7.5 },
  jp: { label: "日本规则", komi: 6.5 },
};
const AI_LEVELS = {
  balanced: {
    label: "均衡",
    candidateLimit: 12,
    searchDepth: 1,
    replyWeight: 0.95,
    captureBias: 1.1,
    territoryBias: 1,
  },
  sharp: {
    label: "进攻",
    candidateLimit: 14,
    searchDepth: 1,
    replyWeight: 0.9,
    captureBias: 1.5,
    territoryBias: 0.9,
  },
  deep: {
    label: "深算",
    candidateLimit: 10,
    searchDepth: 2,
    replyWeight: 1,
    captureBias: 1.15,
    territoryBias: 1.2,
  },
};
const SOUND_PROFILES = {
  classic: { type: "sine", base: 240, hit: 360, gain: 0.05 },
  bamboo: { type: "triangle", base: 290, hit: 420, gain: 0.045 },
  minimal: { type: "square", base: 180, hit: 240, gain: 0.022 },
};

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const body = document.body;
const boardFrame = document.querySelector(".board-frame");

const turnBadge = document.getElementById("turnBadge");
const statusText = document.getElementById("statusText");
const detailText = document.getElementById("detailText");
const blackCaptures = document.getElementById("blackCaptures");
const whiteCaptures = document.getElementById("whiteCaptures");
const moveCount = document.getElementById("moveCount");
const boardLabel = document.getElementById("boardLabel");
const historyList = document.getElementById("historyList");
const passButton = document.getElementById("passButton");
const undoButton = document.getElementById("undoButton");
const resetButton = document.getElementById("resetButton");
const exportButton = document.getElementById("exportButton");
const importButton = document.getElementById("importButton");
const importInput = document.getElementById("importInput");
const scoreButton = document.getElementById("scoreButton");
const blackScore = document.getElementById("blackScore");
const whiteScore = document.getElementById("whiteScore");
const blackWinrate = document.getElementById("blackWinrate");
const whiteWinrate = document.getElementById("whiteWinrate");
const scoreSummary = document.getElementById("scoreSummary");
const phaseText = document.getElementById("phaseText");
const rulesBoardText = document.getElementById("rulesBoardText");
const rulesetText = document.getElementById("rulesetText");
const komiText = document.getElementById("komiText");
const reviewStatus = document.getElementById("reviewStatus");
const prevButton = document.getElementById("prevButton");
const nextButton = document.getElementById("nextButton");
const liveButton = document.getElementById("liveButton");

const sizeButtons = Array.from(document.querySelectorAll("[data-size]"));
const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
const aiLevelButtons = Array.from(document.querySelectorAll("[data-ai-level]"));
const rulesetButtons = Array.from(document.querySelectorAll("[data-ruleset]"));
const themeButtons = Array.from(document.querySelectorAll("[data-theme]"));
const soundButtons = Array.from(document.querySelectorAll("[data-sound]"));

let boardSize = 19;
let gameMode = "pvp";
let aiLevel = "balanced";
let ruleset = "cn";
let komi = RULESET_CONFIG.cn.komi;
let theme = "classic";
let soundProfile = "classic";

let board = [];
let currentPlayer = BLACK;
let captures = { black: 0, white: 0 };
let moveHistory = [];
let boardHistory = [];
let consecutivePasses = 0;
let gameOver = false;
let lastMove = null;
let lastMoveAt = 0;
let animationFrameId = 0;
let aiTimeoutId = 0;
let aiThinking = false;
let scoreResult = null;
let reviewIndex = null;
let audioContext = null;

canvas.width = BOARD_CANVAS_SIZE;
canvas.height = BOARD_CANVAS_SIZE;

function createEmptyBoard(size = boardSize) {
  return Array.from({ length: size }, () => Array(size).fill(EMPTY));
}

function cloneBoard(source) {
  return source.map((row) => [...row]);
}

function serializeBoard(source) {
  return source.map((row) => row.join("")).join("|");
}

function deserializeBoard(serialized) {
  return serialized.split("|").map((row) => row.split("").map(Number));
}

function oppositePlayer(player) {
  return player === BLACK ? WHITE : BLACK;
}

function playerName(player) {
  return player === BLACK ? "黑方" : "白方";
}

function playerStone(player) {
  return player === BLACK ? "黑棋" : "白棋";
}

function boardMetrics() {
  const size = canvas.width;
  const padding = size * 0.07;
  const grid = (size - padding * 2) / (boardSize - 1);
  return { size, padding, grid };
}

function getBoardLabel() {
  return `${boardSize} 路`;
}

function getStarPoints() {
  return STAR_POINTS[boardSize] || [];
}

function isAiTurn() {
  return gameMode === "ai" && currentPlayer === WHITE && !isReviewing();
}

function isReviewing() {
  return reviewIndex !== null;
}

function getNeighbors(row, col, size = boardSize) {
  return [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ].filter(([r, c]) => r >= 0 && r < size && c >= 0 && c < size);
}

function formatCoordinate(row, col) {
  return `${COLUMNS[col]}${boardSize - row}`;
}

function collectGroup(source, row, col) {
  const group = [];
  const liberties = new Set();
  const queue = [[row, col]];
  const visited = new Set([`${row},${col}`]);

  while (queue.length > 0) {
    const [currentRow, currentCol] = queue.pop();
    group.push([currentRow, currentCol]);

    for (const [nextRow, nextCol] of getNeighbors(currentRow, currentCol, source.length)) {
      const stone = source[nextRow][nextCol];
      const key = `${nextRow},${nextCol}`;

      if (stone === EMPTY) {
        liberties.add(key);
      } else if (stone === source[row][col] && !visited.has(key)) {
        visited.add(key);
        queue.push([nextRow, nextCol]);
      }
    }
  }

  return { group, liberties };
}

function removeGroup(source, group) {
  for (const [row, col] of group) {
    source[row][col] = EMPTY;
  }
}

function attemptMoveOnBoard(sourceBoard, history, row, col, player) {
  if (sourceBoard[row][col] !== EMPTY) {
    return { valid: false, message: "该位置已有棋子，请选择其他交叉点。" };
  }

  const nextBoard = cloneBoard(sourceBoard);
  nextBoard[row][col] = player;

  let capturedStones = 0;
  for (const [neighborRow, neighborCol] of getNeighbors(row, col, nextBoard.length)) {
    if (nextBoard[neighborRow][neighborCol] !== oppositePlayer(player)) {
      continue;
    }

    const enemyGroup = collectGroup(nextBoard, neighborRow, neighborCol);
    if (enemyGroup.liberties.size === 0) {
      capturedStones += enemyGroup.group.length;
      removeGroup(nextBoard, enemyGroup.group);
    }
  }

  const ownGroup = collectGroup(nextBoard, row, col);
  if (ownGroup.liberties.size === 0) {
    return { valid: false, message: "这里会形成自杀落子，规则不允许。" };
  }

  const nextPosition = serializeBoard(nextBoard);
  if (history.length >= 2 && nextPosition === history[history.length - 2]) {
    return { valid: false, message: "这里会立即打劫，还原上一局面，暂时不能下。" };
  }

  return { valid: true, nextBoard, capturedStones, nextPosition };
}

function attemptMove(row, col, player) {
  return attemptMoveOnBoard(board, boardHistory, row, col, player);
}

function drawBoard() {
  const { size, padding, grid } = boardMetrics();
  ctx.clearRect(0, 0, size, size);

  const computed = getComputedStyle(body);
  const boardGradient = ctx.createLinearGradient(0, 0, size, size);
  boardGradient.addColorStop(0, computed.getPropertyValue("--board-start").trim() || "#ebc888");
  boardGradient.addColorStop(1, computed.getPropertyValue("--board-end").trim() || "#c78637");
  ctx.fillStyle = boardGradient;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = body.dataset.theme === "ink" ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.08)";
  for (let i = 0; i < 18; i += 1) {
    ctx.fillRect(0, i * 42, size, 12);
  }

  ctx.strokeStyle = body.dataset.theme === "ink" ? "#d7e5f1" : "#6d481f";
  ctx.lineWidth = boardSize <= 9 ? 1.8 : 1.4;

  for (let i = 0; i < boardSize; i += 1) {
    const offset = padding + i * grid;

    ctx.beginPath();
    ctx.moveTo(padding, offset);
    ctx.lineTo(size - padding, offset);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(offset, padding);
    ctx.lineTo(offset, size - padding);
    ctx.stroke();
  }

  ctx.fillStyle = body.dataset.theme === "ink" ? "#d7e5f1" : "#6d481f";
  for (const x of getStarPoints()) {
    for (const y of getStarPoints()) {
      ctx.beginPath();
      ctx.arc(padding + x * grid, padding + y * grid, boardSize <= 9 ? 6 : 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const elapsed = performance.now() - lastMoveAt;
  const animationProgress = Math.min(1, elapsed / 220);
  const animating = lastMove && animationProgress < 1;

  for (let row = 0; row < boardSize; row += 1) {
    for (let col = 0; col < boardSize; col += 1) {
      const stone = board[row][col];
      if (stone === EMPTY) {
        continue;
      }

      const x = padding + col * grid;
      const y = padding + row * grid;
      const baseRadius = grid * 0.44;
      const isLastStone = lastMove && lastMove.row === row && lastMove.col === col;
      const radius = isLastStone ? baseRadius * (0.76 + animationProgress * 0.24) : baseRadius;
      const gradient = ctx.createRadialGradient(
        x - radius * 0.35,
        y - radius * 0.35,
        radius * 0.12,
        x,
        y,
        radius
      );

      if (stone === BLACK) {
        gradient.addColorStop(0, body.dataset.theme === "jade" ? "#2e4038" : "#6b6b6b");
        gradient.addColorStop(0.3, "#222");
        gradient.addColorStop(1, "#050505");
      } else {
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.6, body.dataset.theme === "ink" ? "#cdd9e3" : "#f0f0f0");
        gradient.addColorStop(1, "#cfcfcf");
      }

      ctx.beginPath();
      ctx.fillStyle = gradient;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (lastMove) {
    const x = padding + lastMove.col * grid;
    const y = padding + lastMove.row * grid;
    ctx.beginPath();
    ctx.fillStyle = lastMove.player === BLACK ? "#f6f1db" : "#6b4823";
    ctx.arc(x, y, Math.max(3.5, grid * 0.09), 0, Math.PI * 2);
    ctx.fill();
  }

  if (animating) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(drawBoard);
  }
}

function countInfluence(sourceBoard, player) {
  let influence = 0;
  const center = (sourceBoard.length - 1) / 2;
  for (let row = 0; row < sourceBoard.length; row += 1) {
    for (let col = 0; col < sourceBoard.length; col += 1) {
      if (sourceBoard[row][col] !== player) {
        continue;
      }
      const distanceToCenter = Math.abs(row - center) + Math.abs(col - center);
      influence += Math.max(0, sourceBoard.length - distanceToCenter);
    }
  }
  return influence;
}

function countGroupLiberties(sourceBoard, player) {
  let libertyScore = 0;
  const visited = new Set();
  for (let row = 0; row < sourceBoard.length; row += 1) {
    for (let col = 0; col < sourceBoard.length; col += 1) {
      const key = `${row},${col}`;
      if (sourceBoard[row][col] !== player || visited.has(key)) {
        continue;
      }
      const group = collectGroup(sourceBoard, row, col);
      for (const [groupRow, groupCol] of group.group) {
        visited.add(`${groupRow},${groupCol}`);
      }
      libertyScore += group.liberties.size;
    }
  }
  return libertyScore;
}

function estimateScoreOnBoard(sourceBoard, capturesState = captures) {
  let blackStones = 0;
  let whiteStones = 0;
  let blackTerritory = 0;
  let whiteTerritory = 0;
  let neutral = 0;
  const visited = new Set();

  for (let row = 0; row < sourceBoard.length; row += 1) {
    for (let col = 0; col < sourceBoard.length; col += 1) {
      const stone = sourceBoard[row][col];
      if (stone === BLACK) {
        blackStones += 1;
        continue;
      }
      if (stone === WHITE) {
        whiteStones += 1;
        continue;
      }

      const key = `${row},${col}`;
      if (visited.has(key)) {
        continue;
      }

      const queue = [[row, col]];
      const region = [];
      const owners = new Set();
      visited.add(key);

      while (queue.length > 0) {
        const [currentRow, currentCol] = queue.pop();
        region.push([currentRow, currentCol]);

        for (const [nextRow, nextCol] of getNeighbors(currentRow, currentCol, sourceBoard.length)) {
          const nextStone = sourceBoard[nextRow][nextCol];
          const nextKey = `${nextRow},${nextCol}`;

          if (nextStone === EMPTY && !visited.has(nextKey)) {
            visited.add(nextKey);
            queue.push([nextRow, nextCol]);
          } else if (nextStone !== EMPTY) {
            owners.add(nextStone);
          }
        }
      }

      if (owners.size === 1) {
        if (owners.has(BLACK)) {
          blackTerritory += region.length;
        } else {
          whiteTerritory += region.length;
        }
      } else {
        neutral += region.length;
      }
    }
  }

  const black =
    ruleset === "cn"
      ? blackStones + blackTerritory
      : blackTerritory + capturesState.black;
  const white =
    ruleset === "cn"
      ? whiteStones + whiteTerritory + komi
      : whiteTerritory + capturesState.white + komi;
  const diff = Math.abs(black - white);
  const winner = black > white ? "黑方领先" : "白方领先";

  return {
    black,
    white,
    blackStones,
    whiteStones,
    blackTerritory,
    whiteTerritory,
    neutral,
    summary: `${winner} ${diff.toFixed(1)} 目。按${RULESET_CONFIG[ruleset].label}估算，白贴 ${komi} 目。`,
  };
}

function estimateWinrate(scoreEstimate) {
  const diff = scoreEstimate.black - scoreEstimate.white;
  const blackChance = 100 / (1 + Math.exp(-diff / 5.5));
  return {
    black: Math.max(0, Math.min(100, blackChance)),
    white: Math.max(0, Math.min(100, 100 - blackChance)),
  };
}

function determinePhase() {
  const occupied = moveHistory.filter((move) => move.type === "move").length;
  const total = boardSize * boardSize;
  if (occupied < total * 0.18) {
    return "布局阶段，角地与边上效率仍然最关键。";
  }
  if (occupied < total * 0.48) {
    return "中盘阶段，战斗与厚薄正在快速放大局势差。";
  }
  return "官子阶段，细小先手和收束质量决定最终胜负。";
}

function updateEvaluationPanel(forceSummary) {
  const estimate = scoreResult || estimateScoreOnBoard(board, captures);
  const winrate = estimateWinrate(estimate);
  blackScore.textContent = estimate.black.toFixed(1);
  whiteScore.textContent = estimate.white.toFixed(1);
  blackWinrate.textContent = `${winrate.black.toFixed(1)}%`;
  whiteWinrate.textContent = `${winrate.white.toFixed(1)}%`;
  scoreSummary.textContent = forceSummary || estimate.summary;
  phaseText.textContent = determinePhase();
}

function createMoveRecord(data) {
  return {
    ...data,
    snapshot: serializeBoard(board),
    captures: { ...captures },
    currentPlayerAfter: currentPlayer,
    consecutivePassesAfter: consecutivePasses,
    lastMoveAfter: lastMove ? { ...lastMove } : null,
    gameOverAfter: gameOver,
    scoreResultAfter: scoreResult ? { ...scoreResult } : null,
    boardSizeAfter: boardSize,
    modeAfter: gameMode,
    rulesetAfter: ruleset,
    komiAfter: komi,
    aiLevelAfter: aiLevel,
  };
}

function setThinkingState(active) {
  aiThinking = active;
  boardFrame.classList.toggle("is-thinking", active);
}

function clearAiTimer() {
  if (aiTimeoutId) {
    clearTimeout(aiTimeoutId);
    aiTimeoutId = 0;
  }
}

function setActiveSegments() {
  for (const button of sizeButtons) {
    button.classList.toggle("is-active", Number(button.dataset.size) === boardSize);
  }
  for (const button of modeButtons) {
    button.classList.toggle("is-active", button.dataset.mode === gameMode);
  }
  for (const button of aiLevelButtons) {
    button.classList.toggle("is-active", button.dataset.aiLevel === aiLevel);
  }
  for (const button of rulesetButtons) {
    button.classList.toggle("is-active", button.dataset.ruleset === ruleset);
  }
  for (const button of themeButtons) {
    button.classList.toggle("is-active", button.dataset.theme === theme);
  }
  for (const button of soundButtons) {
    button.classList.toggle("is-active", button.dataset.sound === soundProfile);
  }
}

function updateReviewStatus() {
  if (reviewIndex === null) {
    reviewStatus.textContent = "当前处于实时对局视角。";
    return;
  }
  if (reviewIndex === -1) {
    reviewStatus.textContent = "正在复盘开局前局面。";
    return;
  }
  reviewStatus.textContent = `正在复盘第 ${reviewIndex + 1} 手：${moveHistory[reviewIndex].label}`;
}

function renderHistoryList() {
  historyList.innerHTML = "";

  if (moveHistory.length === 0) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "history-item";
    button.textContent = "暂无着手记录";
    button.disabled = true;
    item.appendChild(button);
    historyList.appendChild(item);
    updateReviewStatus();
    return;
  }

  const activeIndex = reviewIndex === null ? moveHistory.length - 1 : reviewIndex;
  moveHistory.forEach((move, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "history-item";
    button.textContent = move.label;
    if (index === activeIndex) {
      button.classList.add("is-active");
    }
    button.addEventListener("click", () => enterReview(index));
    item.appendChild(button);
    historyList.appendChild(item);
  });

  updateReviewStatus();
}

function updateSidebar() {
  blackCaptures.textContent = String(captures.black);
  whiteCaptures.textContent = String(captures.white);
  moveCount.textContent = String(moveHistory.length);
  boardLabel.textContent = getBoardLabel();
  rulesBoardText.textContent = `棋盘当前为 ${getBoardLabel()}，黑棋先行。`;
  rulesetText.textContent = `当前按${RULESET_CONFIG[ruleset].label}估算，白贴 ${komi} 目。`;
  komiText.textContent = `当前贴目：${komi} 目`;
  renderHistoryList();
  updateEvaluationPanel();
}

function updateStatus(message, detail) {
  if (isReviewing()) {
    turnBadge.textContent = "复盘模式";
  } else if (gameOver) {
    turnBadge.textContent = "对局已结束";
  } else if (aiThinking) {
    turnBadge.textContent = "AI 思考中";
  } else {
    const suffix = gameMode === "ai" ? ` · AI ${AI_LEVELS[aiLevel].label}` : " · 双人对弈";
    turnBadge.textContent = `${playerName(currentPlayer)}行棋${suffix}`;
  }
  statusText.textContent = message;
  detailText.textContent = detail;
}

function applyTheme(nextTheme) {
  theme = nextTheme;
  if (theme === "classic") {
    delete body.dataset.theme;
  } else {
    body.dataset.theme = theme;
  }
  drawBoard();
  setActiveSegments();
}

function playStoneSound(capturedStones = 0) {
  const AudioContextRef = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextRef) {
    return;
  }

  if (!audioContext) {
    audioContext = new AudioContextRef();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  const profile = SOUND_PROFILES[soundProfile];
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = profile.type;
  oscillator.frequency.setValueAtTime(capturedStones > 0 ? profile.hit : profile.base, now);
  oscillator.frequency.exponentialRampToValueAtTime(profile.base * 0.75, now + 0.16);
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(profile.gain, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.19);
}

function resetReviewState() {
  reviewIndex = null;
}

function syncStateFromRecord(record) {
  if (!record) {
    board = createEmptyBoard(boardSize);
    currentPlayer = BLACK;
    captures = { black: 0, white: 0 };
    consecutivePasses = 0;
    gameOver = false;
    lastMove = null;
    scoreResult = null;
    lastMoveAt = 0;
    return;
  }

  boardSize = record.boardSizeAfter;
  gameMode = record.modeAfter;
  ruleset = record.rulesetAfter;
  komi = record.komiAfter;
  aiLevel = record.aiLevelAfter;
  board = deserializeBoard(record.snapshot);
  captures = { ...record.captures };
  currentPlayer = record.currentPlayerAfter;
  consecutivePasses = record.consecutivePassesAfter;
  gameOver = record.gameOverAfter;
  scoreResult = record.scoreResultAfter ? { ...record.scoreResultAfter } : null;
  lastMove = record.lastMoveAfter ? { ...record.lastMoveAfter } : null;
  lastMoveAt = performance.now();
}

function syncReviewPosition() {
  clearAiTimer();
  setThinkingState(false);

  if (reviewIndex === null) {
    syncStateFromRecord(moveHistory[moveHistory.length - 1] || null);
  } else if (reviewIndex === -1) {
    syncStateFromRecord(null);
  } else {
    syncStateFromRecord(moveHistory[reviewIndex]);
  }

  boardHistory = [serializeBoard(createEmptyBoard(boardSize)), ...moveHistory.map((move) => move.snapshot)];
  setActiveSegments();
  drawBoard();
  updateSidebar();
}

function enterReview(index) {
  reviewIndex = index;
  syncReviewPosition();
  updateStatus("正在复盘历史局面", "点击“返回实战”即可回到当前对局。");
}

function returnToLive() {
  reviewIndex = null;
  syncReviewPosition();
  updateStatus(
    gameOver ? "已回到终局局面" : "已回到实时对局",
    gameOver ? scoreResult.summary : `现在轮到 ${playerName(currentPlayer)}。`
  );
  scheduleAiTurnIfNeeded();
}

function buildCaptureState(baseCaptures, player, capturedStones) {
  return {
    black: baseCaptures.black + (player === BLACK ? capturedStones : 0),
    white: baseCaptures.white + (player === WHITE ? capturedStones : 0),
  };
}

function countAdjacentFriendlies(sourceBoard, row, col, player) {
  return getNeighbors(row, col, sourceBoard.length).filter(
    ([nextRow, nextCol]) => sourceBoard[nextRow][nextCol] === player
  ).length;
}

function getCandidatePoints(sourceBoard) {
  const size = sourceBoard.length;
  const occupied = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (sourceBoard[row][col] !== EMPTY) {
        occupied.push([row, col]);
      }
    }
  }

  if (occupied.length === 0) {
    const center = Math.floor(size / 2);
    const points = [[center, center]];
    for (const star of STAR_POINTS[size] || []) {
      points.push([star, star], [star, size - 1 - star], [size - 1 - star, star]);
    }
    return points;
  }

  const candidates = new Set();
  for (const [row, col] of occupied) {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const nextRow = row + dy;
        const nextCol = col + dx;
        if (
          nextRow >= 0 &&
          nextRow < size &&
          nextCol >= 0 &&
          nextCol < size &&
          sourceBoard[nextRow][nextCol] === EMPTY
        ) {
          candidates.add(`${nextRow},${nextCol}`);
        }
      }
    }
  }

  return Array.from(candidates, (entry) => entry.split(",").map(Number));
}

function evaluateStaticPosition(sourceBoard, maximizingPlayer, capturesState, settings) {
  const estimate = estimateScoreOnBoard(sourceBoard, capturesState);
  const scoreDiff =
    maximizingPlayer === BLACK ? estimate.black - estimate.white : estimate.white - estimate.black;
  const libertyDiff =
    countGroupLiberties(sourceBoard, maximizingPlayer) -
    countGroupLiberties(sourceBoard, oppositePlayer(maximizingPlayer));
  const influenceDiff =
    countInfluence(sourceBoard, maximizingPlayer) - countInfluence(sourceBoard, oppositePlayer(maximizingPlayer));
  const territoryWeight = settings.territoryBias * 18;

  return scoreDiff * territoryWeight + libertyDiff * 2.8 + influenceDiff * 0.18;
}

function generateCandidateMoves(sourceBoard, history, player, capturesState, settings) {
  const candidates = [];
  const center = (sourceBoard.length - 1) / 2;

  for (const [row, col] of getCandidatePoints(sourceBoard)) {
    const result = attemptMoveOnBoard(sourceBoard, history, row, col, player);
    if (!result.valid) {
      continue;
    }

    const nextCaptures = buildCaptureState(capturesState, player, result.capturedStones);
    const ownGroup = collectGroup(result.nextBoard, row, col);
    const distanceToCenter = Math.abs(row - center) + Math.abs(col - center);
    const localBonus =
      result.capturedStones * 40 * settings.captureBias +
      ownGroup.liberties.size * 4 +
      countAdjacentFriendlies(result.nextBoard, row, col, player) * 3 -
      distanceToCenter;
    const staticScore = evaluateStaticPosition(result.nextBoard, player, nextCaptures, settings);

    candidates.push({
      row,
      col,
      result,
      nextCaptures,
      score: staticScore + localBonus,
    });
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates.slice(0, settings.candidateLimit);
}

function minimax(sourceBoard, history, capturesState, playerToMove, maximizingPlayer, depth, settings, alpha, beta) {
  if (depth === 0) {
    return evaluateStaticPosition(sourceBoard, maximizingPlayer, capturesState, settings);
  }

  const candidates = generateCandidateMoves(sourceBoard, history, playerToMove, capturesState, settings);
  if (candidates.length === 0) {
    return evaluateStaticPosition(sourceBoard, maximizingPlayer, capturesState, settings);
  }

  if (playerToMove === maximizingPlayer) {
    let best = -Infinity;
    for (const candidate of candidates) {
      const nextHistory = [...history, candidate.result.nextPosition];
      const value = minimax(
        candidate.result.nextBoard,
        nextHistory,
        candidate.nextCaptures,
        oppositePlayer(playerToMove),
        maximizingPlayer,
        depth - 1,
        settings,
        alpha,
        beta
      );
      best = Math.max(best, value);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) {
        break;
      }
    }
    return best;
  }

  let best = Infinity;
  for (const candidate of candidates) {
    const nextHistory = [...history, candidate.result.nextPosition];
    const value = minimax(
      candidate.result.nextBoard,
      nextHistory,
      candidate.nextCaptures,
      oppositePlayer(playerToMove),
      maximizingPlayer,
      depth - 1,
      settings,
      alpha,
      beta
    );
    best = Math.min(best, value);
    beta = Math.min(beta, best);
    if (beta <= alpha) {
      break;
    }
  }
  return best;
}

function chooseAiMove() {
  const settings = AI_LEVELS[aiLevel];
  const candidates = generateCandidateMoves(board, boardHistory, WHITE, captures, settings);
  if (candidates.length === 0) {
    return null;
  }

  let bestMove = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const historyAfterMove = [...boardHistory, candidate.result.nextPosition];
    const replyScore = minimax(
      candidate.result.nextBoard,
      historyAfterMove,
      candidate.nextCaptures,
      BLACK,
      WHITE,
      settings.searchDepth,
      settings,
      -Infinity,
      Infinity
    );
    const finalScore = candidate.score * settings.replyWeight + replyScore * (1 - settings.replyWeight + 0.85);
    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestMove = candidate;
    }
  }

  return bestMove;
}

function commitMove(result, row, col, player = currentPlayer, source = "human") {
  board = result.nextBoard;
  captures = buildCaptureState(captures, player, result.capturedStones);
  consecutivePasses = 0;
  lastMove = { row, col, player };
  lastMoveAt = performance.now();
  currentPlayer = oppositePlayer(player);
  gameOver = false;
  scoreResult = null;
  reviewIndex = null;

  const actor = source === "ai" ? "AI" : playerStone(player);
  moveHistory.push(
    createMoveRecord({
      type: "move",
      player,
      row,
      col,
      capturedStones: result.capturedStones,
      label: `${moveHistory.length + 1}. ${actor} ${formatCoordinate(row, col)}${
        result.capturedStones > 0 ? `，提子 ${result.capturedStones}` : ""
      }`,
    })
  );
  boardHistory.push(serializeBoard(board));

  playStoneSound(result.capturedStones);
  drawBoard();
  updateSidebar();
  updateStatus(
    `${actor}已落子 ${formatCoordinate(row, col)}`,
    result.capturedStones > 0
      ? `本手提走 ${result.capturedStones} 子，现在轮到 ${playerName(currentPlayer)}。`
      : `没有提子，现在轮到 ${playerName(currentPlayer)}。`
  );
  scheduleAiTurnIfNeeded();
}

function handlePass(source = "human") {
  if (gameOver) {
    updateStatus("对局已结束", "请重新开始新的一局，或悔棋回到之前的局面。");
    return;
  }

  const passingPlayer = currentPlayer;
  const actor = source === "ai" ? "AI" : playerStone(passingPlayer);
  consecutivePasses += 1;
  currentPlayer = oppositePlayer(currentPlayer);
  lastMove = null;
  reviewIndex = null;

  if (consecutivePasses >= 2) {
    gameOver = true;
    scoreResult = estimateScoreOnBoard(board, captures);
  } else {
    gameOver = false;
    scoreResult = null;
  }

  moveHistory.push(
    createMoveRecord({
      type: "pass",
      player: passingPlayer,
      label: `${moveHistory.length + 1}. ${actor} 停一手`,
    })
  );
  boardHistory.push(serializeBoard(board));

  drawBoard();
  updateSidebar();

  if (gameOver) {
    updateStatus("双方连续停一手", `对局进入终局状态。${scoreResult.summary}`);
    return;
  }

  updateStatus(`${actor}选择停一手`, `现在轮到 ${playerName(currentPlayer)}。若双方连续停一手则结束对局。`);
  scheduleAiTurnIfNeeded();
}

function handleUndo() {
  if (moveHistory.length === 0) {
    updateStatus("当前没有可悔的着手", "请先落子或停一手。");
    return;
  }

  if (isReviewing()) {
    updateStatus("请先返回实战", "复盘模式下不能直接悔棋。");
    return;
  }

  clearAiTimer();
  setThinkingState(false);

  if (gameMode === "ai") {
    const last = moveHistory[moveHistory.length - 1];
    moveHistory.pop();
    if (last && last.player === WHITE && moveHistory.length > 0) {
      moveHistory.pop();
    }
  } else {
    moveHistory.pop();
  }

  syncStateFromRecord(moveHistory[moveHistory.length - 1] || null);
  boardHistory = [serializeBoard(createEmptyBoard(boardSize)), ...moveHistory.map((move) => move.snapshot)];
  drawBoard();
  updateSidebar();
  updateStatus(
    moveHistory.length === 0 ? "已回到开局" : "已悔棋",
    `现在轮到 ${playerName(currentPlayer)}。`
  );
}

function scheduleAiTurnIfNeeded() {
  clearAiTimer();
  if (!isAiTurn() || gameOver) {
    setThinkingState(false);
    return;
  }

  setThinkingState(true);
  updateStatus("AI 正在思考", `${AI_LEVELS[aiLevel].label} AI 正在评估提子、厚薄与后续反击。`);

  aiTimeoutId = window.setTimeout(() => {
    setThinkingState(false);
    const aiMove = chooseAiMove();
    if (!aiMove) {
      handlePass("ai");
      return;
    }
    commitMove(aiMove.result, aiMove.row, aiMove.col, WHITE, "ai");
  }, aiLevel === "deep" ? 700 : 450);
}

function resetGame(options = {}) {
  clearAiTimer();
  setThinkingState(false);

  if (typeof options.boardSize === "number") {
    boardSize = options.boardSize;
  }
  if (typeof options.gameMode === "string") {
    gameMode = options.gameMode;
  }
  if (typeof options.aiLevel === "string") {
    aiLevel = options.aiLevel;
  }
  if (typeof options.ruleset === "string") {
    ruleset = options.ruleset;
    komi = RULESET_CONFIG[ruleset].komi;
  }

  board = createEmptyBoard(boardSize);
  currentPlayer = BLACK;
  captures = { black: 0, white: 0 };
  moveHistory = [];
  boardHistory = [serializeBoard(board)];
  consecutivePasses = 0;
  gameOver = false;
  lastMove = null;
  lastMoveAt = 0;
  scoreResult = null;
  reviewIndex = null;

  setActiveSegments();
  drawBoard();
  updateSidebar();
  updateStatus("请选择交叉点落子", `${getBoardLabel()}棋盘已就绪，当前按${RULESET_CONFIG[ruleset].label}计算。`);
}

function setBoardSize(nextSize) {
  if (!BOARD_OPTIONS.includes(nextSize) || nextSize === boardSize) {
    return;
  }
  resetGame({ boardSize: nextSize, gameMode, aiLevel, ruleset });
}

function setGameMode(nextMode) {
  if (!["pvp", "ai"].includes(nextMode) || nextMode === gameMode) {
    return;
  }
  resetGame({ boardSize, gameMode: nextMode, aiLevel, ruleset });
}

function setAiLevel(nextLevel) {
  if (!AI_LEVELS[nextLevel] || nextLevel === aiLevel) {
    return;
  }
  resetGame({ boardSize, gameMode, aiLevel: nextLevel, ruleset });
  updateStatus("AI 棋力已切换", `当前为 ${AI_LEVELS[aiLevel].label} 模式，棋局已按新强度重开。`);
}

function setRuleset(nextRuleset) {
  if (!RULESET_CONFIG[nextRuleset] || nextRuleset === ruleset) {
    return;
  }
  resetGame({ boardSize, gameMode, aiLevel, ruleset: nextRuleset });
}

function handleBoardClick(event) {
  if (gameOver) {
    updateStatus("对局已结束", "请点击重新开始，或使用复盘查看历史局面。");
    return;
  }
  if (isReviewing()) {
    updateStatus("当前处于复盘模式", "请先点击“返回实战”再继续落子。");
    return;
  }
  if (isAiTurn() || aiThinking) {
    updateStatus("请稍候", "当前轮到 AI 行棋。");
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (canvas.width / rect.width);
  const y = (event.clientY - rect.top) * (canvas.height / rect.height);
  const { padding, grid } = boardMetrics();
  const col = Math.round((x - padding) / grid);
  const row = Math.round((y - padding) / grid);

  if (row < 0 || row >= boardSize || col < 0 || col >= boardSize) {
    return;
  }
  const boardX = padding + col * grid;
  const boardY = padding + row * grid;
  if (Math.hypot(boardX - x, boardY - y) > grid * 0.46) {
    return;
  }

  const result = attemptMove(row, col, currentPlayer);
  if (!result.valid) {
    updateStatus("该手无效", result.message);
    return;
  }

  commitMove(result, row, col, currentPlayer, "human");
}

function coordinateToSgf(row, col) {
  return `${String.fromCharCode(97 + col)}${String.fromCharCode(97 + row)}`;
}

function sgfToCoordinate(token) {
  if (!token || token.length !== 2) {
    return null;
  }
  return {
    row: token.charCodeAt(1) - 97,
    col: token.charCodeAt(0) - 97,
  };
}

function exportSgf() {
  const moves = moveHistory
    .map((move) => {
      const color = move.player === BLACK ? "B" : "W";
      return move.type === "pass" ? `;${color}[]` : `;${color}[${coordinateToSgf(move.row, move.col)}]`;
    })
    .join("");

  const sgf = `(;GM[1]FF[4]CA[UTF-8]AP[Codex:WeiQi]SZ[${boardSize}]KM[${komi}]RU[${
    RULESET_CONFIG[ruleset].label
  }]PB[Black]PW[${gameMode === "ai" ? `AI-${AI_LEVELS[aiLevel].label}` : "White"}]${moves})`;

  const blob = new Blob([sgf], { type: "application/x-go-sgf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `weiqi-${boardSize}x${boardSize}-${Date.now()}.sgf`;
  link.click();
  URL.revokeObjectURL(url);
  updateStatus("SGF 已导出", "当前棋局已导出，包含棋盘尺寸、规则流派与贴目。");
}

function importSgfText(text) {
  const sizeMatch = text.match(/SZ\[(\d+)\]/);
  const rulesetMatch = text.match(/RU\[(.*?)\]/);
  const komiMatch = text.match(/KM\[(.*?)\]/);
  const size = sizeMatch ? Number(sizeMatch[1]) : 19;
  const importedRuleset = rulesetMatch && rulesetMatch[1].includes("日本") ? "jp" : "cn";
  const importedKomi = komiMatch ? Number(komiMatch[1]) : RULESET_CONFIG[importedRuleset].komi;

  if (!BOARD_OPTIONS.includes(size)) {
    throw new Error("暂不支持该 SGF 棋盘尺寸，仅支持 9 / 13 / 19 路。");
  }

  ruleset = importedRuleset;
  komi = Number.isFinite(importedKomi) ? importedKomi : RULESET_CONFIG[importedRuleset].komi;
  resetGame({ boardSize: size, gameMode: "pvp", aiLevel, ruleset });
  komi = Number.isFinite(importedKomi) ? importedKomi : RULESET_CONFIG[importedRuleset].komi;

  const sequence = Array.from(text.matchAll(/;([BW])\[(.*?)\]/g)).map((match) => ({
    color: match[1],
    point: match[2],
  }));

  for (const entry of sequence) {
    const expected = entry.color === "B" ? BLACK : WHITE;
    if (currentPlayer !== expected) {
      throw new Error("SGF 着手顺序异常，无法导入。");
    }
    if (entry.point === "") {
      handlePass("human");
      continue;
    }

    const point = sgfToCoordinate(entry.point);
    if (!point || point.row < 0 || point.row >= boardSize || point.col < 0 || point.col >= boardSize) {
      throw new Error("SGF 中包含超出棋盘范围的着手。");
    }

    const result = attemptMove(point.row, point.col, currentPlayer);
    if (!result.valid) {
      throw new Error(`SGF 中存在非法着手：${entry.color}[${entry.point}]`);
    }

    commitMove(result, point.row, point.col, currentPlayer, "human");
  }

  updateSidebar();
  updateStatus("SGF 导入成功", `已导入 ${sequence.length} 手棋，并切换到复盘友好的双人模式。`);
}

function handleImportFile(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      importSgfText(String(reader.result || ""));
    } catch (error) {
      updateStatus("SGF 导入失败", error.message);
    } finally {
      importInput.value = "";
    }
  };
  reader.readAsText(file, "utf-8");
}

canvas.addEventListener("click", handleBoardClick);
passButton.addEventListener("click", () => {
  if (isReviewing()) {
    updateStatus("当前处于复盘模式", "请先返回实战再停一手。");
    return;
  }
  if (isAiTurn() || aiThinking) {
    updateStatus("请稍候", "当前轮到 AI 行棋。");
    return;
  }
  handlePass("human");
});
undoButton.addEventListener("click", handleUndo);
resetButton.addEventListener("click", () => resetGame({ boardSize, gameMode, aiLevel, ruleset }));
scoreButton.addEventListener("click", () => {
  const estimate = estimateScoreOnBoard(board, captures);
  scoreResult = estimate;
  updateSidebar();
  updateStatus("已完成自动数目", estimate.summary);
});
exportButton.addEventListener("click", exportSgf);
importButton.addEventListener("click", () => importInput.click());
importInput.addEventListener("change", handleImportFile);
prevButton.addEventListener("click", () => {
  if (moveHistory.length === 0) {
    return;
  }
  if (reviewIndex === null) {
    enterReview(moveHistory.length - 1);
    return;
  }
  enterReview(Math.max(-1, reviewIndex - 1));
});
nextButton.addEventListener("click", () => {
  if (moveHistory.length === 0) {
    return;
  }
  if (reviewIndex === null) {
    return;
  }
  if (reviewIndex >= moveHistory.length - 1) {
    returnToLive();
    return;
  }
  enterReview(reviewIndex + 1);
});
liveButton.addEventListener("click", returnToLive);

for (const button of sizeButtons) {
  button.addEventListener("click", () => setBoardSize(Number(button.dataset.size)));
}
for (const button of modeButtons) {
  button.addEventListener("click", () => setGameMode(button.dataset.mode));
}
for (const button of aiLevelButtons) {
  button.addEventListener("click", () => setAiLevel(button.dataset.aiLevel));
}
for (const button of rulesetButtons) {
  button.addEventListener("click", () => setRuleset(button.dataset.ruleset));
}
for (const button of themeButtons) {
  button.addEventListener("click", () => applyTheme(button.dataset.theme));
}
for (const button of soundButtons) {
  button.addEventListener("click", () => {
    soundProfile = button.dataset.sound;
    setActiveSegments();
    updateStatus("音效风格已切换", `当前音色为 ${button.textContent}。`);
  });
}

applyTheme(theme);
resetGame({ boardSize, gameMode, aiLevel, ruleset });
