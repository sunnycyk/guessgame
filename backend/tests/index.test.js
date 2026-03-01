const { createServer } = require("http");
const { io: Client } = require("socket.io-client");
const { server, io, rooms } = require("../index.js");

describe("GuessGame Backend Socket Server", () => {
    let clientSocket1, clientSocket2;
    let port;

    beforeAll((done) => {
        server.listen(() => {
            port = server.address().port;
            done();
        });
    });

    afterAll(() => {
        io.close();
        server.close();
    });

    afterEach((done) => {
        if (clientSocket1?.connected) clientSocket1.disconnect();
        if (clientSocket2?.connected) clientSocket2.disconnect();
        rooms.clear();
        setTimeout(done, 50); // slight delay to ensure disconnect events propagate
    });

    test("should create a room and join correctly", (done) => {
        clientSocket1 = new Client(`http://localhost:${port}`);
        let roomId;

        clientSocket1.on("roomCreated", (data) => {
            expect(data).toHaveProperty("roomId");
            expect(data.players[0].username).toBe("HostUser");
            roomId = data.roomId;
            done();
        });

        clientSocket1.on("connect", () => {
            clientSocket1.emit("createRoom", { username: "HostUser" });
        });
    });

    test("should handle joining an existing room", (done) => {
        clientSocket1 = new Client(`http://localhost:${port}`);
        let currentRoomId;

        clientSocket1.on("roomCreated", (data) => {
            currentRoomId = data.roomId;
            // Connect second client after room is created
            clientSocket2 = new Client(`http://localhost:${port}`);

            clientSocket2.on("connect", () => {
                clientSocket2.emit("joinRoom", { roomId: currentRoomId, username: "GuestUser" });
            });

            clientSocket2.on("joinedRoom", (data) => {
                expect(data.roomId).toBe(currentRoomId);
            });

            clientSocket2.on("playerList", (players) => {
                if (players.length === 2) {
                    expect(players[1].username).toBe("GuestUser");
                    expect(players[1].isHost).toBe(false);
                    done();
                }
            });
        });

        clientSocket1.on("connect", () => {
            clientSocket1.emit("createRoom", { username: "HostUser" });
        });
    });
});
