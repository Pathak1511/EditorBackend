const express = require("express");
const { Server } = require("socket.io");
const PORT = process.env.PORT || 5002;
const app = express();
const path = require("path");
const http = require("http");
const ACTIONS = require("./Actions");
const axios = require("axios");

// const execute = require("./script.mjs");

const server = http.createServer(app);

const io = new Server(server);

function getAllConnectedClients(id) {
  // Map
  return Array.from(io.sockets.adapter.rooms.get(id) || []).map((socketId) => {
    return {
      socketId,
      username: userSocketMap[socketId],
    };
  });
}

app.use(express.static("public"));
app.use((req, res, next) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (req, res) => {
  res.status(200).send("Healthy");
});

const userSocketMap = {};

io.on("connection", (socket) => {
  socket.on(ACTIONS.JOIN, async ({ id, username }) => {
    userSocketMap[socket.id] = username;
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
  socket.on(ACTIONS.CODE_CHANGE, ({ id, currentTabId, code }) => {
    socket.in(id).emit(ACTIONS.CODE_CHANGE, { currentTabId, code });
  });

  socket.on(ACTIONS.CHAT, (msg) => {
    const clients = getAllConnectedClients(msg.room_id);
    clients.forEach(({ socketId, username }) => {
      io.to(socketId).emit(ACTIONS.CHAT, msg, username);
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
      io.to(id).emit(ACTIONS.CHAT, {
        id: id,
        inputText: `${userSocketMap[socket.id]} left the chat`,
        userName: userSocketMap[socket.id],
        isJoined: true,
      });
    });

    axios
      .post("http://localhost:5500/v1/room/leave_room", {
        session_id: socket.id,
      })
      .then((response) => {
        console.log("Server Response Successfull");
      })
      .catch((error) => {
        console.error("Error occured");
      });

    delete userSocketMap[socket.id];
    socket.leave();
  });
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
