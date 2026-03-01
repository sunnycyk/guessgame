import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

function Gameplay({ elapsed, guess, maxNumber, setGuess, handleSubmitGuess, feedback, isCorrect, setShowEarlyLeaderboard }) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (isCorrect) return;
            if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
                e.preventDefault();
                setGuess(prev => Math.max(1, parseInt(prev || 0) - 1));
            } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
                e.preventDefault();
                setGuess(prev => Math.min(maxNumber, parseInt(prev || 0) + 1));
            } else if (e.key === 'Enter') {
                // Ignore if the event is already targeting the submit button or form input 
                // to avoid double submission.
                if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
                    e.preventDefault();
                    if (handleSubmitGuess) handleSubmitGuess(e);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [maxNumber, setGuess]);

    return (
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

            <div className="keyboard-hints">
                <p>💡 <strong>Shortcuts:</strong> <code>A</code>/<code>D</code> or <code>←</code>/<code>→</code> to move, <code>Enter</code> to submit</p>
            </div>

            <div className="guess-input-group">
                <button
                    type="button"
                    className="fine-tune-btn"
                    onClick={() => setGuess(prev => Math.max(1, parseInt(prev) - 1))}
                    disabled={guess <= 1 || isCorrect}
                >
                    -1
                </button>
                <input
                    type="number"
                    min="1"
                    max={maxNumber}
                    value={guess}
                    onChange={(e) => {
                        let val = parseInt(e.target.value);
                        if (isNaN(val)) val = '';
                        setGuess(val);
                    }}
                    onBlur={() => {
                        let val = parseInt(guess);
                        if (isNaN(val) || val < 1) setGuess(1);
                        else if (val > maxNumber) setGuess(maxNumber);
                    }}
                    onKeyDown={(e) => {
                        if (isCorrect) return;
                        if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
                            e.preventDefault();
                            setGuess(prev => Math.max(1, parseInt(prev || 0) - 1));
                        } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
                            e.preventDefault();
                            setGuess(prev => Math.min(maxNumber, parseInt(prev || 0) + 1));
                        }
                    }}
                    className="colored-input guess-number-box"
                    disabled={isCorrect}
                />
                <button
                    type="button"
                    className="fine-tune-btn"
                    onClick={() => setGuess(prev => Math.min(maxNumber, parseInt(prev) + 1))}
                    disabled={guess >= maxNumber || isCorrect}
                >
                    +1
                </button>
            </div>
            <p className="range-hint">Between 1 and {maxNumber}</p>
            <form onSubmit={handleSubmitGuess}>
                <div className="slider-container">
                    <input
                        type="range"
                        min="1"
                        max={maxNumber}
                        value={guess}
                        onChange={(e) => setGuess(e.target.value)}
                        onKeyDown={(e) => {
                            if (isCorrect) return;
                            if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
                                e.preventDefault();
                                setGuess(prev => Math.max(1, parseInt(prev || 0) - 1));
                            } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
                                e.preventDefault();
                                setGuess(prev => Math.min(maxNumber, parseInt(prev || 0) + 1));
                            }
                        }}
                        className="cartoon-slider"
                        disabled={isCorrect}
                    />
                </div>
                <button type="submit" disabled={isCorrect} style={{ marginTop: '2rem', width: '100%' }}>
                    {isCorrect ? 'Correct!' : 'Check Guess'}
                </button>
            </form>

            {isCorrect && (
                <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => setShowEarlyLeaderboard(true)}
                    style={{ marginTop: '1rem', width: '100%', backgroundColor: '#10b981' }}
                >
                    Go to Leaderboard 🏆
                </motion.button>
            )}

            <motion.p
                className="feedback"
                key={feedback}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
            >
                {feedback}
            </motion.p>
        </motion.div>
    );
}

export default Gameplay;
