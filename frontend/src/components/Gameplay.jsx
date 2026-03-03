import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { canRecognize, canSpeak, startVoiceInput, wordsToNumber, speak, logVoiceStatus } from '../utils/voice';

function Gameplay({ elapsed, guess, maxNumber, setGuess, handleSubmitGuess, feedback, isCorrect, setShowEarlyLeaderboard, voiceEnabled, setVoiceEnabled }) {
    const [listening, setListening] = useState(false);
    const [micError, setMicError] = useState('');
    const recognitionRef = useRef(null);
    const sessionRef = useRef(0);

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
        recognitionRef.current = startVoiceInput({
            onResult: (transcripts) => {
                if (sessionRef.current !== session) return;
                recognitionRef.current = null;
                setListening(false);
                for (const t of transcripts) {
                    const num = wordsToNumber(t);
                    if (num !== null && num >= 1 && num <= maxNumber) {
                        setGuess(num);
                        handleSubmitGuess({ preventDefault: () => {} }, num);
                        break;
                    }
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
            <div className="voice-controls">
                {canRecognize() && (
                    <button
                        type="button"
                        className={`mic-btn ${listening ? 'listening' : ''}`}
                        onClick={handleMicClick}
                        disabled={isCorrect}
                        title={listening ? 'Listening… (tap to cancel)' : 'Speak your guess'}
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
            {!canRecognize() && !canSpeak() && (
                <p className="voice-hint voice-blocked">⚠️ Voice not available — check browser permissions or lower privacy shields</p>
            )}
            {!canRecognize() && canSpeak() && (
                <p className="voice-hint voice-blocked">🎤 Mic blocked — Brave users: lower Shields for this site</p>
            )}
            {micError && (
                <p className="voice-hint voice-blocked" onClick={() => setMicError('')} style={{ cursor: 'pointer' }}>⚠️ {micError}</p>
            )}

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
