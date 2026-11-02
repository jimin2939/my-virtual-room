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
const GUESTBOOK_FILE = path.join(__dirname, 'guestbookHistory.json');

function loadFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`파일 로드 에러 (${filePath}):`, err);
  }
  return [];
}

function saveFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`파일 저장 에러 (${filePath}):`, err);
  }
}

let chatHistory = loadFile(HISTORY_FILE);
let guestbookHistory = loadFile(GUESTBOOK_FILE);

// 특정 방 주인(roomOwner)에 속한 플레이어만 추출
function getRoomPlayers(roomOwner) {
  const roomPlayers = {};
  for (let id in players) {
    if (players[id].roomOwner === roomOwner) {
      roomPlayers[id] = players[id];
    }
  }
  return roomPlayers;
}

// 현재 접속 중인 미니룸 주인 목록 갱신
function broadcastActiveOwners() {
  const activeOwners = [...new Set(Object.values(players).map(p => p.name))];
  io.emit('updateActiveRooms', activeOwners);
}

io.on('connection', (socket) => {
  console.log('유저 접속:', socket.id);

  players[socket.id] = {
    x: 400,
    y: 250,
    name: '익명',
    character: './치이카와.png',
    msg: '',
    roomOwner: '익명',
    statusMsg: '',
    bgmUrl: ''
  };

  socket.on('join', (data) => {
    const owner = data.roomOwner || data.name || '익명';
    socket.join(`room_${owner}`);

    if (players[socket.id]) {
      players[socket.id].name = data.name || '익명';
      players[socket.id].character = data.character || './치이카와.png';
      players[socket.id].roomOwner = owner;
      players[socket.id].statusMsg = data.statusMsg || '';
      players[socket.id].bgmUrl = data.bgmUrl || '';

      const roomHistory = chatHistory.filter(item => item.roomOwner === owner);
      const roomGb = guestbookHistory.filter(item => item.roomOwner === owner);
      
      socket.emit('loadHistory', roomHistory);
      socket.emit('loadGuestbook', roomGb);

      io.to(`room_${owner}`).emit('updatePlayers', getRoomPlayers(owner));
      broadcastActiveOwners();
    }
  });

  socket.on('changeRoom', (data) => {
    if (players[socket.id]) {
      const oldOwner = players[socket.id].roomOwner;
      const newOwner = data.roomOwner;

      socket.leave(`room_${oldOwner}`);
      socket.join(`room_${newOwner}`);

      players[socket.id].roomOwner = newOwner;
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].msg = '';

      io.to(`room_${oldOwner}`).emit('updatePlayers', getRoomPlayers(oldOwner));

      const roomHistory = chatHistory.filter(item => item.roomOwner === newOwner);
      const roomGb = guestbookHistory.filter(item => item.roomOwner === newOwner);
      
      socket.emit('loadHistory', roomHistory);
      socket.emit('loadGuestbook', roomGb);
      io.to(`room_${newOwner}`).emit('updatePlayers', getRoomPlayers(newOwner));
    }
  });

  socket.on('move', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      const owner = players[socket.id].roomOwner;
      io.to(`room_${owner}`).emit('updatePlayers', getRoomPlayers(owner));
    }
  });

  socket.on('chatMessage', (data) => {
    if (players[socket.id]) {
      const owner = players[socket.id].roomOwner;
      players[socket.id].msg = data.msg;

      if (playerTimers[socket.id]) {
        clearTimeout(playerTimers[socket.id]);
      }

      playerTimers[socket.id] = setTimeout(() => {
        if (players[socket.id]) {
          players[socket.id].msg = '';
          io.to(`room_${owner}`).emit('updatePlayers', getRoomPlayers(owner));
        }
      }, 5000);

      const chatData = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name: players[socket.id].name,
        msg: data.msg,
        roomOwner: owner,
        timestamp: Date.now()
      };

      chatHistory.push(chatData);
      saveFile(HISTORY_FILE, chatHistory);

      io.to(`room_${owner}`).emit('newMessage', chatData);
      io.to(`room_${owner}`).emit('updatePlayers', getRoomPlayers(owner));
    }
  });

  socket.on('guestbookMessage', (data) => {
    if (players[socket.id]) {
      const owner = players[socket.id].roomOwner;
      const gbData = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name: players[socket.id].name,
        msg: data.msg,
        roomOwner: owner,
        timestamp: Date.now()
      };

      guestbookHistory.push(gbData);
      saveFile(GUESTBOOK_FILE, guestbookHistory);

      io.to(`room_${owner}`).emit('newGuestbook', gbData);
    }
  });

  socket.on('deleteChatMessage', (data) => {
    chatHistory = chatHistory.filter(item => item.id !== data.msgId);
    saveFile(HISTORY_FILE, chatHistory);
    io.to(`room_${data.roomOwner}`).emit('deleteMessage', data.msgId);
  });

  socket.on('disconnect', () => {
    if (playerTimers[socket.id]) {
      clearTimeout(playerTimers[socket.id]);
      delete playerTimers[socket.id];
    }
    const owner = players[socket.id] ? players[socket.id].roomOwner : null;
    delete players[socket.id];
    if (owner) {
      io.to(`room_${owner}`).emit('updatePlayers', getRoomPlayers(owner));
    }
    broadcastActiveOwners();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버 실행 중 (포트: ${PORT})`);
});