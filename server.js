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
const playerTimers = {}; // 각 유저의 말풍선 타이머 관리
const HISTORY_FILE = path.join(__dirname, 'chatHistory.json');

// 파일에서 대화 내역 불러오기
function loadChatHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      const history = JSON.parse(data);
      
      // 3일(72시간) 이내의 메시지만 필터링
      const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
      return history.filter(item => item.timestamp > threeDaysAgo);
    }
  } catch (err) {
    console.error('대화 내역 로드 에러:', err);
  }
  return [];
}

// 대화 내역 파일에 저장
function saveChatHistory(history) {
  try {
    // 3일 지난 데이터 필터링 후 저장
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

  // 새로운 접속자에게 기존 3일 치 대화 기록 전송
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
      io.emit('updatePlayers', players);
    }
  });

  socket.on('chatMessage', (msg) => {
    if (players[socket.id]) {
      players[socket.id].msg = msg;

      // 1. 기존 타이머가 존재하면 취소하고 5초 타이머 새로 설정
      if (playerTimers[socket.id]) {
        clearTimeout(playerTimers[socket.id]);
      }

      playerTimers[socket.id] = setTimeout(() => {
        if (players[socket.id]) {
          players[socket.id].msg = ''; // 5초 뒤 말풍선 지우기
          io.emit('updatePlayers', players);
        }
      }, 5000); // 5000ms = 5초

      // 2. 대화 기록 저장 (타임스탬프 포함)
      const chatData = {
        name: players[socket.id].name,
        msg: msg,
        timestamp: Date.now()
      };

      chatHistory.push(chatData);
      chatHistory = saveChatHistory(chatHistory);

      // 3. 전체 유저에게 실시간 브로드캐스트
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