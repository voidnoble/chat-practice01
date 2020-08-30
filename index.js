const app = require('http').createServer(createServerHandler);
const io = require('socket.io').listen(app);
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 9000;

app.listen(port, () => {
  console.log('Server listen at port %d', port);
});

function createServerHandler(req, res) {
  if (req.url === '/') {
    fs.readFile(__dirname + '/index.html', (err, data) => {
      if (err) {
        res.writeHad(500);
        return res.end(`Error loading index.html`);
      }
      res.writeHead(200);
      data = data.toString('utf-8');

      res.end(data);
    });
  } else if (req.url.match('.css$')) {
    var cssPath = path.join(__dirname, 'public', req.url);
    var fileStream = fs.createReadStream(cssPath, 'UTF-8');
    res.writeHead(200, { 'Content-Type': 'text/css' });
    fileStream.pipe(res);
  } else if (req.url.match('.png$')) {
    var imagePath = path.join(__dirname, 'public', req.url);
    var fileStream = fs.createReadStream(imagePath);
    res.writeHead(200, { 'Content-Type': 'image/png' });
    fileStream.pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('No Page Found');
  }
}

let socketRoom = {};
let chatRooms = [];

io.on('connection', (socket) => {
  const socketId = socket.id;

  // 접속 했음을 알림
  socket.emit('connected');

  console.log('connected\nsocket.id:', socket.id, '\nrooms:', io.sockets.adapter.rooms);

  if (socket.currentRoom) {
    socket.join(socket.currentRoom);

    io.to(socket.currentRoom).emit('completeMatch', { roomId: socket.currentRoom, socketId: socketId });
  }

  socket.on('requestRandomChat', (data) => {
    console.log('requestRandomChat, socket.id: %s', socketId);

    // 빈방이 있는지 확인
    let rooms = io.sockets.adapter.rooms;
    console.log('rooms', rooms);
    for (let key in rooms) {
      if (key == '') continue;

      // 혼자 있으면 입장
      if (io.in(key).clients.length == 1) {
        let roomKey = key.replace('/', '');
        socket.join(roomKey);
        socket.currentRoom = roomKey;
        socketRoom[socketId] = roomKey;

        io.in(roomKey).emit('completeMatch', { roomId: roomKey, socketId: socketId });

        console.log('혼자 있으면 입장 socketRoom', socketRoom);
        return;
      }
    }

    // 빈방이 없으면 혼자 방 만들고 기다림
    socket.join(socketId);
    socketRoom[socketId] = socketId;
    socket.currentRoom = socketId;
    io.in(socketId).emit('completeMatch', { roomId: socketId, socketId: socketId });
    console.log('혼자 방 만들고 대기 socketRoom', socketRoom);
  });

  // 채팅 요청 취소시
  socket.on('cancelRequest', (data) => {
    socket.leave(socketRoom[socket.id]);
  });

  // client -> server Message 전송시
  socket.on('sendMessage', (data) => {
    console.log(`Send message to room id ${socket.currentRoom}.`);
    io.sockets.to(socket.currentRoom).emit('receiveMessage', data);
  });

  // 1:1 채팅
  socket.on('oneToOneChatWith', (data) => {
    const roomId = data.roomId;

    // 해당 룸에 인원
    let clients = io.sockets.adapter.rooms[roomId];
    console.log('room %s clients', roomId, clients);

    // 해당 룸에 인원이 2명 초과면
    if (clients && clients.length > 2) {
      // 정원이 가득 찼다고 하고 join 못하게
      console.log('room %s 의 1:1 대화방 가득 참', roomId);
      socket.emit('oneToOneChatFull', { error: true, message: '대화방 정원이 가득찼습니다.' });
      return;
    }

    // 해당 룸에 인원이 1명이면
    socket.join(roomId);
    socket.currentRoom = roomId;

    io.to(roomId).emit('joinedRoom', { roomId });
  });

  socket.on('joinRoom', (data) => {
    const roomId = `room${data}`;

    socket.join(roomId);
    socket.currentRoom = roomId;

    io.to(roomId).emit('joinedRoom', { roomId });
  });

  // 방 나가기
  socket.on('leaveRoom', (data) => {
    console.log('leaveRoom from %s', data.roomId);

    io.in(data.roomId).emit('disconnect');
    socket.currentRoom = '';
    socket.leave(data.roomId);
  });

  // disconnect
  socket.on('disconnect', (data) => {
    let key = socketRoom[socket.id];
    socket.leave(key);

    io.in(key).emit('disconnect');

    // Get all users from room `key`
    let clients = io.sockets.adapter.rooms[key];
    if (!clients) return;
    for (let i = 0; i < clients.length; i++) {
      if (clients[i]) clients[i].leave(key);
    }
  });
});
