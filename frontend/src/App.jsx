import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import mascotLogo from './assets/logo.png';
import './App.css';
import { speak } from './utils/voice';

// Components
import LandingPage from './components/LandingPage';
import Lobby from './components/Lobby';
import Gameplay from './components/Gameplay';
import Leaderboard from './components/Leaderboard';
import EliminationSetup from './components/EliminationSetup';
import EliminationGameplay from './components/EliminationGameplay';
import EliminationLeaderboard from './components/EliminationLeaderboard';
import CookieDisclaimer from './components/CookieDisclaimer';

// In production, Caddy reverse-proxies /socket.io/ on the same root domain
const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001' : window.location.origin;
const socket = io(SOCKET_URL);

const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room') || '';

function App() {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState(roomFromUrl.toUpperCase());
  const [isHost, setIsHost] = useState(false);
  const [gameState, setGameState] = useState('LOBBY');
  const [guess, setGuess] = useState(500);
  const [feedback, setFeedback] = useState('');
  const [players, setPlayers] = useState([]);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showEarlyLeaderboard, setShowEarlyLeaderboard] = useState(false);
  const [maxNumber, setMaxNumber] = useState(1000);
  const [playerLimit, setPlayerLimit] = useState(2);
  const [results, setResults] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');

  // Elimination mode state
  const [gameMode, setGameMode] = useState('classic');
  const [guessMode, setGuessMode] = useState('single');
  const [maxGuessesPerTarget, setMaxGuessesPerTarget] = useState(20);
  const [eliminationLog, setEliminationLog] = useState([]);
  const [eliminationResults, setEliminationResults] = useState([]);
  const [mySocketId, setMySocketId] = useState('');
  const [isEliminated, setIsEliminated] = useState(false);
  const [currentTargetId, setCurrentTargetId] = useState('');
  // { [playerId]: { guessesMade, guessesReceived, currentGuessCount } }
  const [guessStats, setGuessStats] = useState({});

  const [voiceEnabled, setVoiceEnabledState] = useState(false);
  const voiceEnabledRef = useRef(false);
  const setVoiceEnabled = (v) => { setVoiceEnabledState(v); voiceEnabledRef.current = v; };

  const timerRef = useRef(null);

  useEffect(() => {
    setMySocketId(socket.id);
    socket.on('connect', () => {
      setMySocketId(socket.id);
    });

    socket.on('gameState', (data) => {
      setGameState(data.gameState);
      if (data.maxNumber) setMaxNumber(data.maxNumber);
      if (data.playerLimit) setPlayerLimit(data.playerLimit);
      if (data.finalResults) setResults(data.finalResults);
      if (data.gameStartTime) setStartTime(data.gameStartTime);
      if (data.isHost !== undefined) setIsHost(data.isHost);
      if (data.players) setPlayers(data.players);
      if (data.roomId) setRoomId(data.roomId);
      if (data.gameMode) setGameMode(data.gameMode);
      if (data.guessMode) setGuessMode(data.guessMode);
      if (data.maxGuessesPerTarget) setMaxGuessesPerTarget(data.maxGuessesPerTarget);
      if (data.eliminationResults) setEliminationResults(data.eliminationResults);
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
      setIsCorrect(false);
      setShowEarlyLeaderboard(false);
    });

    socket.on('eliminationGameStarted', (data) => {
      if (voiceEnabledRef.current) speak('Game started!');
      setGameState('PLAYING');
      setMaxNumber(data.maxNumber);
      setStartTime(data.gameStartTime);
      setGuessMode(data.guessMode);
      setMaxGuessesPerTarget(data.maxGuessesPerTarget);
      setPlayers(data.players);
      setEliminationLog([]);
      setIsEliminated(false);
      const firstTarget = data.players.find(p => p.isAlive && p.id !== socket.id);
      if (firstTarget) setCurrentTargetId(firstTarget.id);
      // Init stats for all players
      const initStats = {};
      data.players.forEach(p => {
        initStats[p.id] = { guessesMade: 0, guessesReceived: 0, currentGuessCount: 0, recentGuesses: [] };
      });
      setGuessStats(initStats);
    });

    socket.on('eliminationGuessResult', (logEntry) => {
      if (voiceEnabledRef.current && logEntry.guesserSocketId === socket.id) {
        if (logEntry.result === 'correct') speak(`${logEntry.targetUsername} eliminated!`);
        else speak(logEntry.result === 'higher' ? 'Higher' : 'Lower');
      }
      setEliminationLog(prev => [logEntry, ...prev]);
      setGuessStats(prev => {
        const next = { ...prev };
        // Increment guesser's made count
        if (next[logEntry.guesserSocketId]) {
          next[logEntry.guesserSocketId] = {
            ...next[logEntry.guesserSocketId],
            guessesMade: next[logEntry.guesserSocketId].guessesMade + 1
          };
        }
        // Increment target's received + current count, append to recentGuesses (last 5)
        if (next[logEntry.targetSocketId]) {
          const prev5 = next[logEntry.targetSocketId].recentGuesses ?? [];
          const updated5 = [...prev5, { guess: logEntry.guess, result: logEntry.result }].slice(-5);
          next[logEntry.targetSocketId] = {
            ...next[logEntry.targetSocketId],
            guessesReceived: next[logEntry.targetSocketId].guessesReceived + 1,
            currentGuessCount: next[logEntry.targetSocketId].currentGuessCount + 1,
            recentGuesses: updated5
          };
        }
        return next;
      });
    });

    socket.on('playerEliminated', (data) => {
      if (data.eliminatedId === socket.id) {
        setIsEliminated(true);
      }
    });

    socket.on('targetRerolled', (data) => {
      setEliminationLog(prev => [{
        system: true,
        message: `${data.targetUsername}'s number was rerolled — fresh start!`,
        targetSocketId: data.targetSocketId
      }, ...prev]);
      // Reset currentGuessCount for the rerolled target
      setGuessStats(prev => {
        if (!prev[data.targetSocketId]) return prev;
        return {
          ...prev,
          [data.targetSocketId]: {
            ...prev[data.targetSocketId],
            currentGuessCount: 0,
            recentGuesses: []
          }
        };
      });
    });

    socket.on('guessResult', (result) => {
      if (result === 'correct') {
        setFeedback('✨ Correct! You got it! ✨');
        setIsCorrect(true);
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

    socket.on('kicked', (msg) => {
      setGameState('LOBBY');
      setRoomId('');
      setJoinRoomId('');
      setUsername('');
      setIsHost(false);
      setPlayers([]);
      setError(msg);
    });

    return () => {
      socket.off('connect');
      socket.off('gameState');
      socket.off('roomCreated');
      socket.off('playerList');
      socket.off('gameStarted');
      socket.off('eliminationGameStarted');
      socket.off('eliminationGuessResult');
      socket.off('playerEliminated');
      socket.off('targetRerolled');
      socket.off('guessResult');
      socket.off('playerFinished');
      socket.off('error');
      socket.off('kicked');
    };
  }, []);

  useEffect(() => {
    if (gameState === 'PLAYING' && startTime && gameMode === 'classic' && !isCorrect) {
      timerRef.current = setInterval(() => {
        const now = Date.now();
        const diff = Math.max(0, (now - startTime) / 1000);
        setElapsed(diff.toFixed(2));
      }, 50);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [gameState, startTime, gameMode, isCorrect]);

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
    socket.emit('configureGame', { maxNumber, playerLimit, gameMode, guessMode, maxGuessesPerTarget });
  };

  const handleStart = () => {
    // Always sync current lobby settings to backend before starting,
    // so the host doesn't need to click "Set Configuration" separately.
    socket.emit('startGame', { maxNumber, playerLimit, gameMode, guessMode, maxGuessesPerTarget });
  };

  const handleSubmitGuess = (e) => {
    e.preventDefault();
    socket.emit('submitGuess', guess);
  };

  const handleReset = () => {
    socket.emit('resetGame');
    setEliminationLog([]);
    setEliminationResults([]);
    setIsEliminated(false);
    setCurrentTargetId('');
    setGuessStats({});
    setIsCorrect(false);
    setShowEarlyLeaderboard(false);
  };

  const handleToggleReady = () => {
    socket.emit('toggleReady');
  };

  const handleSubmitSecretNumber = (secretNumber) => {
    socket.emit('submitSecretNumber', { secretNumber });
  };

  const handleEliminationGuess = (targetId, guessValue) => {
    socket.emit('submitEliminationGuess', { targetId, guess: guessValue });
  };

  const handleKickPlayer = (targetSocketId) => {
    socket.emit('kickPlayer', { targetSocketId });
  };

  function renderView() {
    if (roomId === '') {
      return (
        <LandingPage
          key="landing"
          username={username}
          setUsername={setUsername}
          handleCreateRoom={handleCreateRoom}
          joinRoomId={joinRoomId}
          setJoinRoomId={setJoinRoomId}
          handleJoinRoom={handleJoinRoom}
        />
      );
    }

    if (gameState === 'LOBBY' || gameState === 'WAITING') {
      return (
        <Lobby
          key="lobby"
          roomId={roomId}
          isHost={isHost}
          maxNumber={maxNumber}
          setMaxNumber={setMaxNumber}
          playerLimit={playerLimit}
          setPlayerLimit={setPlayerLimit}
          gameMode={gameMode}
          setGameMode={setGameMode}
          guessMode={guessMode}
          setGuessMode={setGuessMode}
          maxGuessesPerTarget={maxGuessesPerTarget}
          setMaxGuessesPerTarget={setMaxGuessesPerTarget}
          handleConfigure={handleConfigure}
          players={players}
          playerLimitConfig={playerLimit}
          handleToggleReady={handleToggleReady}
          handleStart={handleStart}
          socketId={socket.id}
          handleKickPlayer={handleKickPlayer}
        />
      );
    }

    if (gameMode === 'elimination') {
      if (gameState === 'SETUP') {
        return (
          <EliminationSetup
            key="elim-setup"
            players={players}
            maxNumber={maxNumber}
            mySocketId={mySocketId}
            onSubmitSecretNumber={handleSubmitSecretNumber}
          />
        );
      }
      if (gameState === 'PLAYING') {
        return (
          <EliminationGameplay
            key="elim-gameplay"
            players={players}
            mySocketId={mySocketId}
            isEliminated={isEliminated}
            guessMode={guessMode}
            maxNumber={maxNumber}
            maxGuessesPerTarget={maxGuessesPerTarget}
            currentTargetId={currentTargetId}
            setCurrentTargetId={setCurrentTargetId}
            eliminationLog={eliminationLog}
            guessStats={guessStats}
            onSubmitGuess={handleEliminationGuess}
            voiceEnabled={voiceEnabled}
            setVoiceEnabled={setVoiceEnabled}
          />
        );
      }
      if (gameState === 'FINISHED') {
        return (
          <EliminationLeaderboard
            key="elim-leaderboard"
            results={eliminationResults}
            isHost={isHost}
            handleReset={handleReset}
          />
        );
      }
    }

    if (gameState === 'PLAYING' && !showEarlyLeaderboard) {
      return (
        <Gameplay
          key="gameplay"
          elapsed={elapsed}
          guess={guess}
          maxNumber={maxNumber}
          setGuess={setGuess}
          handleSubmitGuess={handleSubmitGuess}
          feedback={feedback}
          isCorrect={isCorrect}
          setShowEarlyLeaderboard={setShowEarlyLeaderboard}
          voiceEnabled={voiceEnabled}
          setVoiceEnabled={setVoiceEnabled}
        />
      );
    }

    if (gameState === 'FINISHED' || showEarlyLeaderboard) {
      return (
        <Leaderboard
          key="leaderboard"
          results={results}
          isHost={isHost && gameState === 'FINISHED'}
          handleReset={handleReset}
        />
      );
    }

    return null;
  }

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
        {renderView()}
      </AnimatePresence>

      <CookieDisclaimer />
    </div>
  );
}

export default App;
