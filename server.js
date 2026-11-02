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

// 대화 내역 불러오기 (3일 이내)
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

// 대화 내역 저장하기
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
    x: Math.floor(Math.random() * 1000) + 100,
    y: Math.floor(Math.random() * 600) + 100,
    name: '익명',
    character: './치이카와.png',
    msg: ''
  };

  socket.emit('loadHistory', chatHistory);

  // 입장 시 정보 등록 및 저장
  socket.on('join', (data) => {
    if (players[socket.id]) {
      players[socket.id].name = data.name || '익명';
      players[socket.id].character = data.character || './치이카와.png';
      io.emit('updatePlayers', players);
    }
  });

  // 이동 시 기존 name과 character 정보 보존
  socket.on('move', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      // data에 name이나 character가 있으면 갱신, 없으면 기존값 유지
      if (data.name) players[socket.id].name = data.name;
      if (data.character) players[socket.id].character = data.character;
      
      io.emit('updatePlayers', players);
    }
  });

  // 채팅 시 5초 후 말풍선 지우기 (닉네임/캐릭터는 절대 지우지 않음)
  socket.on('chatMessage', (msg) => {
    if (players[socket.id]) {
      players[socket.id].msg = msg;

      if (playerTimers[socket.id]) {
        clearTimeout(playerTimers[socket.id]);
      }

      // 5초 뒤 말풍선 메시지만 빈값으로 변경
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
  console.log(`서버 실행 중 (포트: ${PORT})`);
});