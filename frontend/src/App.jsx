import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import mascotLogo from './assets/logo.png';
import './App.css';

const socket = io('http://localhost:3001');

function App() {
  const [username, setUsername] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [gameState, setGameState] = useState('WAITING');
  const [guess, setGuess] = useState('');
  const [feedback, setFeedback] = useState('');
  const [players, setPlayers] = useState([]);
  const [maxNumber, setMaxNumber] = useState(1000);
  const [results, setResults] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    socket.on('gameState', (data) => {
      setGameState(data.gameState);
      if (data.maxNumber) setMaxNumber(data.maxNumber);
      if (data.finalResults) setResults(data.finalResults);
      if (data.gameStartTime) setStartTime(data.gameStartTime);
    });

    socket.on('playerList', (list) => {
      setPlayers(list);
    });

    socket.on('gameStarted', (data) => {
      setGameState('PLAYING');
      setMaxNumber(data.maxNumber);
      setStartTime(data.gameStartTime || Date.now());
      setFeedback('');
      setGuess('');
      setResults([]);
    });

    socket.on('guessResult', (result) => {
      if (result === 'correct') {
        setFeedback('✨ Correct! You got it! ✨');
      } else {
        setFeedback(result === 'higher' ? 'Higher! ⤴️' : 'Lower! ⤵️');
      }
    });

    socket.on('playerFinished', (data) => {
      setResults(data.results);
    });

    return () => {
      socket.off('gameState');
      socket.off('playerList');
      socket.off('gameStarted');
      socket.off('guessResult');
      socket.off('playerFinished');
    };
  }, []);

  useEffect(() => {
    let interval;
    if (gameState === 'PLAYING' && startTime) {
      interval = setInterval(() => {
        setElapsed(((Date.now() - startTime) / 1000).toFixed(2));
      }, 50);
    }
    return () => clearInterval(interval);
  }, [gameState, startTime]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (username.trim()) {
      socket.emit('joinGame', username);
      setIsJoined(true);
    }
  };

  const handleStart = () => {
    socket.emit('startGame', { maxNumber });
  };

  const handleSubmitGuess = (e) => {
    e.preventDefault();
    socket.emit('submitGuess', guess);
  };

  if (!isJoined) {
    return (
      <div className="container">
        <div className="logo-container">
          <img src={mascotLogo} alt="Mascot" className="mascot-logo" />
        </div>
        <h1>Guess the Number</h1>
        <form onSubmit={handleJoin} className="form-card">
          <input
            type="text"
            placeholder="Enter your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <button type="submit">Join Game</button>
        </form>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="logo-container">
        <img src={mascotLogo} alt="Mascot" className="mascot-logo" />
      </div>
      <h1>Guess the Number</h1>

      <div className="status-bar">
        <span>Status: {gameState}</span>
        {gameState === 'PLAYING' && <span className="timer">⏱️ {elapsed}s</span>}
      </div>

      {gameState === 'WAITING' && (
        <div className="lobby">
          <div className="config">
            <label>Max Range: </label>
            <input
              type="number"
              value={maxNumber}
              onChange={(e) => setMaxNumber(parseInt(e.target.value))}
            />
            <button onClick={handleStart} style={{ marginTop: '1rem', width: '100%' }}>
              Start for Everyone 🚀
            </button>
          </div>
          <div className="player-list" style={{ marginTop: '2rem' }}>
            <h3>Joined Players:</h3>
            <ul>
              {players.map(p => <li key={p.id}>{p.username}</li>)}
            </ul>
          </div>
        </div>
      )}

      {gameState === 'PLAYING' && (
        <div className="gameplay">
          <h2>Guess between 1 and {maxNumber}</h2>
          <form onSubmit={handleSubmitGuess}>
            <input
              type="number"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="Your guess..."
              autoFocus
            />
            <button type="submit" style={{ marginTop: '1rem', width: '100%' }}>
              Check Guess
            </button>
          </form>
          <p className="feedback">{feedback}</p>
        </div>
      )}

      {(gameState === 'FINISHED' || results.length > 0) && (
        <div className="leaderboard">
          <h2>Leaderboard</h2>
          <ol>
            {results.map((res, i) => (
              <li key={i}>
                <span>{res.username}</span>
              </li>
            ))}
          </ol>
          {gameState === 'FINISHED' && (
            <button onClick={handleStart} style={{ width: '100%' }}>
              Play Again 🔄
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
