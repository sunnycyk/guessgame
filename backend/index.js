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

let gameState = 'LOBBY'; // LOBBY, WAITING, PLAYING, FINISHED
let winningNumber = null;
let maxNumber = 1000;
let playerLimit = 2;
let players = [];
let results = [];
let gameStartTime = null;
let hostId = null;

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('joinGame', (username) => {
    if (players.length >= playerLimit && gameState !== 'LOBBY') {
      socket.emit('error', 'Game is full or already in progress');
      return;
    }

    const isHost = players.length === 0;
    if (isHost) hostId = socket.id;

    const player = { id: socket.id, username, finishTime: null, isHost, isReady: false };
    players.push(player);

    console.log(`Player joined: ${username} (${socket.id}). IsHost: ${isHost}`);

    // Notify all players about the updated player list
    io.emit('playerList', players);

    // Send the current game state to the joining player
    socket.emit('gameState', {
      gameState,
      maxNumber,
      playerLimit,
      gameStartTime,
      isHost,
      players
    });
  });

  socket.on('configureGame', (config) => {
    if (socket.id !== hostId) return;
    maxNumber = parseInt(config.maxNumber) || 1000;
    playerLimit = parseInt(config.playerLimit) || 2;
    gameState = 'WAITING';
    io.emit('gameState', { gameState, maxNumber, playerLimit, players });
  });

  socket.on('toggleReady', () => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
      player.isReady = !player.isReady;
      io.emit('playerList', players);
    }
  });

  socket.on('startGame', () => {
    if (socket.id !== hostId) return;

    // Check if everyone is ready
    const allReady = players.every(p => p.isReady || p.isHost);
    if (!allReady && players.length >= playerLimit) {
      socket.emit('error', 'All players must be ready before starting!');
      return;
    }

    winningNumber = Math.floor(Math.random() * maxNumber) + 1;
    gameState = 'PLAYING';
    results = [];
    players = players.map(p => ({ ...p, finishTime: null }));
    gameStartTime = Date.now();

    io.emit('gameStarted', { maxNumber, gameStartTime });
    io.emit('gameState', { gameState, maxNumber, gameStartTime });
    console.log(`Game started! Winning number: ${winningNumber}`);
  });

  socket.on('submitGuess', (guess) => {
    if (gameState !== 'PLAYING') return;

    const numGuess = parseInt(guess);
    if (numGuess === winningNumber) {
      const finishTime = Date.now();
      const player = players.find(p => p.id === socket.id);
      if (player && !player.finishTime) {
        player.finishTime = finishTime;
        const duration = (finishTime - gameStartTime) / 1000;
        results.push({ username: player.username, time: duration });
        socket.emit('guessResult', 'correct');

        // Sort results by time (fastest first)
        results.sort((a, b) => a.time - b.time);

        io.emit('playerFinished', { username: player.username, results: results.slice(0, 3) });

        if (results.length === players.length) {
          gameState = 'FINISHED';
          io.emit('gameState', { gameState, maxNumber, finalResults: results.slice(0, 3) });
        }
      }
    } else if (numGuess < winningNumber) {
      socket.emit('guessResult', 'higher');
    } else {
      socket.emit('guessResult', 'lower');
    }
  });

  socket.on('resetGame', () => {
    if (socket.id !== hostId) return;
    gameState = 'LOBBY';
    results = [];
    gameStartTime = null;
    io.emit('gameState', { gameState, maxNumber, playerLimit });
  });

  socket.on('disconnect', () => {
    const wasHost = (socket.id === hostId);
    players = players.filter(p => p.id !== socket.id);

    if (wasHost && players.length > 0) {
      hostId = players[0].id;
      players[0].isHost = true;
    } else if (players.length === 0) {
      hostId = null;
      gameState = 'LOBBY';
    }

    io.emit('playerList', players);
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
