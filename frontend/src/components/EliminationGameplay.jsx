import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { canRecognize, canSpeak, startVoiceInput, speak, logVoiceStatus, parseEliminationVoice } from '../utils/voice';

function getGuessColor(current, max) {
  if (!max || current === 0) return null;
  const ratio = current / max;
  if (ratio >= 0.9) return 'danger';
  if (ratio >= 0.75) return 'warning-high';
  if (ratio >= 0.5) return 'warning-low';
  return null;
}

// Compute square-ish grid columns: 2x2 for 4, 3x3 for 9, etc.
function getGridCols(count) {
  return Math.ceil(Math.sqrt(count));
}

function PlayerCard({ player, stats, maxGuessesPerTarget, isMe, isCurrentTarget, onSelectTarget, localGuessMode }) {
  const current = stats?.currentGuessCount ?? 0;
  const received = stats?.guessesReceived ?? 0;
  const made = stats?.guessesMade ?? 0;
  const recentGuesses = stats?.recentGuesses ?? [];
  const colorClass = getGuessColor(current, maxGuessesPerTarget);
  const progressPct = maxGuessesPerTarget ? Math.min(100, (current / maxGuessesPerTarget) * 100) : 0;
  const clickable = player.isAlive && !isMe && localGuessMode === 'single';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={[
        'player-card',
        !player.isAlive ? 'player-card-eliminated' : '',
        isMe ? 'player-card-me' : '',
        isCurrentTarget && localGuessMode === 'single' ? 'player-card-targeted' : ''
      ].filter(Boolean).join(' ')}
      onClick={() => { if (clickable) onSelectTarget(player.id); }}
      style={{ cursor: clickable ? 'pointer' : 'default' }}
      title={clickable ? 'Click to target' : ''}
    >
      {/* Header */}
      <div className="player-card-header">
        <span className="player-card-name">
          {player.username}
          {player.isHost && ' 👑'}
          {isMe && ' (you)'}
        </span>
        <span className={`player-card-status ${player.isAlive ? 'status-alive' : 'status-eliminated'}`}>
          {player.isAlive ? '●' : '✕'}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="player-card-stats">
        <div className="stat-cell">
          <span className="stat-label">Elims</span>
          <span className="stat-value elim-value">{player.eliminations ?? 0}</span>
        </div>
        <div className="stat-cell">
          <span className="stat-label">Made</span>
          <span className="stat-value">{made}</span>
        </div>
        <div className="stat-cell">
          <span className="stat-label">Received</span>
          <span className="stat-value">{received}</span>
        </div>
        <div className={`stat-cell stat-cell-current ${colorClass ? `stat-cell-${colorClass}` : ''}`}>
          <span className="stat-label">Since Reset</span>
          <span className="stat-value stat-value-current">{current} / {maxGuessesPerTarget}</span>
        </div>
      </div>

      {/* Progress bar */}
      {player.isAlive && (
        <div className="guess-progress-bar-track">
          <div
            className={`guess-progress-bar-fill ${colorClass ? `fill-${colorClass}` : 'fill-safe'}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* Last 5 guesses strip */}
      {recentGuesses.length > 0 && (
        <div className="recent-guesses">
          {recentGuesses.map((g, i) => (
            <span key={i} className={`guess-chip guess-chip-${g.result}`}>
              {g.guess}
            </span>
          ))}
        </div>
      )}

      {isCurrentTarget && localGuessMode === 'single' && player.isAlive && !isMe && (
        <div className="targeted-badge">TARGET</div>
      )}
    </motion.div>
  );
}

function EliminationGameplay({
  players,
  mySocketId,
  isEliminated,
  guessMode: initialGuessMode,
  maxNumber,
  maxGuessesPerTarget,
  currentTargetId,
  setCurrentTargetId,
  eliminationLog,
  guessStats,
  onSubmitGuess,
  voiceControlsEnabled,
  setVoiceControlsEnabled,
  voiceEnabled,
  setVoiceEnabled,
}) {
  const [guess, setGuess] = useState(Math.floor(maxNumber / 2));
  // Local guess mode toggle — starts from room config but player can switch mid-game
  const [localGuessMode, setLocalGuessMode] = useState(initialGuessMode);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState('');
  const recognitionRef = useRef(null);
  const sessionRef = useRef(0);

  // Abort recognition when voice controls are disabled
  useEffect(() => {
    if (!voiceControlsEnabled) {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      setListening(false);
    }
  }, [voiceControlsEnabled]);

  // Cancel recognition when tab is hidden
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        recognitionRef.current?.abort();
        recognitionRef.current = null;
        setListening(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const handleMicClick = () => {
    if (listening) {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      setListening(false);
      return;
    }
    sessionRef.current += 1;
    const session = sessionRef.current;
    setListening(true);
    const aliveOpponents = players.filter(p => p.isAlive && p.id !== mySocketId);
    recognitionRef.current = startVoiceInput({
      onResult: (transcripts) => {
        if (sessionRef.current !== session) return;
        recognitionRef.current = null;
        setListening(false);
        const { targetId, guessValue } = parseEliminationVoice(transcripts, aliveOpponents, maxNumber);
        if (targetId) {
          setCurrentTargetId(targetId);
          setLocalGuessMode('single');
          const name = players.find(p => p.id === targetId)?.username ?? '';
          if (voiceEnabled) speak(`Targeting ${name.replace(/^\[.*?\]\s*/, '')}`);
        }
        if (guessValue) {
          setGuess(guessValue);
          onSubmitGuess(targetId ?? (localGuessMode === 'all' ? null : currentTargetId), guessValue);
        }
      },
      onError: (err) => {
        if (sessionRef.current !== session) return;
        recognitionRef.current = null;
        setListening(false);
        if (err === 'network') setMicError('Mic blocked (network) — lower Brave Shields or enable Google services in Brave settings');
        else if (err === 'not-allowed') setMicError('Microphone access denied — allow mic in browser/system settings');
        else if (err && err !== 'aborted') setMicError(`Mic error: ${err}`);
      },
      onEnd: () => {
        if (sessionRef.current !== session) return;
        recognitionRef.current = null;
        setListening(false);
      },
    });
  };

  const alivePlayers = players.filter(p => p.isAlive);
  const aliveOpponents = alivePlayers.filter(p => p.id !== mySocketId);
  const cols = getGridCols(players.length);

  // Auto-switch target if current target is eliminated
  useEffect(() => {
    if (currentTargetId && !aliveOpponents.find(p => p.id === currentTargetId)) {
      const next = aliveOpponents[0];
      if (next) setCurrentTargetId(next.id);
    }
  }, [players]);

  const handleSubmit = (e) => {
    e.preventDefault();
    // null targetId → server targets all alive opponents
    const targetId = localGuessMode === 'all' ? null : currentTargetId;
    onSubmitGuess(targetId, guess);
  };

  const targetName = players.find(p => p.id === currentTargetId)?.username ?? '—';

  return (
    <motion.div
      key="elimination-gameplay"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="elimination-gameplay"
    >
      {/* Player Grid — square layout */}
      <div
        className="player-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {players.map(player => (
          <PlayerCard
            key={player.id}
            player={player}
            stats={guessStats[player.id]}
            maxGuessesPerTarget={maxGuessesPerTarget}
            isMe={player.id === mySocketId}
            isCurrentTarget={player.id === currentTargetId}
            onSelectTarget={setCurrentTargetId}
            localGuessMode={localGuessMode}
          />
        ))}
      </div>

      {/* Guess Input Panel */}
      {isEliminated ? (
        <div className="spectator-banner">
          You have been eliminated. Spectating... 👀
        </div>
      ) : (
        <div className="elim-guess-panel">
          {/* Guess mode toggle */}
          <div className="guess-mode-toggle">
            <button
              type="button"
              className={`mode-btn ${localGuessMode === 'single' ? 'mode-btn-active' : ''}`}
              onClick={() => setLocalGuessMode('single')}
            >
              One Target
            </button>
            <button
              type="button"
              className={`mode-btn ${localGuessMode === 'all' ? 'mode-btn-active' : ''}`}
              onClick={() => setLocalGuessMode('all')}
            >
              All Players
            </button>
          </div>

          {localGuessMode === 'single' && aliveOpponents.length > 0 && (
            <p className="guess-mode-label">
              Targeting: <strong>{targetName}</strong>
              <span style={{ fontSize: '0.72rem', marginLeft: '0.4rem', opacity: 0.65 }}>(click a card to switch)</span>
            </p>
          )}
          {localGuessMode === 'all' && (
            <p className="guess-mode-label">Guessing against all {alivePlayers.length} alive players</p>
          )}

          <form onSubmit={handleSubmit}>
            <div className="guess-input-group">
              <button type="button" className="fine-tune-btn"
                onClick={() => setGuess(g => Math.max(1, g - 1))} disabled={guess <= 1}>-1</button>
              <input
                type="number" min="1" max={maxNumber} value={guess}
                onChange={(e) => setGuess(Math.min(maxNumber, Math.max(1, parseInt(e.target.value) || 1)))}
                onBlur={(e) => setGuess(Math.min(maxNumber, Math.max(1, parseInt(e.target.value) || 1)))}
                className="colored-input guess-number-box"
              />
              <button type="button" className="fine-tune-btn"
                onClick={() => setGuess(g => Math.min(maxNumber, g + 1))} disabled={guess >= maxNumber}>+1</button>
            </div>
            <div className="slider-container">
              <input type="range" min="1" max={maxNumber} value={guess}
                onChange={(e) => setGuess(parseInt(e.target.value))}
                className="cartoon-slider" />
            </div>
            <button type="submit" style={{ marginTop: '0.75rem', width: '100%' }}>
              Submit Guess
            </button>
          </form>

          <div className="voice-section">
            <button
              type="button"
              className={`voice-beta-toggle ${voiceControlsEnabled ? 'active' : ''}`}
              onClick={() => setVoiceControlsEnabled(v => !v)}
              title={voiceControlsEnabled ? 'Disable voice controls' : 'Enable voice controls (Beta)'}
            >
              🎙 Voice <span className="beta-badge">BETA</span>
            </button>
            {voiceControlsEnabled && (
              <>
                <div className="voice-controls">
                  {canRecognize() && (
                    <button
                      type="button"
                      className={`mic-btn ${listening ? 'listening' : ''}`}
                      onClick={handleMicClick}
                      title={listening ? 'Listening… (tap to cancel)' : 'Say a name to target, or a number to set your guess'}
                    >
                      🎤
                    </button>
                  )}
                  {canSpeak() && (
                    <>
                      <button
                        type="button"
                        className={`voice-toggle-btn ${voiceEnabled ? 'voice-on' : ''}`}
                        onClick={() => { logVoiceStatus(); setVoiceEnabled(!voiceEnabled); }}
                        title={voiceEnabled ? 'Mute voice announcements' : 'Enable voice announcements'}
                      >
                        {voiceEnabled ? '🔊' : '🔇'}
                      </button>
                      <button
                        type="button"
                        className="voice-test-btn"
                        onClick={() => speak('Testing voice')}
                        title="Test speaker directly"
                      >
                        Test
                      </button>
                    </>
                  )}
                </div>
                {canRecognize() && (
                  <p className="voice-hint">🎤 Say <em>"Cortex"</em> to target, <em>"350"</em> to guess, or <em>"Cortex 350"</em> for both</p>
                )}
                {!canRecognize() && !canSpeak() && (
                  <p className="voice-hint voice-blocked">⚠️ Voice not available — check browser permissions or lower privacy shields</p>
                )}
                {!canRecognize() && canSpeak() && (
                  <p className="voice-hint voice-blocked">🎤 Mic blocked — Brave users: lower Shields for this site</p>
                )}
                {micError && (
                  <p className="voice-hint voice-blocked" onClick={() => setMicError('')} style={{ cursor: 'pointer' }}>⚠️ {micError}</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Public Guess Log */}
      <div className="elim-log">
        <h3>Guess Log</h3>
        {eliminationLog.length === 0 && (
          <p style={{ color: '#be185d', fontSize: '0.85rem', fontStyle: 'italic' }}>
            No guesses yet — be the first!
          </p>
        )}
        <AnimatePresence>
          {eliminationLog.map((entry, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`log-entry ${entry.system ? 'log-system' : `log-${entry.result}`}`}
            >
              {entry.system ? (
                <span className="log-system-text">{entry.message}</span>
              ) : (
                <span>
                  <strong>{entry.guesserUsername}</strong> guessed{' '}
                  <strong>{entry.guess}</strong> for{' '}
                  <strong>{entry.targetUsername}</strong>:{' '}
                  <span className={`log-result result-${entry.result}`}>
                    {entry.result === 'correct' ? '✅ CORRECT — ELIMINATED!'
                      : entry.result === 'higher' ? '⬆ Go Higher' : '⬇ Go Lower'}
                  </span>
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default EliminationGameplay;
