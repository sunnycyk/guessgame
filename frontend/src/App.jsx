import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import mascotLogo from './assets/logo.png';
import './App.css';

const socket = io('http://localhost:3001');

function App() {
  const [username, setUsername] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [gameState, setGameState] = useState('LOBBY');
  const [guess, setGuess] = useState('');
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
      console.log('Received GameState:', data);
      setGameState(data.gameState);
      if (data.maxNumber) setMaxNumber(data.maxNumber);
      if (data.playerLimit) setPlayerLimit(data.playerLimit);
      if (data.finalResults) setResults(data.finalResults);
      if (data.gameStartTime) setStartTime(data.gameStartTime);
      if (data.isHost !== undefined) setIsHost(data.isHost);
      if (data.players) setPlayers(data.players);
    });

    socket.on('playerList', (list) => {
      setPlayers(list);
    });

    socket.on('gameStarted', (data) => {
      setGameState('PLAYING');
      setMaxNumber(data.maxNumber);
      setStartTime(data.gameStartTime);
      setFeedback('');
      setGuess('');
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
      setIsJoined(false);
    });

    return () => {
      socket.off('gameState');
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

  const handleJoin = (e) => {
    e.preventDefault();
    if (username.trim()) {
      socket.emit('joinGame', username);
      setIsJoined(true);
      setError('');
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
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

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
        {gameState === 'LOBBY' && isHost && (
          <motion.div
            key="host-config"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="host-config"
          >
            <h2>Create Game</h2>
            <form onSubmit={handleConfigure} className="form-card">
              <div className="input-group">
                <label>Max Number</label>
                <input
                  type="number"
                  value={maxNumber}
                  onChange={(e) => setMaxNumber(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>Number of Players</label>
                <input
                  type="number"
                  value={playerLimit}
                  onChange={(e) => setPlayerLimit(e.target.value)}
                />
              </div>
              <button type="submit">Set Configuration</button>
            </form>
          </motion.div>
        )}

        {gameState === 'LOBBY' && !isHost && (
          <motion.div
            key="waiting-host"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="waiting-room"
          >
            <h2>Waiting for Host...</h2>
            <p>The host is currently configuring the game settings.</p>
          </motion.div>
        )}

        {gameState === 'WAITING' && (
          <motion.div
            key="waiting-room"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="waiting-room"
          >
            <h2>Waiting Room</h2>
            <div className="status-bar">
              <span>Players: {players.length} / {playerLimit}</span>
            </div>
            <div className="player-list">
              <AnimatePresence>
                <ul>
                  {players.map(p => (
                    <motion.li
                      key={p.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={p.isReady ? 'ready' : ''}
                    >
                      {p.username} {p.isHost && '👑'} {p.isReady && '✅'}
                    </motion.li>
                  ))}
                </ul>
              </AnimatePresence>
            </div>

            {!isHost && (
              <button
                onClick={handleToggleReady}
                className={`ready-button ${players.find(p => p.id === socket.id)?.isReady ? 'active' : ''}`}
                style={{ marginTop: '2rem', width: '100%' }}
              >
                {players.find(p => p.id === socket.id)?.isReady ? 'I am Ready! ✅' : 'Mark as Ready'}
              </button>
            )}

            {isHost && (
              <button
                onClick={handleStart}
                disabled={players.length < playerLimit || !players.every(p => p.isReady || p.isHost)}
                style={{ marginTop: '2rem', width: '100%' }}
              >
                {players.length < playerLimit
                  ? `Need ${playerLimit - players.length} more players`
                  : !players.every(p => p.isReady || p.isHost)
                    ? 'Waiting for players to be ready...'
                    : 'Start Game 🚀'}
              </button>
            )}
          </motion.div>
        )}

        {gameState === 'PLAYING' && (
          <motion.div
            key="gameplay"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="gameplay"
          >
            <div className="status-bar">
              <span className="timer">⏱️ {elapsed}s</span>
            </div>
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
            <motion.p
              className="feedback"
              key={feedback}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              {feedback}
            </motion.p>
          </motion.div>
        )}

        {gameState === 'FINISHED' && (
          <motion.div
            key="leaderboard"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="leaderboard"
          >
            <h2>Leaderboard</h2>
            <ol>
              {results.map((res, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <span>{res.username}</span>
                  <span>{res.time.toFixed(2)}s</span>
                </motion.li>
              ))}
            </ol>
            {isHost && (
              <button onClick={handleReset} style={{ width: '100%' }}>
                Play Again 🔄
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
