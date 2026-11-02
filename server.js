const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

const players = {};

io.on('connection', (socket) => {
  console.log('유저 접속:', socket.id);

  // 최초 임시 접속 정보
  players[socket.id] = {
    x: Math.floor(Math.random() * 500) + 50,
    y: Math.floor(Math.random() * 400) + 50,
    name: '익명',
    character: './치이카와.png',
    msg: ''
  };

  // 입장 시 닉네임과 캐릭터 확실히 업데이트
  socket.on('join', (data) => {
    if (players[socket.id]) {
      players[socket.id].name = data.name || '익명';
      players[socket.id].character = data.character || './치이카와.png';
      io.emit('updatePlayers', players);
    }
  });

  // 캐릭터 이동
  socket.on('move', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      io.emit('updatePlayers', players);
    }
  });

  // 채팅 메시지
  socket.on('chatMessage', (msg) => {
    if (players[socket.id]) {
      players[socket.id].msg = msg;
      io.emit('updatePlayers', players);
    }
  });

  // 퇴장 처리
  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('updatePlayers', players);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});