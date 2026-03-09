import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

function TournamentMatch({ bracket, mySocketId, maxNumber, onSubmitGuess, feedback, isCorrect }) {
    const [guess, setGuess] = useState(Math.floor(maxNumber / 2));

    if (!bracket || bracket.activeRoundIdx === null) return null;

    const match = bracket.rounds[bracket.activeRoundIdx][bracket.activeMatchIdx];
    if (!match) return null;

    const amPlayer = mySocketId === match.p1Id || mySocketId === match.p2Id;
    const opponentId = mySocketId === match.p1Id ? match.p2Id : match.p1Id;
    const opponentName = mySocketId === match.p1Id ? match.p2Username : match.p1Username;
    const myName = mySocketId === match.p1Id ? match.p1Username : match.p2Username;

    const myWins = bracket.activeRoundScores?.[mySocketId] ?? 0;
    const oppWins = bracket.activeRoundScores?.[opponentId] ?? 0;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!isCorrect) onSubmitGuess(guess);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') setGuess(v => Math.max(1, v - 1));
        if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') setGuess(v => Math.min(maxNumber, v + 1));
    };

    const resultColor = (r) => r === 'correct' ? '#4ade80' : r === 'higher' ? '#f472b6' : '#60a5fa';

    return (
        <motion.div
            key="tournament-match"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="tournament-match-container"
        >
            {/* Match header */}
            <div className="tournament-match-header">
                <span className="live-badge">🔴 LIVE</span>
                <h2>
                    {amPlayer
                        ? <><span className="match-me">{myName}</span> vs <span className="match-opp">{opponentName}</span></>
                        : <><span>{match.p1Username}</span> vs <span>{match.p2Username}</span></>
                    }
                </h2>
                {bracket.bestOf > 1 && (
                    <div className="match-score-display">
                        {amPlayer
                            ? <><span className="score-me">{myWins}</span> — <span className="score-opp">{oppWins}</span></>
                            : <><span>{bracket.activeRoundScores?.[match.p1Id] ?? 0}</span> — <span>{bracket.activeRoundScores?.[match.p2Id] ?? 0}</span></>
                        }
                        <span className="match-round-info"> (Round {bracket.activeRoundNum} of {bracket.bestOf})</span>
                    </div>
                )}
            </div>

            {amPlayer ? (
                /* Active player view */
                <div className="tournament-guess-panel">
                    <p className="tournament-guess-hint">
                        Guess a number between <strong>1</strong> and <strong>{maxNumber}</strong>
                    </p>

                    {feedback && (
                        <motion.div
                            key={feedback}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className={`tournament-feedback ${isCorrect ? 'feedback-correct' : ''}`}
                        >
                            {feedback}
                        </motion.div>
                    )}

                    {!isCorrect && (
                        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
                            <div className="guess-input-row">
                                <button type="button" className="nudge-btn" onClick={() => setGuess(v => Math.max(1, v - 1))}>−</button>
                                <input
                                    type="number"
                                    min={1}
                                    max={maxNumber}
                                    value={guess}
                                    onChange={(e) => setGuess(Math.min(maxNumber, Math.max(1, parseInt(e.target.value) || 1)))}
                                    className="colored-input"
                                    style={{ textAlign: 'center', width: '120px' }}
                                />
                                <button type="button" className="nudge-btn" onClick={() => setGuess(v => Math.min(maxNumber, v + 1))}>+</button>
                            </div>
                            <input
                                type="range"
                                min={1}
                                max={maxNumber}
                                value={guess}
                                onChange={(e) => setGuess(parseInt(e.target.value))}
                                style={{ width: '100%', marginTop: '0.75rem' }}
                            />
                            <button type="submit" style={{ marginTop: '1rem', width: '100%' }}>
                                Submit Guess
                            </button>
                        </form>
                    )}

                    {isCorrect && (
                        <div className="tournament-waiting-advance">
                            ✅ You got it! Waiting for host to advance...
                        </div>
                    )}
                </div>
            ) : (
                /* Spectator view */
                <div className="tournament-spectator-panel">
                    <p className="spectator-label">👀 Spectating</p>
                </div>
            )}

            {/* Live guess log (visible to all) */}
            <div className="tournament-log">
                <h4>Live Guesses</h4>
                {bracket.spectatorLog.length === 0 && (
                    <p className="log-empty">No guesses yet...</p>
                )}
                <ul>
                    {bracket.spectatorLog.map((entry, i) => (
                        <li key={i} className="tournament-log-entry" style={{ color: resultColor(entry.result) }}>
                            <span className="log-guesser">{entry.guesserUsername}</span>
                            {' guessed '}
                            <strong>{entry.guess}</strong>
                            {' → '}
                            <span className="log-result">
                                {entry.result === 'correct' ? '✅ Correct!' : entry.result === 'higher' ? '⤴ Higher' : '⤵ Lower'}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </motion.div>
    );
}

export default TournamentMatch;
