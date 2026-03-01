# Guess the Number: Multiplayer

A real-time multiplayer "Guess the Number" game featuring a vibrant, cartoonish UI, custom game rooms, and live cross-player synchronization.

## Features
- **Host & Join Rooms**: Create a unique 6-character Room ID to invite friends.
- **Custom Game Settings**: The host can configure the "Max Number" range and the "Players Needed" to start.
- **Real-time Gameplay**: Powered by Socket.IO for instant guess feedback across all clients.
- **Animated UI**: Smooth view transitions (Framer Motion) and celebratory confetti effects.
- **Keyboard Shortcuts**: Use Arrow keys (`←`/`→`) or `A`/`D` to fine-tune guesses, and `Enter` to seamlessly submit.

## Tech Stack
- **Frontend**: React, Vite, Framer Motion, Canvas Confetti
- **Backend**: Node.js, Express, Socket.IO
- **Deployment**: Docker Compose

## How to Run Locally

### Using Docker Compose (Recommended)
You can build and run both the frontend and backend simultaneously using Docker.

1. Ensure Docker is installed and running on your machine.
2. Form the root directory of the project, run:
   ```bash
   docker compose up --build -d
   ```
3. Open your browser and navigate to [http://localhost:5173](http://localhost:5173).
4. To stop the game servers, run:
   ```bash
   docker compose down
   ```

### Running Manually (Development Mode)
If you prefer to run the servers independently for local development:

**1. Start the Backend Server:**
```bash
cd backend
npm install
npm run dev
```
*The backend will be available on `http://localhost:3001`.*

**2. Start the Frontend Server:**
Open a new terminal window, then run:
```bash
cd frontend
npm install
npm run dev
```
*The frontend will run on `http://localhost:5173`.*
