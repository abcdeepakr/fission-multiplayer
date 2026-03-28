const socket = io();

// UI Elements
const screens = {
    start: document.getElementById('start-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen')
};

const inputs = {
    name: document.getElementById('player-name'),
    roomCode: document.getElementById('room-code-input')
};

const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const btnStart = document.getElementById('btn-start');
const btnHome = document.getElementById('btn-home');
const displayRoomCode = document.getElementById('display-room-code');
const displayRoomCodePlain = document.getElementById('display-room-code-plain');
const roomCodeContainer = document.getElementById('room-code-container');
const playersUl = document.getElementById('players-ul');

const boardContainer = document.getElementById('board-container');
const currentTurnName = document.getElementById('current-turn-name');
const gameOverMsg = document.getElementById('game-over-msg');

let currentRoomCode = '';
let myId = '';

// Pre-fill room code if joined via invite link
const urlParams = new URLSearchParams(window.location.search);
const joinParam = urlParams.get('room');
let autoJoin = false;
if (joinParam && joinParam.length === 4) {
    inputs.roomCode.value = joinParam.toUpperCase();
    autoJoin = true;
}

socket.on('connect', () => {
    myId = socket.id;
    if (autoJoin) {
        btnJoin.click();
        autoJoin = false;
    }
});

function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');
}

btnCreate.addEventListener('click', () => {
    const name = inputs.name.value.trim() || 'Guest';
    socket.emit('create_room', { name });
});

btnJoin.addEventListener('click', () => {
    const code = inputs.roomCode.value.trim().toUpperCase();
    const name = inputs.name.value.trim() || 'Guest';
    if (code.length === 4) {
        socket.emit('join_room', { code, name });
    } else {
        alert("Please enter a valid 4-letter room code.");
    }
});

btnStart.addEventListener('click', () => {
    socket.emit('start_game', currentRoomCode);
});

btnHome.addEventListener('click', () => {
    window.location.reload();
});

displayRoomCode.addEventListener('click', () => {
    if (!currentRoomCode) return;

    // Create the full share link
    const inviteLink = `https://fission-multiplayer.onrender.com/?room=${currentRoomCode}`;

    navigator.clipboard.writeText(`JOIN room to play fission: ${inviteLink}`).then(() => {
        const toast = document.getElementById('copy-toast');
        if (toast) {
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 2000);
        }
    });
});

socket.on('room_created', (code) => {
    currentRoomCode = code;
    showScreen('lobby');
    displayRoomCode.innerText = code;
    displayRoomCodePlain.innerText = code;
});

socket.on('room_joined', (code) => {
    currentRoomCode = code;
    showScreen('lobby');
    displayRoomCode.innerText = code;
    displayRoomCodePlain.innerText = code;
});

socket.on('room_update', (room) => {
    playersUl.innerHTML = '';
    room.players.forEach(p => {
        const li = document.createElement('li');
        li.innerText = p.name + (p.id === myId ? ' (You)' : '');
        li.style.borderLeftColor = p.color;
        playersUl.appendChild(li);
    });

    if (room.host === myId) {
        if (room.players.length > 1) {
            btnStart.style.display = 'block';
        } else {
            btnStart.style.display = 'none';
        }
        roomCodeContainer.style.display = 'block';
    } else {
        btnStart.style.display = 'none';
        roomCodeContainer.style.display = 'none';
    }
});

socket.on('game_started', (room) => {
    showScreen('game');
    renderBoard(room);
});

socket.on('board_update', (room) => {
    renderBoard(room);
});

socket.on('game_over', (data) => {
    currentTurnName.innerText = `${data.winner} WINS!`;
    currentTurnName.style.color = 'var(--neon-green)';
    gameOverMsg.style.display = 'block';
    btnHome.style.display = 'inline-block';

    if (typeof confetti === 'function') {
        var duration = 3000;
        var animationEnd = Date.now() + duration;
        var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };
        function randomInRange(min, max) { return Math.random() * (max - min) + min; }
        var interval = setInterval(function () {
            var timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) return clearInterval(interval);
            var particleCount = 50 * (timeLeft / duration);
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
        }, 250);
    }
});

socket.on('error', (msg) => {
    alert(msg);
});

function renderBoard(room) {
    const currentPlayer = room.players[room.turnIndex];
    currentTurnName.innerText = currentPlayer.name + (currentPlayer.id === myId ? " (Your Turn)" : "");
    currentTurnName.style.color = currentPlayer.color;

    boardContainer.innerHTML = '';
    const rows = room.board.length;
    const cols = room.board[0].length;

    boardContainer.style.setProperty('--cols', cols);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cellData = room.board[r][c];
            const cellDiv = document.createElement('div');
            cellDiv.classList.add('cell');

            if (cellData.mass > 0) {
                const atomContainer = document.createElement('div');
                atomContainer.classList.add('atom-container');

                let playerObj = room.players.find(p => p.id === cellData.owner);
                let color = playerObj ? playerObj.color : '#fff';

                // Add particles
                for (let i = 0; i < cellData.mass; i++) {
                    const particle = document.createElement('div');
                    particle.classList.add('particle', `p${i + 1}`);
                    particle.style.backgroundColor = color;
                    particle.style.boxShadow = `0 0 10px ${color}`;
                    atomContainer.appendChild(particle);
                }

                if (cellData.mass >= 3) atomContainer.classList.add('spin-fast');
                else if (cellData.mass === 2) atomContainer.classList.add('spin-med');
                else atomContainer.classList.add('spin-slow');

                cellDiv.appendChild(atomContainer);
            }

            cellDiv.addEventListener('click', () => {
                socket.emit('cell_tapped', { code: currentRoomCode, r, c });
            });

            boardContainer.appendChild(cellDiv);
        }
    }
}
