import React from 'react';
import { motion } from 'framer-motion';

function getRoundLabel(roundNum, totalRounds) {
    if (roundNum === totalRounds) return 'Final';
    if (roundNum === totalRounds - 1) return 'Semi-Final';
    if (roundNum === totalRounds - 2) return 'Quarter-Final';
    return `Round ${roundNum}`;
}

function MatchCard({ match, mySocketId, isActiveMatch }) {
    const p1Won = match.winnerId === match.p1Id;
    const p2Won = match.winnerId === match.p2Id;

    const p1Name = match.p1Username ?? (match.status === 'pending' ? 'TBD' : 'BYE');
    const p2Name = match.p2Username ?? (match.status === 'pending' ? 'TBD' : 'BYE');

    const isMyMatch = mySocketId === match.p1Id || mySocketId === match.p2Id;

    return (
        <div className={`bracket-match
            ${match.status === 'active' ? 'bracket-match-active' : ''}
            ${match.status === 'completed' ? 'bracket-match-done' : ''}
            ${isMyMatch && match.status !== 'completed' ? 'bracket-match-mine' : ''}
        `}>
            {match.status === 'active' && (
                <span className="bracket-live-badge">🔴 LIVE</span>
            )}
            <div className={`bracket-player ${p1Won ? 'bracket-player-winner' : ''} ${match.status === 'active' && mySocketId === match.p1Id ? 'bracket-player-me' : ''}`}>
                <span className="bracket-player-name">{p1Name}</span>
                {match.scores?.[match.p1Id] > 0 && (
                    <span className="bracket-score">{match.scores[match.p1Id]}</span>
                )}
                {p1Won && <span className="bracket-crown">👑</span>}
            </div>
            <div className="bracket-vs">vs</div>
            <div className={`bracket-player ${p2Won ? 'bracket-player-winner' : ''} ${match.status === 'active' && mySocketId === match.p2Id ? 'bracket-player-me' : ''}`}>
                <span className="bracket-player-name">{p2Name}</span>
                {match.scores?.[match.p2Id] > 0 && (
                    <span className="bracket-score">{match.scores[match.p2Id]}</span>
                )}
                {p2Won && <span className="bracket-crown">👑</span>}
            </div>
        </div>
    );
}

function TournamentBracket({ bracket, isHost, onStartMatch, onReset, mySocketId, players, gameState }) {
    if (!bracket) return null;

    const { rounds, champion, bestOf } = bracket;
    const totalRounds = rounds.length;
    const minHeight = Math.max(rounds[0].length * 110, 220);

    const hasNextMatch = rounds.some(round =>
        round.some(m => m.status === 'pending' && m.p1Id && m.p2Id)
    );

    const activeMatch = bracket.activeRoundIdx !== null
        ? rounds[bracket.activeRoundIdx]?.[bracket.activeMatchIdx]
        : null;

    return (
        <motion.div
            key="tournament-bracket"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="tournament-container"
        >
            <h2 className="tournament-title">🏆 Tournament Bracket</h2>

            {bestOf > 1 && (
                <p className="tournament-subtitle">Best of {bestOf} · First to {Math.ceil(bestOf / 2)} wins advances</p>
            )}

            {/* Champion banner */}
            {champion && (
                <motion.div
                    className="tournament-champion-banner"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                >
                    🏆 Champion: <strong>{champion.username}</strong>
                    {champion.id === mySocketId && <span className="champion-you"> — That's you! 🎉</span>}
                </motion.div>
            )}

            {/* Active match notice */}
            {activeMatch && gameState === 'TOURNAMENT_PLAYING' && (
                <div className="tournament-active-notice">
                    🔴 <strong>{activeMatch.p1Username}</strong> vs <strong>{activeMatch.p2Username}</strong> playing now...
                    {(mySocketId === activeMatch.p1Id || mySocketId === activeMatch.p2Id)
                        ? ' — Go guess!'
                        : ' — You are spectating'}
                </div>
            )}

            {/* Bracket grid */}
            <div className="bracket-grid" style={{ minHeight }}>
                {rounds.map((round, rIdx) => {
                    // Filter out "both-BYE" completed matches with no winner for display
                    const visibleMatches = round.filter(m => m.p1Id || m.p2Id || m.status === 'pending');
                    return (
                        <div key={rIdx} className="bracket-round-col">
                            <div className="bracket-round-label">
                                {getRoundLabel(rIdx + 1, totalRounds)}
                            </div>
                            <div className="bracket-round-matches" style={{ minHeight }}>
                                {visibleMatches.map(match => (
                                    <MatchCard
                                        key={match.id}
                                        match={match}
                                        mySocketId={mySocketId}
                                        isActiveMatch={match.status === 'active'}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Controls */}
            {isHost && gameState === 'TOURNAMENT_BRACKET' && !champion && hasNextMatch && (
                <button
                    className="tournament-start-match-btn"
                    onClick={onStartMatch}
                >
                    ▶ Start Next Match
                </button>
            )}

            {isHost && (gameState === 'TOURNAMENT_FINISHED' || !hasNextMatch) && (
                <button
                    style={{ marginTop: '1.5rem', width: '100%' }}
                    onClick={onReset}
                >
                    Back to Lobby
                </button>
            )}

            {/* Player list sidebar */}
            <div className="tournament-players-list">
                <h4>Players</h4>
                <ul>
                    {players.map(p => (
                        <li key={p.id} className={p.id === mySocketId ? 'tournament-player-me' : ''}>
                            {p.username}
                            {p.isBot && <span className="bot-tier-badge" data-tier={p.botTier}> 🤖 {p.botTier}</span>}
                            {champion?.id === p.id && ' 🏆'}
                        </li>
                    ))}
                </ul>
            </div>
        </motion.div>
    );
}

export default TournamentBracket;
