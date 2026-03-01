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

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded 0, O, 1, I for clarity
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getRoom(socket) {
  for (const [roomId, room] of rooms.entries()) {
    if (room.players.find(p => p.id === socket.id)) {
      return { roomId, room };
    }
  }
  return null;
}

function buildEliminationScoreboard(room) {
  return room.players.map(p => ({
    id: p.id,
    username: p.username,
    eliminations: p.eliminations || 0,
    isAlive: p.isAlive,
    isSurvivor: p.id === room.survivorId
  })).sort((a, b) => {
    if (a.isSurvivor) return -1;
    if (b.isSurvivor) return 1;
    return b.eliminations - a.eliminations;
  });
}

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
      // Elimination mode fields
      gameMode: 'classic',
      guessMode: 'single',
      maxGuessesPerTarget: 20,
      eliminationTargets: {},
      eliminationLog: [],
      eliminationScores: {},
      survivorId: null
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
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }

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

    if (config.gameMode && ['classic', 'elimination'].includes(config.gameMode)) {
      room.gameMode = config.gameMode;
    }
    if (config.guessMode && ['single', 'all'].includes(config.guessMode)) {
      room.guessMode = config.guessMode;
    }
    if (config.maxGuessesPerTarget) {
      room.maxGuessesPerTarget = Math.max(1, parseInt(config.maxGuessesPerTarget) || 20);
    }

    room.gameState = 'WAITING';
    io.to(roomId).emit('gameState', {
      gameState: room.gameState,
      maxNumber: room.maxNumber,
      playerLimit: room.playerLimit,
      gameMode: room.gameMode,
      guessMode: room.guessMode,
      maxGuessesPerTarget: room.maxGuessesPerTarget,
      players: room.players
    });
  });

  socket.on('toggleReady', () => {
    const roomInfo = getRoom(socket);
    if (!roomInfo) return;

    const { roomId, room } = roomInfo;
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.isReady = !player.isReady;
      io.to(roomId).emit('playerList', room.players);
    }
  });

  socket.on('startGame', () => {
    const roomInfo = getRoom(socket);
    if (!roomInfo || !roomInfo.room.players.find(p => p.id === socket.id && p.isHost)) return;

    const { roomId, room } = roomInfo;
    const allReady = room.players.every(p => p.isReady || p.isHost);
    if (!allReady || room.players.length < 2) {
      socket.emit('error', 'Need at least 2 players and everyone must be ready!');
      return;
    }

    if (room.gameMode === 'classic') {
      room.winningNumber = Math.floor(Math.random() * room.maxNumber) + 1;
      room.gameState = 'PLAYING';
      room.results = [];
      room.players = room.players.map(p => ({ ...p, finishTime: null }));
      room.gameStartTime = Date.now();

      io.to(roomId).emit('gameStarted', { maxNumber: room.maxNumber, gameStartTime: room.gameStartTime });
      io.to(roomId).emit('gameState', {
        gameState: room.gameState,
        maxNumber: room.maxNumber,
        gameStartTime: room.gameStartTime
      });
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
        finishTime: null
      }));

      room.players.forEach(p => {
        room.eliminationScores[p.id] = { username: p.username, eliminations: 0 };
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

    room.eliminationTargets[socket.id] = {
      secretNumber: num,
      guessCount: 0,
      eliminatedBy: null
    };

    player.isSetupComplete = true;
    io.to(roomId).emit('playerList', room.players);

    const allSubmitted = room.players.every(p => p.isSetupComplete);
    if (allSubmitted) {
      room.gameState = 'PLAYING';
      room.gameStartTime = Date.now();
      io.to(roomId).emit('eliminationGameStarted', {
        gameStartTime: room.gameStartTime,
        maxNumber: room.maxNumber,
        guessMode: room.guessMode,
        maxGuessesPerTarget: room.maxGuessesPerTarget,
        players: room.players
      });
      io.to(roomId).emit('gameState', {
        gameState: 'PLAYING',
        gameMode: 'elimination'
      });
      console.log(`Elimination PLAYING started in room ${roomId}`);
    }
  });

  socket.on('submitEliminationGuess', ({ targetId, guess }) => {
    const roomInfo = getRoom(socket);
    if (!roomInfo) return;

    const { roomId, room } = roomInfo;
    if (room.gameState !== 'PLAYING' || room.gameMode !== 'elimination') return;

    const guesser = room.players.find(p => p.id === socket.id);
    if (!guesser || !guesser.isAlive) {
      socket.emit('error', 'Eliminated players cannot guess');
      return;
    }

    // targetId === null means "all alive opponents" (player-level override)
    let targetIds;
    if (targetId === null || targetId === undefined) {
      targetIds = room.players
        .filter(p => p.isAlive && p.id !== socket.id)
        .map(p => p.id);
    } else {
      const targetPlayer = room.players.find(p => p.id === targetId && p.isAlive && p.id !== socket.id);
      if (!targetPlayer) {
        socket.emit('error', 'Invalid or eliminated target');
        return;
      }
      targetIds = [targetId];
    }

    const numGuess = parseInt(guess);
    let gameEnded = false;

    for (const tid of targetIds) {
      if (gameEnded) break;

      const target = room.players.find(p => p.id === tid);
      const targetData = room.eliminationTargets[tid];
      if (!target || !targetData) continue;

      targetData.guessCount++;

      let result;
      if (numGuess === targetData.secretNumber) {
        result = 'correct';
      } else if (numGuess < targetData.secretNumber) {
        result = 'higher';
      } else {
        result = 'lower';
      }

      const logEntry = {
        guesserUsername: guesser.username,
        guesserSocketId: guesser.id,
        targetUsername: target.username,
        targetSocketId: tid,
        guess: numGuess,
        result
      };
      room.eliminationLog.push(logEntry);
      io.to(roomId).emit('eliminationGuessResult', logEntry);

      if (result === 'correct') {
        target.isAlive = false;
        targetData.eliminatedBy = socket.id;
        guesser.eliminations++;
        if (room.eliminationScores[socket.id]) {
          room.eliminationScores[socket.id].eliminations++;
        }

        io.to(roomId).emit('playerEliminated', {
          eliminatedId: tid,
          eliminatedUsername: target.username,
          eliminatorId: socket.id,
          eliminatorUsername: guesser.username
        });

        const alivePlayers = room.players.filter(p => p.isAlive);
        if (alivePlayers.length === 1) {
          room.survivorId = alivePlayers[0].id;
          room.gameState = 'FINISHED';
          const finalScoreboard = buildEliminationScoreboard(room);
          io.to(roomId).emit('gameState', {
            gameState: 'FINISHED',
            gameMode: 'elimination',
            eliminationResults: finalScoreboard
          });
          gameEnded = true;
        }

      } else if (targetData.guessCount >= room.maxGuessesPerTarget) {
        const newNumber = Math.floor(Math.random() * room.maxNumber) + 1;
        targetData.secretNumber = newNumber;
        targetData.guessCount = 0;
        targetData.eliminatedBy = null;

        io.to(roomId).emit('targetRerolled', {
          targetUsername: target.username,
          targetSocketId: tid,
          reason: `Max guesses (${room.maxGuessesPerTarget}) reached — new number assigned`
        });
      }
    }

    if (!gameEnded) {
      io.to(roomId).emit('playerList', room.players);
    }
  });

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

  socket.on('resetGame', () => {
    const roomInfo = getRoom(socket);
    if (!roomInfo || !roomInfo.room.players.find(p => p.id === socket.id && p.isHost)) return;

    const { roomId, room } = roomInfo;
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
      isReady: p.isHost ? true : false
    }));

    io.to(roomId).emit('gameState', {
      gameState: 'LOBBY',
      maxNumber: room.maxNumber,
      playerLimit: room.playerLimit,
      gameMode: room.gameMode,
      guessMode: room.guessMode,
      maxGuessesPerTarget: room.maxGuessesPerTarget,
      players: room.players
    });
  });

  // Kick player handle
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

  socket.on('disconnect', () => {
    const roomInfo = getRoom(socket);
    if (!roomInfo) return;

    const { roomId, room } = roomInfo;
    const wasHost = (socket.id === room.hostId);
    const disconnectedPlayer = room.players.find(p => p.id === socket.id);

    // Handle mid-game disconnect in elimination mode
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
        const finalScoreboard = buildEliminationScoreboard(room);
        io.to(roomId).emit('gameState', {
          gameState: 'FINISHED',
          gameMode: 'elimination',
          eliminationResults: finalScoreboard
        });
      }
    }

    room.players = room.players.filter(p => p.id !== socket.id);

    if (wasHost && room.players.length > 0) {
      room.hostId = room.players[0].id;
      room.players[0].isHost = true;
      io.to(roomId).emit('playerList', room.players);
    } else if (room.players.length === 0) {
      rooms.delete(roomId);
    } else {
      io.to(roomId).emit('playerList', room.players);
    }

    console.log('User disconnected from room:', roomId);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
