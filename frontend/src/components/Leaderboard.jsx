import React from 'react';
import { motion } from 'framer-motion';

function Leaderboard({ results, isHost, handleReset }) {
    return (
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
    );
}

export default Leaderboard;
