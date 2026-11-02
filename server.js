const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

const players = {};
const playerTimers = {};
const HISTORY_FILE = path.join(__dirname, 'chatHistory.json');

function loadChatHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      const history = JSON.parse(data);
      const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
      return history.filter(item => item.timestamp > threeDaysAgo);
    }
  } catch (err) {
    console.error('대화 내역 로드 에러:', err);
  }
  return [];
}

function saveChatHistory(history) {
  try {
    const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
    const filtered = history.filter(item => item.timestamp > threeDaysAgo);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(filtered, null, 2), 'utf8');
    return filtered;
  } catch (err) {
    console.error('대화 내역 저장 에러:', err);
    return history;
  }
}

let chatHistory = loadChatHistory();

io.on('connection', (socket) => {
  console.log('유저 접속:', socket.id);

  players[socket.id] = {
    x: Math.floor(Math.random() * 700) + 100,
    y: Math.floor(Math.random() * 400) + 75,
    name: '익명',
    character: './치이카와.png',
    msg: ''
  };

  socket.emit('loadHistory', chatHistory);

  socket.on('join', (data) => {
    if (players[socket.id]) {
      players[socket.id].name = data.name || '익명';
      players[socket.id].character = data.character || './치이카와.png';
      io.emit('updatePlayers', players);
    }
  });

  socket.on('move', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      if (data.name && data.name !== '익명') players[socket.id].name = data.name;
      if (data.character) players[socket.id].character = data.character;
      io.emit('updatePlayers', players);
    }
  });

  socket.on('chatMessage', (msg) => {
    if (players[socket.id]) {
      players[socket.id].msg = msg;

      if (playerTimers[socket.id]) {
        clearTimeout(playerTimers[socket.id]);
      }

      playerTimers[socket.id] = setTimeout(() => {
        if (players[socket.id]) {
          players[socket.id].msg = '';
          io.emit('updatePlayers', players);
        }
      }, 5000);

      const chatData = {
        name: players[socket.id].name,
        msg: msg,
        timestamp: Date.now()
      };

      chatHistory.push(chatData);
      chatHistory = saveChatHistory(chatHistory);

      io.emit('newMessage', chatData);
      io.emit('updatePlayers', players);
    }
  });

  socket.on('disconnect', () => {
    if (playerTimers[socket.id]) {
      clearTimeout(playerTimers[socket.id]);
      delete playerTimers[socket.id];
    }
    delete players[socket.id];
    io.emit('updatePlayers', players);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});