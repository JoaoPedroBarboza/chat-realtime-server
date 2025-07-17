const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs-extra");
require('dotenv').config();

// Importar classes da nossa arquitetura
const DatabaseConnection = require('./database/connection');
const UserRepository = require('./repositories/UserRepository');
const RoomRepository = require('./repositories/RoomRepository');
const MessageRepository = require('./repositories/MessageRepository');
const AuthService = require('./services/AuthService');
const {
  authenticateToken,
  authenticateSocket,
  rateLimiter,
  requestLogger,
  corsMiddleware
} = require('./middleware/auth');

const app = express();

// Middlewares básicos
app.use(requestLogger);
app.use(corsMiddleware);
app.use(express.json());

// Conectar ao banco de dados
let db, userRepository, roomRepository, messageRepository, authService;

async function initializeDatabase() {
  try {
    db = await DatabaseConnection.connect();
    const dbType = DatabaseConnection.getType();

    // Inicializar repositories
    userRepository = new UserRepository(db, dbType);
    roomRepository = new RoomRepository(db, dbType);
    messageRepository = new MessageRepository(db, dbType);

    // Inicializar serviços
    authService = new AuthService(userRepository);

    console.log('✅ Sistema de banco de dados inicializado');
  } catch (error) {
    console.error('❌ Erro ao conectar banco de dados:', error);
    process.exit(1);
  }
}

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, process.env.UPLOAD_PATH || 'uploads');
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
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB padrão
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true
  },
});

// Middleware para servir arquivos estáticos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== ROTAS DE AUTENTICAÇÃO =====
app.post('/api/auth/register', rateLimiter(5, 15 * 60 * 1000), async (req, res) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json({
      success: true,
      message: 'Usuário registrado com sucesso',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/auth/login', rateLimiter(10, 15 * 60 * 1000), async (req, res) => {
  try {
    const result = await authService.login(req.body);
    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      data: result
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/auth/logout', authenticateToken(authService), async (req, res) => {
  try {
    await authService.logout(req.user.id);
    res.json({
      success: true,
      message: 'Logout realizado com sucesso'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { token } = req.body;
    const result = await authService.refreshToken(token);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/auth/me', authenticateToken(authService), async (req, res) => {
  try {
    res.json({
      success: true,
      data: { user: req.user }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===== ROTAS DA API =====
app.get('/api/users', authenticateToken(authService), async (req, res) => {
  try {
    const users = await userRepository.findAll(req.user.id);
    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/rooms', authenticateToken(authService), async (req, res) => {
  try {
    const rooms = await roomRepository.findUserRooms(req.user.id);
    res.json({
      success: true,
      data: rooms
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route para upload de arquivos
app.post('/api/upload', authenticateToken(authService), upload.single('file'), (req, res) => {
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
app.delete('/api/upload/:filename', authenticateToken(authService), (req, res) => {
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

// ===== SOCKET.IO COM AUTENTICAÇÃO =====

// Middleware de autenticação para Socket.IO
io.use(authenticateSocket(authService));

// Map para rastrear usuários conectados (userId -> socketId)
const connectedUsers = new Map();

// Função para broadcast da lista de usuários
async function broadcastUsersList() {
  try {
    const onlineUsers = await userRepository.findOnlineUsers();
    io.emit("user_list", onlineUsers);
  } catch (error) {
    console.error("Erro ao enviar lista de usuários:", error);
  }
}

io.on("connection", async (socket) => {
  const user = socket.user;
  console.log(`✅ Usuário conectado: ${user.username} (ID: ${user.id})`);

  // Atualizar status online
  await userRepository.updateOnlineStatus(user.id, true);
  connectedUsers.set(user.id, socket.id);

  // Enviar lista de usuários online para todos
  await broadcastUsersList();

  // Buscar e enviar histórico de mensagens do usuário
  const userRooms = await roomRepository.findUserRooms(user.id);
  for (const room of userRooms) {
    const messages = await messageRepository.findByRoom(room.id, 50);
    socket.emit("room_history", { roomId: room.id, messages });
  }

  // ===== EVENTOS DE MENSAGENS =====

  // Enviar mensagem privada
  socket.on("send_private", async ({ to, message, fileData }) => {
    try {
      // Buscar usuário destinatário
      const targetUser = await userRepository.findByUsername(to);
      if (!targetUser) {
        socket.emit("error", { message: "Usuário não encontrado" });
        return;
      }

      // Criar ou encontrar sala privada
      const room = await roomRepository.createOrFindPrivateRoom(user.id, targetUser.id);

      // Salvar mensagem no banco
      const messageData = {
        room_id: room.id,
        user_id: user.id,
        content: message,
        message_type: fileData ? 'file' : 'text',
        file_data: fileData || null
      };

      const savedMessage = await messageRepository.create(messageData);

      const payload = {
        id: savedMessage.id,
        from: user.username,
        to: to,
        message,
        fileData,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: 'private'
      };

      // Enviar para o destinatário se estiver online
      const targetSocketId = connectedUsers.get(targetUser.id);
      if (targetSocketId) {
        io.to(targetSocketId).emit("receive_private", payload);
      }

      // Confirmar envio para o remetente
      socket.emit("message_sent", payload);

    } catch (error) {
      console.error("Erro ao enviar mensagem privada:", error);
      socket.emit("error", { message: "Erro ao enviar mensagem" });
    }
  });

  // Enviar mensagem em grupo
  socket.on("send_group", async ({ roomId, message, fileData }) => {
    try {
      // Verificar se usuário é membro da sala
      if (!await roomRepository.isMember(roomId, user.id)) {
        socket.emit("error", { message: "Você não é membro deste grupo" });
        return;
      }

      // Salvar mensagem no banco
      const messageData = {
        room_id: roomId,
        user_id: user.id,
        content: message,
        message_type: fileData ? 'file' : 'text',
        file_data: fileData || null
      };

      const savedMessage = await messageRepository.create(messageData);

      const payload = {
        id: savedMessage.id,
        from: user.username,
        roomId,
        message,
        fileData,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: 'group'
      };

      // Buscar membros do grupo e enviar mensagem
      const members = await roomRepository.getRoomMembers(roomId);
      members.forEach(member => {
        const memberSocketId = connectedUsers.get(member.id);
        if (memberSocketId) {
          io.to(memberSocketId).emit("receive_group", payload);
        }
      });

    } catch (error) {
      console.error("Erro ao enviar mensagem em grupo:", error);
      socket.emit("error", { message: "Erro ao enviar mensagem" });
    }
  });

  // Criar grupo
  socket.on("create_group", async ({ groupName, members }) => {
    try {
      // Criar sala
      const room = await roomRepository.create({
        name: groupName,
        type: 'group',
        created_by: user.id
      });

      // Adicionar criador
      await roomRepository.addMember(room.id, user.id);

      // Adicionar membros
      for (const memberUsername of members) {
        const member = await userRepository.findByUsername(memberUsername);
        if (member) {
          await roomRepository.addMember(room.id, member.id);

          // Notificar membro se estiver online
          const memberSocketId = connectedUsers.get(member.id);
          if (memberSocketId) {
            io.to(memberSocketId).emit("group_created", {
              roomId: room.id,
              groupName,
              members: [user.username, ...members],
              createdBy: user.username
            });
          }
        }
      }

      // Notificar criador
      socket.emit("group_created", {
        roomId: room.id,
        groupName,
        members: [user.username, ...members],
        createdBy: user.username
      });

    } catch (error) {
      console.error("Erro ao criar grupo:", error);
      socket.emit("error", { message: "Erro ao criar grupo" });
    }
  });

  // Entrar em uma sala
  socket.on("join_room", async (roomId) => {
    try {
      // Verificar se usuário é membro
      if (await roomRepository.isMember(roomId, user.id)) {
        socket.join(roomId);

        // Enviar histórico da sala
        const messages = await messageRepository.findByRoom(roomId, 50);
        socket.emit("room_history", messages);
      } else {
        socket.emit("error", { message: "Acesso negado a esta sala" });
      }
    } catch (error) {
      console.error("Erro ao entrar na sala:", error);
      socket.emit("error", { message: "Erro ao entrar na sala" });
    }
  });

  // Sair de uma sala
  socket.on("leave_room", (roomId) => {
    socket.leave(roomId);
  });

  // Indicador de "digitando"
  socket.on("typing", async ({ to, roomId }) => {
    try {
      if (to) {
        // Mensagem privada
        const targetUser = await userRepository.findByUsername(to);
        if (targetUser) {
          const targetSocketId = connectedUsers.get(targetUser.id);
          if (targetSocketId) {
            io.to(targetSocketId).emit("typing", { from: user.username, type: 'private' });
          }
        }
      } else if (roomId) {
        // Mensagem em grupo
        if (await roomRepository.isMember(roomId, user.id)) {
          socket.to(roomId).emit("typing", { from: user.username, type: 'group', roomId });
        }
      }
    } catch (error) {
      console.error("Erro no indicador de digitação:", error);
    }
  });

  socket.on("stop_typing", async ({ to, roomId }) => {
    try {
      if (to) {
        const targetUser = await userRepository.findByUsername(to);
        if (targetUser) {
          const targetSocketId = connectedUsers.get(targetUser.id);
          if (targetSocketId) {
            io.to(targetSocketId).emit("stop_typing", { from: user.username, type: 'private' });
          }
        }
      } else if (roomId) {
        if (await roomRepository.isMember(roomId, user.id)) {
          socket.to(roomId).emit("stop_typing", { from: user.username, type: 'group', roomId });
        }
      }
    } catch (error) {
      console.error("Erro ao parar indicador de digitação:", error);
    }
  });

  // Atualizar status do usuário
  socket.on("update_status", async ({ status }) => {
    try {
      await userRepository.updateStatus(user.id, status);
      await broadcastUsersList();
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
    }
  });

  // Buscar mensagens
  socket.on("search_messages", async ({ query }) => {
    try {
      const results = await messageRepository.searchMessages(query, user.id);
      socket.emit("search_results", results);
    } catch (error) {
      console.error("Erro na busca:", error);
      socket.emit("error", { message: "Erro na busca" });
    }
  });

  // Desconexão
  socket.on("disconnect", async () => {
    try {
      console.log(`❌ Usuário desconectado: ${user.username} (ID: ${user.id})`);

      // Atualizar status offline
      await userRepository.updateOnlineStatus(user.id, false);
      connectedUsers.delete(user.id);

      // Enviar lista atualizada
      await broadcastUsersList();
    } catch (error) {
      console.error("Erro na desconexão:", error);
    }
  });
});

// Inicializar banco e depois iniciar servidor
async function startServer() {
  await initializeDatabase();

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📊 Banco de dados: ${DatabaseConnection.getType().toUpperCase()}`);
    console.log(`🔐 Autenticação: JWT ativada`);
    console.log(`📁 Upload de arquivos: Ativo`);
  });
}

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada não tratada:', reason);
  process.exit(1);
});

// Fechar conexão do banco ao encerrar
process.on('SIGINT', () => {
  console.log('\n🔄 Encerrando servidor...');
  DatabaseConnection.close();
  process.exit(0);
});

// Iniciar servidor
startServer().catch(error => {
  console.error('❌ Erro ao iniciar servidor:', error);
  process.exit(1);
});
