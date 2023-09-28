const express = require("express");
const { Server } = require("socket.io");
const PORT = 80;
const app = express();
const path = require("path");
const http = require("http");
const ACTIONS = require("./Actions");
// const execute = require("./script.mjs");

const server = http.createServer(app);

const io = new Server(server);

app.use(express.static("build"));
app.use((req, res, next) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

const userSocketMap = {};
let users = new Array();

function getAllConnectedClients(id) {
  // Map
  return Array.from(io.sockets.adapter.rooms.get(id) || []).map((socketId) => {
    return {
      socketId,
      username: userSocketMap[socketId],
    };
  });
}

io.on("connection", (socket) => {
  socket.on(ACTIONS.JOIN, ({ id, username }) => {
    userSocketMap[socket.id] = username;
    users.push({ id: socket.id, userName: username });
    socket.join(id);

    const clients = getAllConnectedClients(id);
    clients.forEach(({ socketId }) => {
      io.to(socketId).emit(ACTIONS.JOINED, {
        clients,
        username,
        socketId: socket.id,
      });

      io.to(socketId).emit(ACTIONS.CHAT, {
        id: socketId,
        inputText: `${username} joined the chat`,
        userName: username,
        isJoined: true,
      });
    });
  });

  // Code change event
  socket.on(ACTIONS.CODE_CHANGE, ({ id, code }) => {
    socket.in(id).emit(ACTIONS.CODE_CHANGE, { code });
  });

  socket.on(ACTIONS.CHAT, (msg) => {
    users.map((user) => {
      io.to(user.id).emit(ACTIONS.CHAT, msg, user.userName);
    });
  });

  socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
    io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  // Broadcating while user is disconnecting
  socket.on("disconnecting", () => {
    const rooms = [...socket.rooms];
    rooms.forEach((id) => {
      socket.in(id).emit(ACTIONS.DISCONNECTED, {
        socketId: socket.id,
        username: userSocketMap[socket.id],
      });
    });

    delete userSocketMap[socket.id];
    users = users.filter((user) => user.id !== socket.id);

    socket.leave();
  });
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
