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
    socketId,
    handleStart,
    socketId,
    handleKickPlayer
}) {

    const FUN_COLORS = [
        'rgba(254, 202, 202, 0.4)', 'rgba(254, 240, 138, 0.4)', 'rgba(217, 249, 157, 0.4)',
        'rgba(187, 247, 208, 0.4)', 'rgba(167, 243, 208, 0.4)', 'rgba(153, 246, 228, 0.4)',
        'rgba(186, 230, 253, 0.4)', 'rgba(191, 219, 254, 0.4)', 'rgba(199, 210, 254, 0.4)',
        'rgba(233, 213, 255, 0.4)', 'rgba(251, 207, 232, 0.4)', 'rgba(254, 205, 211, 0.4)'
    ];

    const getPlayerColor = (id) => {
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        return FUN_COLORS[Math.abs(hash) % FUN_COLORS.length];
    };

    const handleShare = async () => {
        const url = `${window.location.origin}?room=${roomId}`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Guess the Number',
                    text: 'Join my Guess the Number game!',
                    url: url
                });
                return;
            } catch (err) {
                console.error('Error sharing', err);
            }
        }
        navigator.clipboard.writeText(url);
        alert('Share link copied to clipboard!');
    };

    return (
        <div className="lobby-container">
            <div className="room-id-badge" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                <div>Game ID: {roomId}</div>
                <button
                    onClick={handleShare}
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
                    Share Invite Link 🔗
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
                            <label>Max Players</label>
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
                                style={{ backgroundColor: getPlayerColor(p.id) }}
                            >
                                {p.username} {p.isHost && '👑'} {p.isReady && '✅'}
                                {isHost && !p.isHost && (
                                    <button
                                        type="button"
                                        onClick={() => handleKickPlayer(p.id)}
                                        style={{ marginLeft: '10px', fontSize: '0.8rem', padding: '2px 6px', background: '#ffffff', border: '1px solid #ef4444', color: '#ef4444', cursor: 'pointer', borderRadius: '4px' }}
                                    >
                                        Boot 👢
                                    </button>
                                )}
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
                    disabled={players.length < 2 || !players.every(p => p.isReady || p.isHost)}
                    style={{ marginTop: '2rem', width: '100%' }}
                >
                    {players.length < 2
                        ? 'Need at least 2 players'
                        : !players.every(p => p.isReady || p.isHost)
                            ? 'Waiting for everyone to be ready...'
                            : 'Start Game 🚀'}
                </button>
            )}
        </div>
    );
}

export default Lobby;
