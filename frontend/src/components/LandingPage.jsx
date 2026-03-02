import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AdBanner from './AdBanner';

function LandingPage({ username, setUsername, handleCreateRoom, joinRoomId, setJoinRoomId, handleJoinRoom }) {
    const [mode, setMode] = useState(joinRoomId ? 'join' : 'initial'); // 'initial' | 'host' | 'join'

    return (
        <motion.div
            key="landing"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="landing-page"
        >
            <div className="form-card">
                <AnimatePresence mode="wait">
                    {mode === 'initial' && (
                        <motion.div
                            key="initial"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="landing-actions"
                        >
                            <button onClick={() => setMode('host')} className="host-btn">Host Game 🏠</button>
                            <button onClick={() => setMode('join')} className="join-btn">Join Game 🚀</button>
                        </motion.div>
                    )}

                    {mode === 'host' && (
                        <motion.div
                            key="host"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="landing-actions"
                        >
                            <input
                                type="text"
                                placeholder="Your Name"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                            <button onClick={handleCreateRoom} className="host-btn">Start Hosting 🏠</button>
                            <button onClick={() => setMode('initial')} className="ready-button">Back</button>
                        </motion.div>
                    )}

                    {mode === 'join' && (
                        <motion.div
                            key="join"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="landing-actions"
                        >
                            <input
                                type="text"
                                placeholder="Your Name"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                            <input
                                type="text"
                                placeholder="Game ID"
                                value={joinRoomId}
                                onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                                required
                            />
                            <button onClick={handleJoinRoom} className="join-btn">Join Room 🚀</button>
                            <button onClick={() => setMode('initial')} className="ready-button">Back</button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <AdBanner style={{ marginTop: '2rem' }} />
        </motion.div>
    );
}

export default LandingPage;
