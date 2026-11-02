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

function getRoomPlayers(roomName) {
  const roomPlayers = {};
  for (let id in players) {
    if (players[id].room === roomName) {
      roomPlayers[id] = players[id];
    }
  }
  return roomPlayers;
}

io.on('connection', (socket) => {
  console.log('유저 접속:', socket.id);

  players[socket.id] = {
    x: 400,
    y: 210,
    name: '익명',
    character: './치이카와.png',
    msg: '',
    room: '로비',
    statusMsg: '',
    bgmUrl: ''
  };

  socket.on('join', (data) => {
    const room = data.room || '로비';
    socket.join(room);

    if (players[socket.id]) {
      players[socket.id].name = data.name || '익명';
      players[socket.id].character = data.character || './치이카와.png';
      players[socket.id].room = room;
      players[socket.id].statusMsg = data.statusMsg || '';
      players[socket.id].bgmUrl = data.bgmUrl || '';

      // 해당 방의 이전 대화 내역만 필터링하여 전송
      const roomHistory = chatHistory.filter(item => item.room === room);
      socket.emit('loadHistory', roomHistory);

      io.to(room).emit('updatePlayers', getRoomPlayers(room));
    }
  });

  socket.on('move', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      const room = players[socket.id].room;
      io.to(room).emit('updatePlayers', getRoomPlayers(room));
    }
  });

  socket.on('chatMessage', (data) => {
    if (players[socket.id]) {
      const room = players[socket.id].room;
      players[socket.id].msg = data.msg;

      if (playerTimers[socket.id]) {
        clearTimeout(playerTimers[socket.id]);
      }

      playerTimers[socket.id] = setTimeout(() => {
        if (players[socket.id]) {
          players[socket.id].msg = '';
          io.to(room).emit('updatePlayers', getRoomPlayers(room));
        }
      }, 5000);

      const chatData = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 4), // 고유 ID
        name: players[socket.id].name,
        msg: data.msg,
        room: room,
        timestamp: Date.now()
      };

      chatHistory.push(chatData);
      chatHistory = saveChatHistory(chatHistory);

      io.to(room).emit('newMessage', chatData);
      io.to(room).emit('updatePlayers', getRoomPlayers(room));
    }
  });

  // 대화 삭제 처리
  socket.on('deleteChatMessage', (data) => {
    chatHistory = chatHistory.filter(item => item.id !== data.msgId);
    saveChatHistory(chatHistory);
    io.to(data.room).emit('deleteMessage', data.msgId);
  });

  socket.on('disconnect', () => {
    if (playerTimers[socket.id]) {
      clearTimeout(playerTimers[socket.id]);
      delete playerTimers[socket.id];
    }
    const room = players[socket.id] ? players[socket.id].room : null;
    delete players[socket.id];
    if (room) {
      io.to(room).emit('updatePlayers', getRoomPlayers(room));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});