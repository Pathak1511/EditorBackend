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

app.use(express.static("public"));
app.use((req, res, next) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (req, res) => {
  res.status(200).send("Healthy");
});

const userSocketMap = {};
let users = new Array();

const getAllConnectedClients = async (id) => {
  // Map

  const data = await axios
    .get("http://localhost:5500/v1/room/getAllMember", {
      id: id,
    })
    .then((response) => {
      return response.data.data;
    })
    .catch((error) => {
      return null;
    });

  console.log(data);
  // return Array.from(io.sockets.adapter.rooms.get(id) || []).map((socketId) => {
  //   return {
  //     socketId,
  //     username: userSocketMap[socketId],
  //   };
  // });
};

// console.log(users);
// [
//   { id: '2tv3jUyd7MYa3kucAAAB', userName: 'Hritik' },
//   { id: 'Tzv9merOkSDRwuTgAAAD', userName: 'Harijan' }
// ]

io.on("connection", (socket) => {
  let clients = [];
  socket.on(ACTIONS.JOIN, async ({ id, username }) => {
    // Uploading data in mongodb
    const data = await axios
      .post("http://localhost:5500/v1/room/create_room", {
        name: username,
        room_id: id,
        session_id: socket.id,
      })
      .then((response) => {
        return response.data.content.data;
      })
      .catch((error) => {
        return [];
      });

    userSocketMap[socket.id] = username;
    users.push({ id: socket.id, userName: username });
    socket.join(id);

    const clients = data;
    // getAllConnectedClients(id);
    clients.forEach(({ session_id }) => {
      io.to(session_id).emit(ACTIONS.JOINED, {
        clients,
        username,
        socketId: socket.id,
      });

      io.to(session_id).emit(ACTIONS.CHAT, {
        id: session_id,
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
    users = users.filter((user) => user.id !== socket.id);

    socket.leave();
  });
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
