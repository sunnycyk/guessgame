import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

function EliminationLeaderboard({ results, isHost, handleReset }) {
    useEffect(() => {
        confetti({
            particleCount: 200,
            spread: 90,
            origin: { y: 0.5 },
            colors: ['#ec4899', '#d946ef', '#fbbf24', '#f472b6']
        });
    }, []);

    const survivor = results.find(r => r.isSurvivor);

    return (
        <motion.div
            key="elimination-leaderboard"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="leaderboard elimination-leaderboard"
        >
            <h2>Last One Standing! 🏆</h2>

            {survivor && (
                <motion.div
                    className="survivor-banner"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', bounce: 0.5, delay: 0.2 }}
                >
                    {survivor.username} survives!
                </motion.div>
            )}

            <h3 style={{ marginTop: '1.5rem', marginBottom: '0.75rem', color: '#db2777', fontSize: '0.95rem' }}>
                Elimination Scoreboard
            </h3>
            <ol>
                {results.map((res, i) => (
                    <motion.li
                        key={res.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 + 0.3 }}
                        className={res.isSurvivor ? 'survivor-row' : ''}
                    >
                        <span>{res.username} {res.isSurvivor ? '🏆' : res.isAlive ? '💚' : '💀'}</span>
                        <span>{res.eliminations} elimination{res.eliminations !== 1 ? 's' : ''}</span>
                    </motion.li>
                ))}
            </ol>

            {isHost && (
                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    onClick={handleReset}
                    style={{ width: '100%', marginTop: '1.5rem' }}
                >
                    Play Again 🔄
                </motion.button>
            )}
        </motion.div>
    );
}

export default EliminationLeaderboard;
