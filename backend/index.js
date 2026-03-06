const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const rooms = new Map();

// ============================================================
// BOT CONFIGURATION
// ============================================================

const BOT_CONFIG = {
  noob: {
    names: ['Wobbly', 'Fumbles', 'Dizzy', 'Bumble', 'Clumsy', 'Derpy', 'Goofy'],
    prefix: '[Noob]',
    delayMin: 4000,
    delayMax: 9000,
    // Probability of ignoring binary search and guessing randomly
    errorRate: 0.55
  },
  alright: {
    names: ['Casey', 'Jordan', 'Morgan', 'Riley', 'Avery', 'Quinn', 'Drew'],
    prefix: '[Alright]',
    delayMin: 2000,
    delayMax: 4500,
    errorRate: 0.18
  },
  legend: {
    names: ['Sigma', 'Apex', 'Titan', 'Viper', 'Ghost', 'Reaper', 'Blaze'],
    prefix: '[Legend]',
    delayMin: 700,
    delayMax: 1600,
    errorRate: 0
  },
  ai: {
    names: ['NeuralX', 'Cortex', 'Axiom', 'Vertex', 'Nexus', 'Cipher', 'Pulse'],
    prefix: '[AI]',
    delayMin: 180,
    delayMax: 550,
    errorRate: 0
  }
};

// ============================================================
// BOT HELPERS
// ============================================================

function getBotDelay(tier) {
  const c = BOT_CONFIG[tier];
  return c.delayMin + Math.random() * (c.delayMax - c.delayMin);
}

// Returns a guess based on tier strategy.
// noob/alright: sometimes ignores learned range and guesses randomly.
// legend/ai: always uses binary search midpoint.
function makeBotGuess(tier, low, high, maxNumber) {
  const c = BOT_CONFIG[tier];
  if (Math.random() < c.errorRate) {
    return Math.floor(Math.random() * maxNumber) + 1;
  }
  return Math.floor((low + high) / 2);
}

// legend/ai: pick opponent with highest guess-count ratio (most vulnerable).
// noob/alright: random opponent.
function selectBotTarget(bot, room) {
  const opponents = room.players.filter(p => p.isAlive && p.id !== bot.id);
  if (opponents.length === 0) return null;

  if (bot.botTier === 'ai' || bot.botTier === 'legend') {
    let best = opponents[0];
    let bestScore = -1;
    for (const opp of opponents) {
      const td = room.eliminationTargets[opp.id];
      if (td) {
        const score = td.guessCount / room.maxGuessesPerTarget;
        if (score > bestScore) { bestScore = score; best = opp; }
      }
    }
    return best.id;
  }
  return opponents[Math.floor(Math.random() * opponents.length)].id;
}

function clearAllBotTimeouts(room) {
  if (!room.botTimeouts) return;
  for (const t of Object.values(room.botTimeouts)) clearTimeout(t);
  room.botTimeouts = {};
}

// ============================================================
// SHARED ELIMINATION GUESS PROCESSOR
// Called by both human socket handler and bot runner.
// Returns { gameEnded, resultMap, rerolledIds }
// ============================================================

function processEliminationGuess(room, roomId, guesserId, targetIdOrNull, numGuess) {
  const guesser = room.players.find(p => p.id === guesserId);
  if (!guesser || !guesser.isAlive) return { gameEnded: false, resultMap: {}, rerolledIds: [] };

  let targetIds;
  if (targetIdOrNull === null) {
    targetIds = room.players.filter(p => p.isAlive && p.id !== guesserId).map(p => p.id);
  } else {
    const tp = room.players.find(p => p.id === targetIdOrNull && p.isAlive && p.id !== guesserId);
    if (!tp) return { gameEnded: false, resultMap: {}, rerolledIds: [] };
    targetIds = [targetIdOrNull];
  }

  let gameEnded = false;
  const resultMap = {};
  const rerolledIds = [];

  for (const tid of targetIds) {
    if (gameEnded) break;

    const target = room.players.find(p => p.id === tid);
    const targetData = room.eliminationTargets[tid];
    if (!target || !targetData) continue;

    targetData.guessCount++;
    if (!targetData.guessCountByGuesser) targetData.guessCountByGuesser = {};
    targetData.guessCountByGuesser[guesserId] = (targetData.guessCountByGuesser[guesserId] || 0) + 1;

    let result;
    if (numGuess === targetData.secretNumber) result = 'correct';
    else if (numGuess < targetData.secretNumber) result = 'higher';
    else result = 'lower';

    resultMap[tid] = result;

    const logEntry = {
      guesserUsername: guesser.username,
      guesserSocketId: guesserId,
      targetUsername: target.username,
      targetSocketId: tid,
      guess: numGuess,
      result
    };
    room.eliminationLog.push(logEntry);
    io.to(roomId).emit('eliminationGuessResult', logEntry);

    if (result === 'correct') {
      target.isAlive = false;
      targetData.eliminatedBy = guesserId;
      guesser.eliminations++;
      if (room.eliminationScores[guesserId]) room.eliminationScores[guesserId].eliminations++;

      io.to(roomId).emit('playerEliminated', {
        eliminatedId: tid,
        eliminatedUsername: target.username,
        eliminatorId: guesserId,
        eliminatorUsername: guesser.username
      });

      const alivePlayers = room.players.filter(p => p.isAlive);
      if (alivePlayers.length === 1) {
        room.survivorId = alivePlayers[0].id;
        room.gameState = 'FINISHED';
        const finalScoreboard = buildEliminationScoreboard(room);
        clearAllBotTimeouts(room);
        io.to(roomId).emit('gameState', {
          gameState: 'FINISHED',
          gameMode: 'elimination',
          eliminationResults: finalScoreboard
        });
        gameEnded = true;
      }

    } else {
      const guesserCount = targetData.guessCountByGuesser[guesserId] || 0;
      const hitGuesserLimit = guesserCount >= room.maxGuessesPerGuesser;
      const hitGlobalLimit  = targetData.guessCount >= room.maxGuessesPerTarget;

      if (hitGlobalLimit) {
        // Full reroll: new secret number, reset all counts
        const newNumber = Math.floor(Math.random() * room.maxNumber) + 1;
        targetData.secretNumber = newNumber;
        targetData.guessCount = 0;
        targetData.guessCountByGuesser = {};
        targetData.eliminatedBy = null;
        rerolledIds.push(tid); // bots will reset their range

        io.to(roomId).emit('targetRerolled', {
          targetUsername: target.username,
          targetSocketId: tid,
          fullReroll: true,
          reason: `Max guesses (${room.maxGuessesPerTarget}) reached — new number for ${target.username}!`
        });
      } else if (hitGuesserLimit) {
        // Per-guesser cooldown: only reset this guesser's count; number stays the same
        targetData.guessCountByGuesser[guesserId] = 0;
        // Do NOT add to rerolledIds — bot ranges stay valid (number hasn't changed)

        io.to(roomId).emit('targetRerolled', {
          targetUsername: target.username,
          targetSocketId: tid,
          fullReroll: false,
          reason: `${guesser.username} used all their guesses on ${target.username} — their count reset!`
        });
      }
    }
  }

  if (!gameEnded) io.to(roomId).emit('playerList', room.players);
  return { gameEnded, resultMap, rerolledIds };
}

// ============================================================
// BOT ACTION RUNNER
// ============================================================

function scheduleBotAction(roomId, botId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const bot = room.players.find(p => p.id === botId && p.isBot);
  if (!bot) return;

  if (!room.botTimeouts) room.botTimeouts = {};
  if (room.botTimeouts[botId]) clearTimeout(room.botTimeouts[botId]);

  room.botTimeouts[botId] = setTimeout(() => {
    const r = rooms.get(roomId);
    if (!r || r.gameState !== 'PLAYING') return;
    const b = r.players.find(p => p.id === botId && p.isBot && p.isAlive);
    if (!b) return;

    if (r.gameMode === 'classic') runBotClassic(roomId, r, b);
    else if (r.gameMode === 'elimination') runBotElimination(roomId, r, b);
  }, getBotDelay(bot.botTier));
}

function runBotClassic(roomId, room, bot) {
  if (bot.finishTime) return;

  const guess = makeBotGuess(bot.botTier, bot.botLow ?? 1, bot.botHigh ?? room.maxNumber, room.maxNumber);

  if (guess === room.winningNumber) {
    const finishTime = Date.now();
    bot.finishTime = finishTime;
    const duration = (finishTime - room.gameStartTime) / 1000;
    room.results.push({ username: bot.username, time: duration });
    room.results.sort((a, b) => a.time - b.time);
    io.to(roomId).emit('playerFinished', { username: bot.username, results: room.results.slice(0, 3) });

    if (room.results.length === room.players.length) {
      room.gameState = 'FINISHED';
      clearAllBotTimeouts(room);
      io.to(roomId).emit('gameState', {
        gameState: room.gameState,
        maxNumber: room.maxNumber,
        finalResults: room.results.slice(0, 3)
      });
    }
  } else {
    if (guess < room.winningNumber) bot.botLow = guess + 1;
    else bot.botHigh = guess - 1;
    scheduleBotAction(roomId, bot.id);
  }
}

function runBotElimination(roomId, room, bot) {
  const targetId = selectBotTarget(bot, room);
  if (!targetId) { scheduleBotAction(roomId, bot.id); return; }

  if (!bot.botTargetRanges) bot.botTargetRanges = {};
  if (!bot.botTargetRanges[targetId]) bot.botTargetRanges[targetId] = { low: 1, high: room.maxNumber };

  const { low, high } = bot.botTargetRanges[targetId];
  const guess = makeBotGuess(bot.botTier, low, high, room.maxNumber);

  const { gameEnded, resultMap, rerolledIds } = processEliminationGuess(room, roomId, bot.id, targetId, guess);

  if (!gameEnded) {
    const result = resultMap[targetId];
    if (result === 'correct' || rerolledIds.includes(targetId)) {
      delete bot.botTargetRanges[targetId];
    } else if (result === 'higher') {
      bot.botTargetRanges[targetId].low = guess + 1;
    } else if (result === 'lower') {
      bot.botTargetRanges[targetId].high = guess - 1;
    }
    scheduleBotAction(roomId, bot.id);
  }
}

// ============================================================
// UTILITIES
// ============================================================

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

function getRoom(socket) {
  for (const [roomId, room] of rooms.entries()) {
    if (room.players.find(p => p.id === socket.id)) return { roomId, room };
  }
  return null;
}

function buildEliminationScoreboard(room) {
  return room.players.map(p => ({
    id: p.id,
    username: p.username,
    eliminations: p.eliminations || 0,
    isAlive: p.isAlive,
    isSurvivor: p.id === room.survivorId,
    isBot: p.isBot || false
  })).sort((a, b) => {
    if (a.isSurvivor) return -1;
    if (b.isSurvivor) return 1;
    return b.eliminations - a.eliminations;
  });
}

// ============================================================
// SOCKET HANDLERS
// ============================================================

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('createRoom', ({ username }) => {
    const roomId = generateRoomId();
    const room = {
      gameState: 'LOBBY',
      players: [],
      maxNumber: 1000,
      playerLimit: 2,
      winningNumber: null,
      results: [],
      gameStartTime: null,
      hostId: socket.id,
      gameMode: 'classic',
      guessMode: 'single',
      maxGuessesPerTarget: 20,
      maxGuessesPerGuesser: 10,  // 50% of maxGuessesPerTarget default
      eliminationTargets: {},
      eliminationLog: [],
      eliminationScores: {},
      survivorId: null,
      botTimeouts: {}
    };

    const player = { id: socket.id, username, finishTime: null, isHost: true, isReady: true, isAlive: true, isSetupComplete: false, eliminations: 0 };
    room.players.push(player);
    rooms.set(roomId, room);

    socket.join(roomId);
    socket.emit('roomCreated', { roomId, gameState: room.gameState, isHost: true, players: room.players });
    console.log(`Room created: ${roomId} by ${username}`);
  });

  socket.on('joinRoom', ({ roomId, username }) => {
    const room = rooms.get(roomId?.toUpperCase());
    if (!room) { socket.emit('error', 'Room not found'); return; }

    if (room.players.length >= room.playerLimit && room.gameState !== 'LOBBY') {
      socket.emit('error', 'Room is full or game already in progress');
      return;
    }

    const player = { id: socket.id, username, finishTime: null, isHost: false, isReady: false, isAlive: true, isSetupComplete: false, eliminations: 0 };
    room.players.push(player);
    socket.join(roomId?.toUpperCase());

    io.to(roomId?.toUpperCase()).emit('playerList', room.players);
    socket.emit('gameState', {
      gameState: room.gameState,
      maxNumber: room.maxNumber,
      playerLimit: room.playerLimit,
      gameMode: room.gameMode,
      guessMode: room.guessMode,
      maxGuessesPerTarget: room.maxGuessesPerTarget,
      maxGuessesPerGuesser: room.maxGuessesPerGuesser,
      isHost: false,
      players: room.players,
      roomId: roomId?.toUpperCase()
    });
    console.log(`Player ${username} joined room ${roomId}`);
  });

  socket.on('configureGame', (config) => {
    const roomInfo = getRoom(socket);
    if (!roomInfo || !roomInfo.room.players.find(p => p.id === socket.id && p.isHost)) return;

    const { roomId, room } = roomInfo;
    room.maxNumber = parseInt(config.maxNumber) || 1000;
    room.playerLimit = parseInt(config.playerLimit) || 2;

    if (config.gameMode && ['classic', 'elimination'].includes(config.gameMode)) room.gameMode = config.gameMode;
    if (config.guessMode && ['single', 'all'].includes(config.guessMode)) room.guessMode = config.guessMode;
    if (config.maxGuessesPerTarget) room.maxGuessesPerTarget = Math.max(1, parseInt(config.maxGuessesPerTarget) || 20);
    if (config.maxGuessesPerGuesser !== undefined) {
      room.maxGuessesPerGuesser = Math.max(1, parseInt(config.maxGuessesPerGuesser) || Math.ceil(room.maxGuessesPerTarget / 2));
    }

    room.gameState = 'WAITING';
    io.to(roomId).emit('gameState', {
      gameState: room.gameState,
      maxNumber: room.maxNumber,
      playerLimit: room.playerLimit,
      gameMode: room.gameMode,
      guessMode: room.guessMode,
      maxGuessesPerTarget: room.maxGuessesPerTarget,
      maxGuessesPerGuesser: room.maxGuessesPerGuesser,
      players: room.players
    });
  });

  socket.on('toggleReady', () => {
    const roomInfo = getRoom(socket);
    if (!roomInfo) return;
    const { roomId, room } = roomInfo;
    const player = room.players.find(p => p.id === socket.id);
    if (player) { player.isReady = !player.isReady; io.to(roomId).emit('playerList', room.players); }
  });

  // ── Add / remove bots (host only, lobby only) ─────────────

  socket.on('addBot', ({ tier }) => {
    const roomInfo = getRoom(socket);
    if (!roomInfo || !roomInfo.room.players.find(p => p.id === socket.id && p.isHost)) return;

    const { roomId, room } = roomInfo;
    if (room.gameState !== 'LOBBY' && room.gameState !== 'WAITING') return;
    if (!Object.keys(BOT_CONFIG).includes(tier)) return;

    const config = BOT_CONFIG[tier];
    const name = config.names[Math.floor(Math.random() * config.names.length)];
    const botId = `bot_${Math.random().toString(36).substring(2, 10)}`;

    room.players.push({
      id: botId,
      username: `${config.prefix} ${name}`,
      isBot: true,
      botTier: tier,
      isHost: false,
      isReady: true,
      isAlive: true,
      isSetupComplete: false,
      eliminations: 0,
      finishTime: null,
      botLow: 1,
      botHigh: room.maxNumber,
      botTargetRanges: {}
    });

    io.to(roomId).emit('playerList', room.players);
  });

  socket.on('fillWithBots', (data) => {
    const roomInfo = getRoom(socket);
    if (!roomInfo || !roomInfo.room.players.find(p => p.id === socket.id && p.isHost)) return;

    const { roomId, room } = roomInfo;
    if (room.gameState !== 'LOBBY' && room.gameState !== 'WAITING') return;

    // Use the client's current playerLimit so the fill respects the lobby UI value
    // even if "Set Configuration" hasn't been clicked yet
    if (data?.playerLimit) room.playerLimit = Math.max(1, Math.min(100, parseInt(data.playerLimit) || room.playerLimit));

    const tiers = Object.keys(BOT_CONFIG);
    while (room.players.length < room.playerLimit) {
      const tier = tiers[Math.floor(Math.random() * tiers.length)];
      const config = BOT_CONFIG[tier];
      const name = config.names[Math.floor(Math.random() * config.names.length)];
      const botId = `bot_${Math.random().toString(36).substring(2, 10)}`;
      room.players.push({
        id: botId,
        username: `${config.prefix} ${name}`,
        isBot: true,
        botTier: tier,
        isHost: false,
        isReady: true,
        isAlive: true,
        isSetupComplete: false,
        eliminations: 0,
        finishTime: null,
        botLow: 1,
        botHigh: room.maxNumber,
        botTargetRanges: {}
      });
    }

    io.to(roomId).emit('playerList', room.players);
  });

  socket.on('removeBot', ({ botId }) => {
    const roomInfo = getRoom(socket);
    if (!roomInfo || !roomInfo.room.players.find(p => p.id === socket.id && p.isHost)) return;
    const { roomId, room } = roomInfo;
    if (room.gameState !== 'LOBBY' && room.gameState !== 'WAITING') return;
    room.players = room.players.filter(p => p.id !== botId);
    io.to(roomId).emit('playerList', room.players);
  });

  // ── Start game ────────────────────────────────────────────

  socket.on('startGame', (config) => {
    const roomInfo = getRoom(socket);
    if (!roomInfo || !roomInfo.room.players.find(p => p.id === socket.id && p.isHost)) return;

    const { roomId, room } = roomInfo;

    // Apply any config sent with the start event (so "Set Configuration" click is optional)
    if (config && typeof config === 'object') {
      if (config.gameMode && ['classic', 'elimination'].includes(config.gameMode)) room.gameMode = config.gameMode;
      if (config.guessMode && ['single', 'all'].includes(config.guessMode)) room.guessMode = config.guessMode;
      if (config.maxNumber) room.maxNumber = Math.max(10, parseInt(config.maxNumber) || 1000);
      if (config.playerLimit) room.playerLimit = Math.max(1, parseInt(config.playerLimit) || 2);
      if (config.maxGuessesPerTarget) room.maxGuessesPerTarget = Math.max(1, parseInt(config.maxGuessesPerTarget) || 20);
      if (config.maxGuessesPerGuesser !== undefined) room.maxGuessesPerGuesser = Math.max(1, parseInt(config.maxGuessesPerGuesser) || 10);
    }

    // Only check readiness for human players; bots are always ready
    const humanPlayers = room.players.filter(p => !p.isBot);
    const allReady = humanPlayers.every(p => p.isReady || p.isHost);
    if (!allReady || room.players.length < 2) {
      socket.emit('error', 'Need at least 2 players and everyone must be ready!');
      return;
    }

    clearAllBotTimeouts(room);

    if (room.gameMode === 'classic') {
      room.winningNumber = Math.floor(Math.random() * room.maxNumber) + 1;
      room.gameState = 'PLAYING';
      room.results = [];
      room.gameStartTime = Date.now();

      room.players = room.players.map(p => ({
        ...p, finishTime: null, botLow: 1, botHigh: room.maxNumber
      }));

      io.to(roomId).emit('gameStarted', { maxNumber: room.maxNumber, gameStartTime: room.gameStartTime });
      io.to(roomId).emit('gameState', { gameState: room.gameState, maxNumber: room.maxNumber, gameStartTime: room.gameStartTime });

      // Start bot guessing loops
      room.players.filter(p => p.isBot).forEach(bot => scheduleBotAction(roomId, bot.id));
      console.log(`Game started in room ${roomId}! Winning number: ${room.winningNumber}`);

    } else if (room.gameMode === 'elimination') {
      room.gameState = 'SETUP';
      room.eliminationTargets = {};
      room.eliminationLog = [];
      room.eliminationScores = {};
      room.survivorId = null;

      room.players = room.players.map(p => ({
        ...p,
        isAlive: true,
        isSetupComplete: false,
        eliminations: 0,
        finishTime: null,
        botLow: 1,
        botHigh: room.maxNumber,
        botTargetRanges: {}
      }));

      room.players.forEach(p => {
        room.eliminationScores[p.id] = { username: p.username, eliminations: 0 };
        // Bots auto-pick their secret number immediately
        if (p.isBot) {
          room.eliminationTargets[p.id] = {
            secretNumber: Math.floor(Math.random() * room.maxNumber) + 1,
            guessCount: 0,
            eliminatedBy: null
          };
          p.isSetupComplete = true;
        }
      });

      io.to(roomId).emit('gameState', {
        gameState: 'SETUP',
        gameMode: 'elimination',
        maxNumber: room.maxNumber,
        players: room.players
      });
      console.log(`Elimination SETUP started in room ${roomId}`);
    }
  });

  // ── Secret number (elimination setup) ────────────────────

  socket.on('submitSecretNumber', ({ secretNumber }) => {
    const roomInfo = getRoom(socket);
    if (!roomInfo || roomInfo.room.gameState !== 'SETUP') return;

    const { roomId, room } = roomInfo;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.isSetupComplete) return;

    const num = parseInt(secretNumber);
    if (isNaN(num) || num < 1 || num > room.maxNumber) {
      socket.emit('error', `Secret number must be between 1 and ${room.maxNumber}`);
      return;
    }

    room.eliminationTargets[socket.id] = { secretNumber: num, guessCount: 0, eliminatedBy: null };
    player.isSetupComplete = true;
    io.to(roomId).emit('playerList', room.players);

    // Bots are already submitted — check if all players (human + bot) are done
    const allSubmitted = room.players.every(p => p.isSetupComplete);
    if (allSubmitted) {
      room.gameState = 'PLAYING';
      room.gameStartTime = Date.now();
      io.to(roomId).emit('eliminationGameStarted', {
        gameStartTime: room.gameStartTime,
        maxNumber: room.maxNumber,
        guessMode: room.guessMode,
        maxGuessesPerTarget: room.maxGuessesPerTarget,
        maxGuessesPerGuesser: room.maxGuessesPerGuesser,
        players: room.players
      });
      io.to(roomId).emit('gameState', { gameState: 'PLAYING', gameMode: 'elimination' });

      // Start bot guessing loops
      room.players.filter(p => p.isBot && p.isAlive).forEach(bot => scheduleBotAction(roomId, bot.id));
      console.log(`Elimination PLAYING started in room ${roomId}`);
    }
  });

  // ── Elimination guess (human) ─────────────────────────────

  socket.on('submitEliminationGuess', ({ targetId, guess }) => {
    const roomInfo = getRoom(socket);
    if (!roomInfo) return;

    const { roomId, room } = roomInfo;
    if (room.gameState !== 'PLAYING' || room.gameMode !== 'elimination') return;

    const guesser = room.players.find(p => p.id === socket.id);
    if (!guesser || !guesser.isAlive) { socket.emit('error', 'Eliminated players cannot guess'); return; }

    // Validate specific target if provided
    if (targetId !== null && targetId !== undefined) {
      const tp = room.players.find(p => p.id === targetId && p.isAlive && p.id !== socket.id);
      if (!tp) { socket.emit('error', 'Invalid or eliminated target'); return; }
    }

    processEliminationGuess(room, roomId, socket.id, targetId ?? null, parseInt(guess));
  });

  // ── Classic guess ─────────────────────────────────────────

  socket.on('submitGuess', (guess) => {
    const roomInfo = getRoom(socket);
    if (!roomInfo || roomInfo.room.gameState !== 'PLAYING' || roomInfo.room.gameMode !== 'classic') return;

    const { roomId, room } = roomInfo;
    const numGuess = parseInt(guess);

    if (numGuess === room.winningNumber) {
      const finishTime = Date.now();
      const player = room.players.find(p => p.id === socket.id);
      if (player && !player.finishTime) {
        player.finishTime = finishTime;
        const duration = (finishTime - room.gameStartTime) / 1000;
        room.results.push({ username: player.username, time: duration });
        socket.emit('guessResult', 'correct');
        room.results.sort((a, b) => a.time - b.time);
        io.to(roomId).emit('playerFinished', { username: player.username, results: room.results.slice(0, 3) });

        if (room.results.length === room.players.length) {
          room.gameState = 'FINISHED';
          clearAllBotTimeouts(room);
          io.to(roomId).emit('gameState', {
            gameState: room.gameState,
            maxNumber: room.maxNumber,
            finalResults: room.results.slice(0, 3)
          });
        }
      }
    } else if (numGuess < room.winningNumber) {
      socket.emit('guessResult', 'higher');
    } else {
      socket.emit('guessResult', 'lower');
    }
  });

  // ── Kick player ───────────────────────────────────────────

  socket.on('kickPlayer', ({ targetSocketId }) => {
    const roomInfo = getRoom(socket);
    if (!roomInfo || !roomInfo.room.players.find(p => p.id === socket.id && p.isHost)) return;

    const { roomId, room } = roomInfo;
    const targetIndex = room.players.findIndex(p => p.id === targetSocketId && !p.isHost);
    if (targetIndex !== -1) {
      room.players.splice(targetIndex, 1);
      io.to(targetSocketId).emit('kicked', 'You have been kicked by the host.');
      io.to(roomId).emit('playerList', room.players);
    }
  });

  // ── Reset game ────────────────────────────────────────────

  socket.on('resetGame', () => {
    const roomInfo = getRoom(socket);
    if (!roomInfo || !roomInfo.room.players.find(p => p.id === socket.id && p.isHost)) return;

    const { roomId, room } = roomInfo;
    clearAllBotTimeouts(room);

    room.gameState = 'LOBBY';
    room.results = [];
    room.gameStartTime = null;
    room.winningNumber = null;
    room.eliminationTargets = {};
    room.eliminationLog = [];
    room.eliminationScores = {};
    room.survivorId = null;

    room.players = room.players.map(p => ({
      ...p,
      isAlive: true,
      isSetupComplete: false,
      eliminations: 0,
      finishTime: null,
      isReady: p.isHost || p.isBot ? true : false,
      botLow: 1,
      botHigh: room.maxNumber,
      botTargetRanges: {}
    }));

    io.to(roomId).emit('gameState', {
      gameState: 'LOBBY',
      maxNumber: room.maxNumber,
      playerLimit: room.playerLimit,
      gameMode: room.gameMode,
      guessMode: room.guessMode,
      maxGuessesPerTarget: room.maxGuessesPerTarget,
      maxGuessesPerGuesser: room.maxGuessesPerGuesser,
      players: room.players
    });
  });

  // ── Disconnect ────────────────────────────────────────────

  socket.on('disconnect', () => {
    const roomInfo = getRoom(socket);
    if (!roomInfo) return;

    const { roomId, room } = roomInfo;
    const wasHost = (socket.id === room.hostId);
    const disconnectedPlayer = room.players.find(p => p.id === socket.id);

    if (
      room.gameMode === 'elimination' &&
      room.gameState === 'PLAYING' &&
      disconnectedPlayer?.isAlive
    ) {
      disconnectedPlayer.isAlive = false;
      io.to(roomId).emit('playerEliminated', {
        eliminatedId: socket.id,
        eliminatedUsername: disconnectedPlayer.username,
        eliminatorId: null,
        eliminatorUsername: null,
        reason: 'disconnect'
      });

      const alivePlayers = room.players.filter(p => p.isAlive && p.id !== socket.id);
      if (alivePlayers.length === 1) {
        room.survivorId = alivePlayers[0].id;
        room.gameState = 'FINISHED';
        clearAllBotTimeouts(room);
        const finalScoreboard = buildEliminationScoreboard(room);
        io.to(roomId).emit('gameState', {
          gameState: 'FINISHED',
          gameMode: 'elimination',
          eliminationResults: finalScoreboard
        });
      }
    }

    room.players = room.players.filter(p => p.id !== socket.id);

    const humanPlayersLeft = room.players.filter(p => !p.isBot);
    if (humanPlayersLeft.length === 0) {
      // No humans remain — tear down the room and bots
      clearAllBotTimeouts(room);
      rooms.delete(roomId);
    } else if (wasHost) {
      // Give host to first non-bot human
      const nextHost = humanPlayersLeft[0];
      room.hostId = nextHost.id;
      nextHost.isHost = true;
      io.to(roomId).emit('playerList', room.players);
    } else {
      io.to(roomId).emit('playerList', room.players);
    }

    console.log('User disconnected from room:', roomId);
  });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = { app, server, io, rooms };
