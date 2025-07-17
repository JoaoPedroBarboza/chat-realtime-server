const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs-extra");

const app = express();
app.use(cors());
app.use(express.json());

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    fs.ensureDirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

const fileFilter = (req, file, cb) => {
  // Aceitar apenas imagens, documentos e alguns outros tipos
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não permitido'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB máximo
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const users = new Map(); // username -> { socketId, online, avatar, lastSeen }
const rooms = new Map(); // roomId -> { name, members, messages, type: 'private' | 'group' }
const messageHistory = new Map(); // userId -> [messages]

// Middleware para servir arquivos estáticos (avatars, etc.)
app.use('/uploads', express.static('uploads'));

// API Routes
app.get('/api/users', (req, res) => {
  const userList = Array.from(users.entries()).map(([username, data]) => ({
    username,
    online: data.online,
    lastSeen: data.lastSeen,
    avatar: data.avatar
  }));
  res.json(userList);
});

app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.entries()).map(([id, room]) => ({
    id,
    name: room.name,
    type: room.type,
    memberCount: room.members.length
  }));
  res.json(roomList);
});

// Route para upload de arquivos
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
    }

    const fileInfo = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: `/uploads/${req.file.filename}`,
      uploadDate: new Date().toISOString()
    };

    res.json({
      success: true,
      file: fileInfo
    });
  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Route para deletar arquivos
app.delete('/api/upload/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: 'Arquivo deletado com sucesso' });
    } else {
      res.status(404).json({ error: 'Arquivo não encontrado' });
    }
  } catch (error) {
    console.error('Erro ao deletar arquivo:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

io.on("connection", (socket) => {
  let currentUser = null;
  let currentRoom = null;

  // Registrar nome de usuário
  socket.on("set_username", ({ username, avatar }) => {
    currentUser = username;
    users.set(username, {
      socketId: socket.id,
      online: true,
      avatar: avatar || null,
      lastSeen: new Date().toISOString()
    });

    // Enviar histórico de mensagens para o usuário
    const userMessages = messageHistory.get(username) || [];
    socket.emit("message_history", userMessages);

    sendUserLists();
  });

  // Enviar mensagem privada
  socket.on("send_private", ({ to, message, fileData }) => {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const payload = {
      id: Date.now() + Math.random(),
      from: currentUser,
      to: to,
      message,
      fileData,
      timestamp,
      type: 'private'
    };

    // Salvar no histórico
    saveMessage(currentUser, payload);
    saveMessage(to, payload);

    // Envia para o destinatário
    const target = users.get(to);
    if (target?.online) {
      io.to(target.socketId).emit("receive_private", payload);
    }

    // Confirma para o remetente
    socket.emit("message_sent", payload);
  });

  // Enviar mensagem em grupo
  socket.on("send_group", ({ roomId, message, fileData }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.includes(currentUser)) {
      return;
    }

    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const payload = {
      id: Date.now() + Math.random(),
      from: currentUser,
      roomId,
      message,
      fileData,
      timestamp,
      type: 'group'
    };

    // Salvar mensagem no grupo
    room.messages.push(payload);

    // Enviar para todos os membros do grupo
    room.members.forEach(member => {
      const user = users.get(member);
      if (user?.online) {
        io.to(user.socketId).emit("receive_group", payload);
      }
    });
  });

  // Entrar em uma sala
  socket.on("join_room", (roomId) => {
    currentRoom = roomId;
    socket.join(roomId);

    const room = rooms.get(roomId);
    if (room) {
      socket.emit("room_history", room.messages);
    }
  });

  // Sair de uma sala
  socket.on("leave_room", (roomId) => {
    socket.leave(roomId);
    currentRoom = null;
  });

  // Indicador de "digitando"
  socket.on("typing", ({ to, roomId }) => {
    if (to) {
      // Mensagem privada
      const target = users.get(to);
      if (target?.online) {
        io.to(target.socketId).emit("typing", { from: currentUser, type: 'private' });
      }
    } else if (roomId) {
      // Mensagem em grupo
      socket.to(roomId).emit("typing", { from: currentUser, type: 'group', roomId });
    }
  });

  socket.on("stop_typing", ({ to, roomId }) => {
    if (to) {
      const target = users.get(to);
      if (target?.online) {
        io.to(target.socketId).emit("stop_typing", { from: currentUser, type: 'private' });
      }
    } else if (roomId) {
      socket.to(roomId).emit("stop_typing", { from: currentUser, type: 'group', roomId });
    }
  });

  // Criar grupo
  socket.on("create_group", ({ groupName, members }) => {
    const roomId = `group_${Date.now()}`;
    const allMembers = [...members, currentUser];

    rooms.set(roomId, {
      name: groupName,
      members: allMembers,
      messages: [],
      type: 'group',
      createdBy: currentUser,
      createdAt: new Date().toISOString()
    });

    allMembers.forEach((member) => {
      const user = users.get(member);
      if (user?.online) {
        io.to(user.socketId).emit("group_created", {
          roomId,
          groupName,
          members: allMembers,
          createdBy: currentUser
        });
      }
    });
  });

  // Atualizar status do usuário
  socket.on("update_status", ({ status }) => {
    if (currentUser && users.has(currentUser)) {
      const user = users.get(currentUser);
      user.status = status;
      users.set(currentUser, user);
      sendUserLists();
    }
  });

  // Buscar mensagens
  socket.on("search_messages", ({ query }) => {
    const userMessages = messageHistory.get(currentUser) || [];
    const filteredMessages = userMessages.filter(msg =>
      msg.message.toLowerCase().includes(query.toLowerCase())
    );
    socket.emit("search_results", filteredMessages);
  });

  // Marcar mensagem como lida
  socket.on("mark_as_read", ({ messageId }) => {
    // Implementar lógica de leitura
    console.log(`Mensagem ${messageId} marcada como lida por ${currentUser}`);
  });

  // Desconexão
  socket.on("disconnect", () => {
    if (currentUser && users.has(currentUser)) {
      const user = users.get(currentUser);
      user.online = false;
      user.lastSeen = new Date().toISOString();
      users.set(currentUser, user);

      sendUserLists();
    }
  });

  // Funções auxiliares
  function saveMessage(userId, message) {
    if (!messageHistory.has(userId)) {
      messageHistory.set(userId, []);
    }
    const messages = messageHistory.get(userId);
    messages.push(message);

    // Manter apenas as últimas 1000 mensagens
    if (messages.length > 1000) {
      messages.shift();
    }

    messageHistory.set(userId, messages);
  }

  // Envia listas de usuários atualizadas (excluindo a si mesmo)
  function sendUserLists() {
    for (const [username, data] of users.entries()) {
      const userSocketId = data.socketId;
      const filteredUsers = Array.from(users.entries())
        .filter(([name]) => name !== username)
        .map(([name, info]) => ({
          username: name,
          online: info.online,
          lastSeen: info.lastSeen,
          avatar: info.avatar,
          status: info.status || 'available'
        }));

      io.to(userSocketId).emit("user_list", filteredUsers);
    }
  }
});

server.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
