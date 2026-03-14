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
// TOURNAMENT HELPERS
// ============================================================

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// After a match completes, propagate its winner to the next round and
// auto-resolve any BYE/null cases recursively.
function propagateOneWinner(rounds, roundIdx, matchIdx) {
  if (roundIdx + 1 >= rounds.length) return;
  const match = rounds[roundIdx][matchIdx];
  if (match.status !== 'completed') return;

  const nextMatchIdx = Math.floor(matchIdx / 2);
  const nextMatch = rounds[roundIdx + 1][nextMatchIdx];

  if (matchIdx % 2 === 0) {
    nextMatch.p1Id = match.winnerId;
    nextMatch.p1Username = match.winnerUsername;
  } else {
    nextMatch.p2Id = match.winnerId;
    nextMatch.p2Username = match.winnerUsername;
  }

  // Only auto-resolve once BOTH sibling matches are done
  const siblingIdx = matchIdx % 2 === 0 ? matchIdx + 1 : matchIdx - 1;
  if (siblingIdx >= rounds[roundIdx].length) return;
  if (rounds[roundIdx][siblingIdx].status !== 'completed') return;
  if (nextMatch.status !== 'pending') return;

  if (!nextMatch.p1Id && !nextMatch.p2Id) {
    nextMatch.status = 'completed'; // both BYE
    propagateOneWinner(rounds, roundIdx + 1, nextMatchIdx);
  } else if (!nextMatch.p1Id) {
    nextMatch.winnerId = nextMatch.p2Id;
    nextMatch.winnerUsername = nextMatch.p2Username;
    nextMatch.status = 'completed';
    propagateOneWinner(rounds, roundIdx + 1, nextMatchIdx);
  } else if (!nextMatch.p2Id) {
    nextMatch.winnerId = nextMatch.p1Id;
    nextMatch.winnerUsername = nextMatch.p1Username;
    nextMatch.status = 'completed';
    propagateOneWinner(rounds, roundIdx + 1, nextMatchIdx);
  }
  // else: both real players — stays pending, needs a real match
}

function buildBracket(players, bestOf) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const size = nextPow2(shuffled.length);
  while (shuffled.length < size) shuffled.push(null); // BYE padding
  const numRounds = Math.log2(size);
  const rounds = [];

  // Round 1 — seed real players (BYEs are null slots)
  const r0 = [];
  for (let i = 0; i < size; i += 2) {
    const p1 = shuffled[i], p2 = shuffled[i + 1];
    r0.push({
      id: `R1M${i / 2 + 1}`,
      roundNum: 1,
      matchNum: i / 2 + 1,
      p1Id: p1?.id ?? null,
      p1Username: p1?.username ?? null,  // null = BYE
      p2Id: p2?.id ?? null,
      p2Username: p2?.username ?? null,
      winnerId: null,
      winnerUsername: null,
      scores: {},
      status: 'pending'
    });
  }
  rounds.push(r0);

  // Future rounds — all TBD (null placeholders)
  for (let r = 2; r <= numRounds; r++) {
    const count = size / Math.pow(2, r);
    rounds.push(Array.from({ length: count }, (_, m) => ({
      id: `R${r}M${m + 1}`,
      roundNum: r,
      matchNum: m + 1,
      p1Id: null, p1Username: null,
      p2Id: null, p2Username: null,
      winnerId: null, winnerUsername: null,
      scores: {},
      status: 'pending'
    })));
  }

  // Resolve round-1 BYEs and propagate
  for (let m = 0; m < rounds[0].length; m++) {
    const match = rounds[0][m];
    if (!match.p1Id && !match.p2Id) {
      match.status = 'completed';
      propagateOneWinner(rounds, 0, m);
    } else if (!match.p1Id) {
      match.winnerId = match.p2Id;
      match.winnerUsername = match.p2Username;
      match.status = 'completed';
      propagateOneWinner(rounds, 0, m);
    } else if (!match.p2Id) {
      match.winnerId = match.p1Id;
      match.winnerUsername = match.p1Username;
      match.status = 'completed';
      propagateOneWinner(rounds, 0, m);
    }
  }

  return {
    rounds,
    bestOf,
    activeRoundIdx: null,
    activeMatchIdx: null,
    activeWinningNumber: null,
    activeRoundScores: {},  // { [playerId]: wins } within best-of
    activeRoundNum: 0,
    champion: null,
    spectatorLog: []
  };
}

function getNextPendingMatch(bracket) {
  for (let r = 0; r < bracket.rounds.length; r++) {
    for (let m = 0; m < bracket.rounds[r].length; m++) {
      const match = bracket.rounds[r][m];
      if (match.status === 'pending' && match.p1Id && match.p2Id) {
        return { roundIdx: r, matchIdx: m, match };
      }
    }
  }
  return null;
}

// Shared tournament guess processor — called by socket handler and bot runner.
// Returns { matchEnded, tournamentEnded }
function processTournamentGuess(room, roomId, playerId, numGuess) {
  const bracket = room.tournament;
  const match = bracket.rounds[bracket.activeRoundIdx][bracket.activeMatchIdx];
  if (!match || match.status !== 'active') return { matchEnded: false, tournamentEnded: false };
  if (playerId !== match.p1Id && playerId !== match.p2Id) return { matchEnded: false, tournamentEnded: false };

  const player = room.players.find(p => p.id === playerId);
  if (!player) return { matchEnded: false, tournamentEnded: false };

  let result;
  if (numGuess === bracket.activeWinningNumber) result = 'correct';
  else if (numGuess < bracket.activeWinningNumber) result = 'higher';
  else result = 'lower';

  const logEntry = { guesserUsername: player.username, guesserSocketId: playerId, guess: numGuess, result };
  bracket.spectatorLog.unshift(logEntry);
  if (bracket.spectatorLog.length > 50) bracket.spectatorLog.pop();
  io.to(roomId).emit('tournamentGuessResult', logEntry);

  if (result !== 'correct') return { matchEnded: false, tournamentEnded: false };

  // Round won — update scores
  bracket.activeRoundScores[playerId] = (bracket.activeRoundScores[playerId] || 0) + 1;
  const winsNeeded = Math.ceil(bracket.bestOf / 2);

  if (bracket.activeRoundScores[playerId] < winsNeeded) {
    // Best-of series continues — start next round
    bracket.activeRoundNum++;
    bracket.activeWinningNumber = Math.floor(Math.random() * room.maxNumber) + 1;
    // Reset bot binary-search ranges
    clearAllBotTimeouts(room);
    [match.p1Id, match.p2Id].forEach(pid => {
      const bot = room.players.find(p => p.id === pid && p.isBot);
      if (bot) { bot.botLow = 1; bot.botHigh = room.maxNumber; scheduleTournamentBotAction(roomId, bot.id); }
    });
    io.to(roomId).emit('gameState', {
      gameState: 'TOURNAMENT_PLAYING',
      gameMode: 'tournament',
      tournament: bracket,
      players: room.players
    });
    return { matchEnded: false, tournamentEnded: false };
  }

  // Match winner determined
  clearAllBotTimeouts(room);
  match.winnerId = playerId;
  match.winnerUsername = player.username;
  match.scores = { ...bracket.activeRoundScores };
  match.status = 'completed';
  propagateOneWinner(bracket.rounds, bracket.activeRoundIdx, bracket.activeMatchIdx);

  bracket.activeRoundIdx = null;
  bracket.activeMatchIdx = null;
  bracket.activeWinningNumber = null;
  bracket.activeRoundScores = {};
  bracket.activeRoundNum = 0;

  // Check if tournament is over (last round's only match completed)
  const lastRound = bracket.rounds[bracket.rounds.length - 1];
  if (lastRound.length === 1 && lastRound[0].winnerId) {
    bracket.champion = { id: playerId, username: player.username };
    room.gameState = 'TOURNAMENT_FINISHED';
    io.to(roomId).emit('gameState', {
      gameState: 'TOURNAMENT_FINISHED',
      gameMode: 'tournament',
      tournament: bracket,
      players: room.players
    });
    return { matchEnded: true, tournamentEnded: true };
  }

  room.gameState = 'TOURNAMENT_BRACKET';
  io.to(roomId).emit('gameState', {
    gameState: 'TOURNAMENT_BRACKET',
    gameMode: 'tournament',
    tournament: bracket,
    players: room.players
  });
  return { matchEnded: true, tournamentEnded: false };
}

function scheduleTournamentBotAction(roomId, botId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const bot = room.players.find(p => p.id === botId && p.isBot);
  if (!bot) return;

  if (!room.botTimeouts) room.botTimeouts = {};
  if (room.botTimeouts[botId]) clearTimeout(room.botTimeouts[botId]);

  room.botTimeouts[botId] = setTimeout(() => {
    const r = rooms.get(roomId);
    if (!r || r.gameState !== 'TOURNAMENT_PLAYING') return;
    const bracket = r.tournament;
    if (!bracket || bracket.activeRoundIdx === null) return;

    const match = bracket.rounds[bracket.activeRoundIdx][bracket.activeMatchIdx];
    const b = r.players.find(p => p.id === botId && p.isBot);
    if (!b || (b.id !== match.p1Id && b.id !== match.p2Id)) return;

    const guess = makeBotGuess(b.botTier, b.botLow ?? 1, b.botHigh ?? r.maxNumber, r.maxNumber);
    const { matchEnded } = processTournamentGuess(r, roomId, botId, guess);

    if (!matchEnded) {
      const winNum = bracket.activeWinningNumber;
      if (winNum !== null) {
        if (guess < winNum) b.botLow = guess + 1;
        else if (guess > winNum) b.botHigh = guess - 1;
      }
      scheduleTournamentBotAction(roomId, botId);
    }
  }, getBotDelay(bot.botTier));
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
      tournament: null,
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

  // ── Tournament ────────────────────────────────────────────

  socket.on('startTournament', (config) => {
    const roomInfo = getRoom(socket);
    if (!roomInfo || !roomInfo.room.players.find(p => p.id === socket.id && p.isHost)) return;
    const { roomId, room } = roomInfo;
    if (room.players.length < 2) { socket.emit('error', 'Need at least 2 players to start a tournament'); return; }

    if (config?.maxNumber) room.maxNumber = Math.max(10, parseInt(config.maxNumber) || 1000);
    if (config?.playerLimit) room.playerLimit = Math.max(1, parseInt(config.playerLimit) || 2);

    const bestOf = [1, 3, 5].includes(parseInt(config?.bestOf)) ? parseInt(config.bestOf) : 1;
    clearAllBotTimeouts(room);
    room.gameMode = 'tournament';
    room.tournament = buildBracket(room.players, bestOf);
    room.gameState = 'TOURNAMENT_BRACKET';

    io.to(roomId).emit('gameState', {
      gameState: 'TOURNAMENT_BRACKET',
      gameMode: 'tournament',
      maxNumber: room.maxNumber,
      tournament: room.tournament,
      players: room.players
    });
    console.log(`Tournament started in room ${roomId} — ${room.players.length} players, best of ${bestOf}`);
  });

  socket.on('startNextTournamentMatch', () => {
    const roomInfo = getRoom(socket);
    if (!roomInfo || !roomInfo.room.players.find(p => p.id === socket.id && p.isHost)) return;
    const { roomId, room } = roomInfo;
    if (room.gameMode !== 'tournament' || room.gameState !== 'TOURNAMENT_BRACKET') return;

    const next = getNextPendingMatch(room.tournament);
    if (!next) return;

    const { roundIdx, matchIdx, match } = next;
    match.status = 'active';
    room.tournament.activeRoundIdx = roundIdx;
    room.tournament.activeMatchIdx = matchIdx;
    room.tournament.activeWinningNumber = Math.floor(Math.random() * room.maxNumber) + 1;
    room.tournament.activeRoundScores = { [match.p1Id]: 0, [match.p2Id]: 0 };
    room.tournament.activeRoundNum = 1;
    room.tournament.spectatorLog = [];
    room.gameState = 'TOURNAMENT_PLAYING';

    // Reset bot ranges for the two active players
    [match.p1Id, match.p2Id].forEach(pid => {
      const bot = room.players.find(p => p.id === pid && p.isBot);
      if (bot) { bot.botLow = 1; bot.botHigh = room.maxNumber; scheduleTournamentBotAction(roomId, bot.id); }
    });

    io.to(roomId).emit('gameState', {
      gameState: 'TOURNAMENT_PLAYING',
      gameMode: 'tournament',
      tournament: room.tournament,
      players: room.players
    });
    console.log(`Tournament match started: ${match.p1Username} vs ${match.p2Username}`);
  });

  socket.on('submitTournamentGuess', (guess) => {
    const roomInfo = getRoom(socket);
    if (!roomInfo) return;
    const { roomId, room } = roomInfo;
    if (room.gameMode !== 'tournament' || room.gameState !== 'TOURNAMENT_PLAYING') return;
    processTournamentGuess(room, roomId, socket.id, parseInt(guess));
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
    room.gameMode = room.gameMode === 'tournament' ? 'classic' : room.gameMode;
    room.results = [];
    room.gameStartTime = null;
    room.winningNumber = null;
    room.eliminationTargets = {};
    room.eliminationLog = [];
    room.eliminationScores = {};
    room.survivorId = null;
    room.tournament = null;

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

    // Tournament forfeit: if disconnected player is in active match, opponent wins
    if (room.gameMode === 'tournament' && room.gameState === 'TOURNAMENT_PLAYING' && room.tournament) {
      const bracket = room.tournament;
      const match = bracket.activeRoundIdx !== null
        ? bracket.rounds[bracket.activeRoundIdx][bracket.activeMatchIdx]
        : null;
      if (match && (socket.id === match.p1Id || socket.id === match.p2Id)) {
        const opponentId = socket.id === match.p1Id ? match.p2Id : match.p1Id;
        const opponentUsername = socket.id === match.p1Id ? match.p2Username : match.p1Username;
        clearAllBotTimeouts(room);
        match.winnerId = opponentId;
        match.winnerUsername = opponentUsername;
        match.scores = bracket.activeRoundScores;
        match.status = 'completed';
        propagateOneWinner(bracket.rounds, bracket.activeRoundIdx, bracket.activeMatchIdx);
        bracket.activeRoundIdx = null;
        bracket.activeMatchIdx = null;
        bracket.activeWinningNumber = null;

        const lastRound = bracket.rounds[bracket.rounds.length - 1];
        if (lastRound.length === 1 && lastRound[0].winnerId) {
          bracket.champion = { id: opponentId, username: opponentUsername };
          room.gameState = 'TOURNAMENT_FINISHED';
          io.to(roomId).emit('gameState', { gameState: 'TOURNAMENT_FINISHED', gameMode: 'tournament', tournament: bracket, players: room.players });
        } else {
          room.gameState = 'TOURNAMENT_BRACKET';
          io.to(roomId).emit('gameState', { gameState: 'TOURNAMENT_BRACKET', gameMode: 'tournament', tournament: bracket, players: room.players });
        }
      }
    }

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
