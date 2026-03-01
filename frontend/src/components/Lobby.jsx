import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function Lobby({
    roomId,
    isHost,
    maxNumber,
    setMaxNumber,
    playerLimit,
    setPlayerLimit,
    handleConfigure,
    players,
    playerLimitConfig,
    handleToggleReady,
    handleStart,
    socketId
}) {
    return (
        <div className="lobby-container">
            <div className="room-id-badge">Game ID: {roomId}</div>

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
