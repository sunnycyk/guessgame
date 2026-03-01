import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function Lobby({
    roomId,
    isHost,
    maxNumber,
    setMaxNumber,
    playerLimit,
    setPlayerLimit,
    gameMode,
    setGameMode,
    guessMode,
    setGuessMode,
    maxGuessesPerTarget,
    setMaxGuessesPerTarget,
    handleConfigure,
    players,
    playerLimitConfig,
    handleToggleReady,
    handleStart,
    socketId
}) {
    return (
        <div className="lobby-container">
            <div className="room-id-badge" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                <div>Game ID: {roomId}</div>
                <button
                    onClick={() => {
                        const url = `${window.location.origin}?room=${roomId}`;
                        navigator.clipboard.writeText(url);
                        alert('Share link copied to clipboard!');
                    }}
                    style={{
                        fontSize: '0.9rem',
                        padding: '0.3rem 0.8rem',
                        backgroundColor: 'rgba(255,255,255,0.3)',
                        color: 'var(--text)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        marginTop: '0.5rem'
                    }}
                >
                    Copy Invite Link 🔗
                </button>
            </div>

            {isHost ? (
                <motion.div
                    key="host-config"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="host-config"
                >
                    <h2>Game Setup</h2>
                    <form onSubmit={handleConfigure} className="form-card">
                        <div className="input-group">
                            <label>Max Number</label>
                            <input
                                type="number"
                                min="10"
                                value={maxNumber || ''}
                                onChange={(e) => setMaxNumber(parseInt(e.target.value))}
                                className="colored-input"
                            />
                        </div>
                        <div className="input-group">
                            <label>Players Needed</label>
                            <input
                                type="number"
                                min="1"
                                max="100"
                                value={playerLimitConfig || ''}
                                onChange={(e) => setPlayerLimit(parseInt(e.target.value))}
                                className="colored-input"
                            />
                        </div>

                        <div className="input-group">
                            <label>Game Mode</label>
                            <div className="mode-selector">
                                <button
                                    type="button"
                                    className={`mode-btn ${gameMode === 'classic' ? 'mode-btn-active' : ''}`}
                                    onClick={() => setGameMode('classic')}
                                >
                                    Classic
                                </button>
                                <button
                                    type="button"
                                    className={`mode-btn ${gameMode === 'elimination' ? 'mode-btn-active' : ''}`}
                                    onClick={() => setGameMode('elimination')}
                                >
                                    Elimination
                                </button>
                            </div>
                        </div>

                        <AnimatePresence>
                            {gameMode === 'elimination' && (
                                <motion.div
                                    key="elim-config"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="elim-config-section"
                                >
                                    <div className="input-group">
                                        <label>Guess Mode</label>
                                        <div className="mode-selector">
                                            <button
                                                type="button"
                                                className={`mode-btn ${guessMode === 'single' ? 'mode-btn-active' : ''}`}
                                                onClick={() => setGuessMode('single')}
                                            >
                                                One Target
                                            </button>
                                            <button
                                                type="button"
                                                className={`mode-btn ${guessMode === 'all' ? 'mode-btn-active' : ''}`}
                                                onClick={() => setGuessMode('all')}
                                            >
                                                All at Once
                                            </button>
                                        </div>
                                        <p className="hint-text">
                                            {guessMode === 'single'
                                                ? 'Each guess targets one player you choose.'
                                                : 'Each guess is checked against every alive player simultaneously.'}
                                        </p>
                                    </div>
                                    <div className="input-group">
                                        <label>Max Guesses Per Target (before reroll)</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={maxGuessesPerTarget || ''}
                                            onChange={(e) => setMaxGuessesPerTarget(parseInt(e.target.value))}
                                            className="colored-input"
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button type="submit">Set Configuration</button>
                    </form>
                </motion.div>
            ) : (
                <motion.div
                    key="waiting-host"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="waiting-room"
                >
                    <h2>Waiting room</h2>
                    <p>The host is setting up the game...</p>
                    {gameMode === 'elimination' && (
                        <div className="mode-badge elim-badge">Elimination Mode</div>
                    )}
                    {gameMode === 'classic' && (
                        <div className="mode-badge classic-badge">Classic Mode</div>
                    )}
                </motion.div>
            )}

            <div className="status-bar" style={{ marginTop: '2rem' }}>
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
                    className={`ready-button ${players.find(p => p.id === socketId)?.isReady ? 'active' : ''}`}
                    style={{ marginTop: '2rem', width: '100%' }}
                >
                    {players.find(p => p.id === socketId)?.isReady ? 'I am Ready! ✅' : 'Mark as Ready'}
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
        </div>
    );
}

export default Lobby;
