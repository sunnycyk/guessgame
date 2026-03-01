import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function EliminationSetup({ players, maxNumber, mySocketId, onSubmitSecretNumber }) {
    const [secretInput, setSecretInput] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [inputError, setInputError] = useState('');

    const me = players.find(p => p.id === mySocketId);
    const hasSubmitted = submitted || me?.isSetupComplete;

    const handleSubmit = (e) => {
        e.preventDefault();
        const num = parseInt(secretInput);
        if (isNaN(num) || num < 1 || num > maxNumber) {
            setInputError(`Enter a number between 1 and ${maxNumber}`);
            return;
        }
        onSubmitSecretNumber(num);
        setSubmitted(true);
        setInputError('');
    };

    const submittedCount = players.filter(p => p.isSetupComplete).length;

    return (
        <motion.div
            key="elimination-setup"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="elimination-setup"
        >
            <h2>Choose Your Secret Number</h2>
            <p className="setup-hint">
                Pick a number between 1 and {maxNumber}. Other players will try to guess it!
            </p>

            <AnimatePresence mode="wait">
                {!hasSubmitted ? (
                    <motion.form
                        key="input-form"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onSubmit={handleSubmit}
                        className="form-card"
                    >
                        <div className="input-group">
                            <label>Your Secret Number</label>
                            <input
                                type="number"
                                min="1"
                                max={maxNumber}
                                value={secretInput}
                                onChange={(e) => setSecretInput(e.target.value)}
                                className="colored-input"
                                autoFocus
                                placeholder={`1 – ${maxNumber}`}
                            />
                            {inputError && <p className="input-error">{inputError}</p>}
                        </div>
                        <button type="submit">Lock It In 🔒</button>
                    </motion.form>
                ) : (
                    <motion.div
                        key="confirmed"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="setup-confirmed"
                    >
                        🔒 Your number is locked in! Waiting for others...
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="player-list" style={{ marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', color: '#db2777' }}>
                    {submittedCount} / {players.length} ready
                </h3>
                <ul>
                    {players.map(p => (
                        <motion.li
                            key={p.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={p.isSetupComplete ? 'ready' : ''}
                        >
                            {p.username} {p.isHost && '👑'}
                            {p.isSetupComplete ? ' — Locked in ✅' : ' — Thinking...'}
                        </motion.li>
                    ))}
                </ul>
            </div>
        </motion.div>
    );
}

export default EliminationSetup;
