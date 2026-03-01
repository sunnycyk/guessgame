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
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoom(socket) {
  for (const [roomId, room] of rooms.entries()) {
    if (room.players.find(p => p.id === socket.id)) {
      return { roomId, room };
    }
  }
  return null;
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
      hostId: socket.id
    };

    const player = { id: socket.id, username, finishTime: null, isHost: true, isReady: true };
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

    const player = { id: socket.id, username, finishTime: null, isHost: false, isReady: false };
    room.players.push(player);
    socket.join(roomId);

    io.to(roomId).emit('playerList', room.players);
    socket.emit('gameState', {
      gameState: room.gameState,
      maxNumber: room.maxNumber,
      playerLimit: room.playerLimit,
      isHost: false,
      players: room.players,
      roomId
    });
    console.log(`Player ${username} joined room ${roomId}`);
  });

  socket.on('configureGame', (config) => {
    const roomInfo = getRoom(socket);
    if (!roomInfo || !roomInfo.room.players.find(p => p.id === socket.id && p.isHost)) return;

    const { roomId, room } = roomInfo;
    room.maxNumber = parseInt(config.maxNumber) || 1000;
    room.playerLimit = parseInt(config.playerLimit) || 2;
    room.gameState = 'WAITING';
    io.to(roomId).emit('gameState', {
      gameState: room.gameState,
      maxNumber: room.maxNumber,
      playerLimit: room.playerLimit,
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
    if (!allReady && room.players.length >= room.playerLimit) {
      socket.emit('error', 'All players must be ready before starting!');
      return;
    }

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
  });

  socket.on('submitGuess', (guess) => {
    const roomInfo = getRoom(socket);
    if (!roomInfo || roomInfo.room.gameState !== 'PLAYING') return;

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
    io.to(roomId).emit('gameState', {
      gameState: room.gameState,
      maxNumber: room.maxNumber,
      playerLimit: room.playerLimit
    });
  });

  socket.on('disconnect', () => {
    const roomInfo = getRoom(socket);
    if (!roomInfo) return;

    const { roomId, room } = roomInfo;
    const wasHost = (socket.id === room.hostId);
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
