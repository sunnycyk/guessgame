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

let gameState = 'WAITING'; // WAITING, STARTING, PLAYING, FINISHED
let winningNumber = null;
let maxNumber = 1000;
let players = [];
let results = [];
let gameStartTime = null;

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('joinGame', (username) => {
    const player = { id: socket.id, username, finishTime: null };
    players.push(player);
    io.emit('playerList', players);
    socket.emit('gameState', { gameState, maxNumber, gameStartTime });
  });

  socket.on('startGame', (config) => {
    if (config && config.maxNumber) maxNumber = config.maxNumber;
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
        results.push({ username: player.username, time: finishTime });
        socket.emit('guessResult', 'correct');
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

  socket.on('disconnect', () => {
    players = players.filter(p => p.id !== socket.id);
    io.emit('playerList', players);
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
