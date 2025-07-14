const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const users = new Map(); // username -> { socketId, online }

io.on("connection", (socket) => {
  let currentUser = null;

  // Registrar nome de usuário
  socket.on("set_username", (username) => {
    currentUser = username;
    users.set(username, { socketId: socket.id, online: true });

    sendUserLists(); // envia a lista filtrada para todos
  });

  // Enviar mensagem privada
  socket.on("send_private", ({ to, message }) => {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const payload = {
      from: currentUser,
      message,
      timestamp,
    };

    // Envia para o destinatário
    const target = users.get(to);
    if (target?.online) {
      io.to(target.socketId).emit("receive_private", payload);
    }

    // Confirma para o remetente
    socket.emit("message_sent", { ...payload, to });
  });

  // Indicador de "digitando"
  socket.on("typing", ({ to }) => {
    const target = users.get(to);
    if (target?.online) {
      io.to(target.socketId).emit("typing", { from: currentUser });
    }
  });

  socket.on("stop_typing", ({ to }) => {
    const target = users.get(to);
    if (target?.online) {
      io.to(target.socketId).emit("stop_typing", { from: currentUser });
    }
  });

  // Criar grupo
  socket.on("create_group", ({ groupName, members }) => {
    members.forEach((member) => {
      const user = users.get(member);
      if (user?.online) {
        io.to(user.socketId).emit("group_created", { groupName, members });
      }
    });
  });

  // Desconexão
  socket.on("disconnect", () => {
    if (currentUser && users.has(currentUser)) {
      const user = users.get(currentUser);
      user.online = false;
      users.set(currentUser, user);

      sendUserLists();
    }
  });

  // Envia listas de usuários atualizadas (excluindo a si mesmo)
  function sendUserLists() {
    for (const [username, data] of users.entries()) {
      const userSocketId = data.socketId;
      const filteredUsers = Array.from(users.entries())
        .filter(([name]) => name !== username)
        .map(([name, info]) => ({
          username: name,
          online: info.online,
        }));

      io.to(userSocketId).emit("user_list", filteredUsers);
    }
  }
});

server.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
