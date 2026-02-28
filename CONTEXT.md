# Project Context: Vibecodeing With Andy

This file provides high-level context for AI agents working on this project.

## 🌟 Project Purpose
A multiplayer "Guess the Number" game where players compete synchronously to find a random winning number. The game emphasizes speed and real-time interaction.

## 🏗️ Architecture
- **Frontend**: React + Vite (Vanilla CSS)
- **Backend**: ExpressJS
- **Infrastructure**: WebSocket (Socket.io) for real-time synchronization
- **Deployment**: Docker (`compose.yaml`)

## 🔑 Key Concepts & Game Mechanics
- **Game Session**: A single round of the game where all players participate.
- **Winning Number**: A random integer between 1 and `maxNumber` (default 1000).
- **Synchronous Play**: The game starts for everyone at the same time.
- **Timer**: Each player's completion time (from start to correct guess) is recorded.
- **Configurability**:
    - `maxNumber`: The upper limit for the range (1 to `maxNumber`).
    - `numPlayers`: The required number of players before a game starts (or manual start).
- **Leaderboard**: Displays the top 3 fastest players calculated by the backend.

## 🛠️ Tech Stack & Dependencies
- **Frontend**: React (Hooks, Context API), Vite, `socket.io-client`
- **Backend**: Node.js, Express, `socket.io`
- **Styling**: Vanilla CSS (Modern design, glassmorphism, transitions)
- **Deployment**: `Dockerfile` (multi-stage), `compose.yaml`

## 📡 WebSocket Event Flow (High-Level)
- **C -> S**: `joinGame` (Player name/ID)
- **S -> C**: `gameStateUpdate` (Waiting, Starting, Playing, Finished)
- **S -> C**: `gameStart` (Includes `maxNumber`, syncs timer)
- **C -> S**: `submitGuess` (Number guessed)
- **S -> C**: `guessResult` (Higher, Lower, Correct)
- **C -> S**: `playerFinished` (Correct guess time)
- **S -> C**: `leaderboardUpdate` (Final standings)

## 🗺️ Development Roadmap
1. [ ] **Phase 1: Foundation**: Setup project structure, Docker, and basic WebSocket connection.
2. [ ] **Phase 2: Configuration & Lobby**: Implement screen for configuring game settings and waiting for players.
3. [ ] **Phase 3: Core Gameplay**: Guessing logic, feedback (higher/lower), and individual timers.
4. [ ] **Phase 4: Real-time Sync**: Backend orchestration of game start/stop and player results.
5. [ ] **Phase 5: Results & UI/UX**: Leaderboard display, animations, and "wow" factor design.

## 📋 Common Procedures
- `npm install` (in both subdirectories)
- `npm run dev` (Frontend)
- `npm start` (Backend)
- `docker-compose up --build`

---
> [!TIP]
> Keep this file updated as the project evolves! It's the primary source of truth for AI context.
