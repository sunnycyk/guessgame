import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import mascotLogo from './assets/logo.png';
import './App.css';

// Components
import LandingPage from './components/LandingPage';
import Lobby from './components/Lobby';
import Gameplay from './components/Gameplay';
import Leaderboard from './components/Leaderboard';

// In production via Docker, the backend is exposed on port 3001 of the same host IP
const SOCKET_URL = `http://${window.location.hostname}:3001`;
const socket = io(SOCKET_URL);

function App() {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [gameState, setGameState] = useState('LOBBY');
  const [guess, setGuess] = useState(500);
  const [feedback, setFeedback] = useState('');
  const [players, setPlayers] = useState([]);
  const [maxNumber, setMaxNumber] = useState(1000);
  const [playerLimit, setPlayerLimit] = useState(2);
  const [results, setResults] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');

  const timerRef = useRef(null);

  useEffect(() => {
    socket.on('gameState', (data) => {
      setGameState(data.gameState);
      if (data.maxNumber) setMaxNumber(data.maxNumber);
      if (data.playerLimit) setPlayerLimit(data.playerLimit);
      if (data.finalResults) setResults(data.finalResults);
      if (data.gameStartTime) setStartTime(data.gameStartTime);
      if (data.isHost !== undefined) setIsHost(data.isHost);
      if (data.players) setPlayers(data.players);
      if (data.roomId) setRoomId(data.roomId);
    });

    socket.on('roomCreated', (data) => {
      setRoomId(data.roomId);
      setGameState(data.gameState);
      setIsHost(data.isHost);
      setPlayers(data.players);
    });

    socket.on('playerList', (list) => {
      setPlayers(list);
    });

    socket.on('gameStarted', (data) => {
      setGameState('PLAYING');
      setMaxNumber(data.maxNumber);
      setStartTime(data.gameStartTime);
      setFeedback('');
      setGuess(Math.floor(data.maxNumber / 2));
      setResults([]);
      setElapsed(0);
    });

    socket.on('guessResult', (result) => {
      if (result === 'correct') {
        setFeedback('✨ Correct! You got it! ✨');
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#ec4899', '#d946ef', '#f472b6']
        });
      } else {
        setFeedback(result === 'higher' ? 'Higher! ⤴️' : 'Lower! ⤵️');
      }
    });

    socket.on('playerFinished', (data) => {
      setResults(data.results);
    });

    socket.on('error', (msg) => {
      setError(msg);
    });

    return () => {
      socket.off('gameState');
      socket.off('roomCreated');
      socket.off('playerList');
      socket.off('gameStarted');
      socket.off('guessResult');
      socket.off('playerFinished');
      socket.off('error');
    };
  }, []);

  useEffect(() => {
    if (gameState === 'PLAYING' && startTime) {
      timerRef.current = setInterval(() => {
        const now = Date.now();
        const diff = Math.max(0, (now - startTime) / 1000);
        setElapsed(diff.toFixed(2));
      }, 50);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [gameState, startTime]);

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (username.trim()) {
      socket.emit('createRoom', { username });
      setError('');
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (username.trim() && joinRoomId.trim()) {
      socket.emit('joinRoom', { roomId: joinRoomId.trim().toUpperCase(), username });
      setError('');
    } else if (!username.trim()) {
      setError('Please enter your name first');
    } else if (!joinRoomId.trim()) {
      setError('Please enter a Room ID to join');
    }
  };

  const handleConfigure = (e) => {
    e.preventDefault();
    socket.emit('configureGame', { maxNumber, playerLimit });
  };

  const handleStart = () => {
    socket.emit('startGame');
  };

  const handleSubmitGuess = (e) => {
    e.preventDefault();
    socket.emit('submitGuess', guess);
  };

  const handleReset = () => {
    socket.emit('resetGame');
  };

  const handleToggleReady = () => {
    socket.emit('toggleReady');
  };

  if (error) {
    return (
      <div className="container">
        <h1>Error</h1>
        <p>{error}</p>
        <button onClick={() => setError('')}>Back</button>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="logo-container">
        <motion.img
          src={mascotLogo}
          alt="Mascot"
          className="mascot-logo"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Guess the Number
      </motion.h1>

      <AnimatePresence mode="wait">
        {roomId === '' ? (
          <LandingPage
            username={username}
            setUsername={setUsername}
            handleCreateRoom={handleCreateRoom}
            joinRoomId={joinRoomId}
            setJoinRoomId={setJoinRoomId}
            handleJoinRoom={handleJoinRoom}
          />
        ) : gameState === 'LOBBY' || gameState === 'WAITING' ? (
          <Lobby
            roomId={roomId}
            isHost={isHost}
            maxNumber={maxNumber}
            setMaxNumber={setMaxNumber}
            playerLimit={playerLimit}
            setPlayerLimit={setPlayerLimit}
            handleConfigure={handleConfigure}
            players={players}
            playerLimitConfig={playerLimit}
            handleToggleReady={handleToggleReady}
            handleStart={handleStart}
            socketId={socket.id}
          />
        ) : gameState === 'PLAYING' ? (
          <Gameplay
            elapsed={elapsed}
            guess={guess}
            maxNumber={maxNumber}
            setGuess={setGuess}
            handleSubmitGuess={handleSubmitGuess}
            feedback={feedback}
          />
        ) : gameState === 'FINISHED' ? (
          <Leaderboard
            results={results}
            isHost={isHost}
            handleReset={handleReset}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default App;
