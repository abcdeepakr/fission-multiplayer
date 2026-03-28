const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// Constants
const ROWS = 9;
const COLS = 6;
const COLORS = ['#ff00ff', '#00ffff', '#00ff00', '#ffff00', '#ff0000', '#0000ff'];

const rooms = {};

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function createEmptyBoard(rows, cols) {
    const board = [];
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
            row.push({ owner: null, mass: 0 });
        }
        board.push(row);
    }
    return board;
}

function getCriticalMass(r, c, rows, cols) {
    return 4;
}

function checkWinCondition(room) {
    // Not a full round yet
    if (room.turn < room.players.length) return false;

    let alivePlayers = new Set();
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (room.board[r][c].owner) alivePlayers.add(room.board[r][c].owner);
        }
    }

    // If only 1 player has atoms left
    if (alivePlayers.size === 1) {
        room.status = 'finished';
        const winnerId = Array.from(alivePlayers)[0];
        const winner = room.players.find(p => p.id === winnerId);
        room.winner = winner ? winner.name : 'Unknown';
        return true;
    }
    return false;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', (data) => {
        let code = generateRoomCode();
        while (rooms[code]) code = generateRoomCode();

        rooms[code] = {
            id: code,
            host: socket.id,
            players: [{ id: socket.id, name: data.name, color: COLORS[0] }],
            status: 'waiting',
            board: createEmptyBoard(ROWS, COLS),
            turn: 0,
            turnIndex: 0
        };

        socket.join(code);
        socket.emit('room_created', code);
        io.to(code).emit('room_update', rooms[code]);
    });

    socket.on('join_room', (data) => {
        const room = rooms[data.code];
        if (room && room.status === 'waiting' && room.players.length < 6) {
            room.players.push({ id: socket.id, name: data.name, color: COLORS[room.players.length] });
            socket.join(data.code);
            socket.emit('room_joined', data.code);
            io.to(data.code).emit('room_update', room);
        } else {
            socket.emit('error', 'Room not found, full, or already started.');
        }
    });

    socket.on('start_game', (code) => {
        const room = rooms[code];
        if (room && room.host === socket.id && room.players.length >= 2) {
            room.status = 'playing';
            io.to(code).emit('game_started', room);
        }
    });

    // Fission Game Logic
    socket.on('cell_tapped', (data) => { // { code, r, c }
        const room = rooms[data.code];
        if (!room || room.status !== 'playing') return;

        const currentPlayer = room.players[room.turnIndex];
        if (currentPlayer.id !== socket.id) return; // Not their turn

        const cell = room.board[data.r][data.c];
        // Valid if empty or belongs to current player
        if (cell.owner === null || cell.owner === socket.id) {

            // Recursive mass explosion handled sequentially via a queue
            let queue = [{ r: data.r, c: data.c, owner: socket.id }];

            // Anti-infinite-loop safety, though theoretically bounded
            let actions = 0;

            while (queue.length > 0 && actions < 10000) {
                actions++;
                let { r, c, owner } = queue.shift();
                let currCell = room.board[r][c];
                currCell.owner = owner;
                currCell.mass += 1;

                let crit = getCriticalMass(r, c, ROWS, COLS);
                if (currCell.mass >= crit) {
                    currCell.mass -= crit;
                    if (currCell.mass === 0) currCell.owner = null;

                    // spread
                    if (r > 0) queue.push({ r: r - 1, c: c, owner: owner });
                    if (r < ROWS - 1) queue.push({ r: r + 1, c: c, owner: owner });
                    if (c > 0) queue.push({ r: r, c: c - 1, owner: owner });
                    if (c < COLS - 1) queue.push({ r: r, c: c + 1, owner: owner });
                }
            }

            room.turn++;

            if (checkWinCondition(room)) {
                io.to(data.code).emit('board_update', room);
                io.to(data.code).emit('game_over', { winner: room.winner });
            } else {
                // update turn to next alive player
                let nextIndex = (room.turnIndex + 1) % room.players.length;

                if (room.turn >= room.players.length) {
                    const pCount = room.players.length;
                    let attempts = 0;
                    while (attempts < pCount) {
                        const pId = room.players[nextIndex].id;
                        let hasMass = false;
                        for (let i = 0; i < ROWS; i++) {
                            for (let j = 0; j < COLS; j++) {
                                if (room.board[i][j].owner === pId) hasMass = true;
                            }
                        }
                        if (hasMass) break;
                        nextIndex = (nextIndex + 1) % pCount;
                        attempts++;
                    }
                }
                room.turnIndex = nextIndex;
                io.to(data.code).emit('board_update', room);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`listening on *:${PORT}`);
});
