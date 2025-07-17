const jwt = require('jsonwebtoken');

// Middleware para verificar token JWT
const authenticateToken = (authService) => {
   return async (req, res, next) => {
      try {
         const authHeader = req.headers['authorization'];
         const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

         if (!token) {
            return res.status(401).json({
               error: 'Token de acesso requerido',
               code: 'NO_TOKEN'
            });
         }

         const user = await authService.validateToken(token);
         req.user = user;
         next();
      } catch (error) {
         return res.status(403).json({
            error: 'Token inválido ou expirado',
            code: 'INVALID_TOKEN'
         });
      }
   };
};

// Middleware para Socket.IO
const authenticateSocket = (authService) => {
   return async (socket, next) => {
      try {
         const token = socket.handshake.auth.token;

         if (!token) {
            return next(new Error('Token de acesso requerido'));
         }

         const user = await authService.validateToken(token);
         socket.user = user;
         next();
      } catch (error) {
         next(new Error('Token inválido ou expirado'));
      }
   };
};

// Middleware opcional (permite acesso sem token)
const optionalAuth = (authService) => {
   return async (req, res, next) => {
      try {
         const authHeader = req.headers['authorization'];
         const token = authHeader && authHeader.split(' ')[1];

         if (token) {
            const user = await authService.validateToken(token);
            req.user = user;
         }

         next();
      } catch (error) {
         // Token inválido, mas continua sem autenticação
         req.user = null;
         next();
      }
   };
};

// Middleware para verificar se é o próprio usuário ou admin
const requireOwnership = (req, res, next) => {
   const targetUserId = parseInt(req.params.userId || req.params.id);
   const currentUserId = req.user.id;

   if (currentUserId !== targetUserId) {
      return res.status(403).json({
         error: 'Acesso negado',
         code: 'FORBIDDEN'
      });
   }

   next();
};

// Middleware para rate limiting básico
const rateLimiter = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
   const requests = new Map();

   return (req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Limpar registros antigos
      for (const [key, timestamps] of requests.entries()) {
         const validTimestamps = timestamps.filter(time => time > windowStart);
         if (validTimestamps.length === 0) {
            requests.delete(key);
         } else {
            requests.set(key, validTimestamps);
         }
      }

      // Verificar limite atual
      const userRequests = requests.get(ip) || [];
      const recentRequests = userRequests.filter(time => time > windowStart);

      if (recentRequests.length >= maxRequests) {
         return res.status(429).json({
            error: 'Muitas tentativas. Tente novamente mais tarde.',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: Math.ceil(windowMs / 1000)
         });
      }

      // Adicionar request atual
      recentRequests.push(now);
      requests.set(ip, recentRequests);

      next();
   };
};

// Middleware para logging
const requestLogger = (req, res, next) => {
   const start = Date.now();
   const { method, url, ip } = req;
   const userAgent = req.get('user-agent') || '';

   // Log da request
   console.log(`[${new Date().toISOString()}] ${method} ${url} - ${ip} - ${userAgent}`);

   // Interceptar response para log completo
   const originalSend = res.send;
   res.send = function (data) {
      const duration = Date.now() - start;
      const { statusCode } = res;

      console.log(`[${new Date().toISOString()}] ${method} ${url} - ${statusCode} - ${duration}ms`);

      return originalSend.call(this, data);
   };

   next();
};

// Middleware para CORS customizado
const corsMiddleware = (req, res, next) => {
   const origin = req.headers.origin;
   const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
   ];

   if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
   }

   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
   res.setHeader('Access-Control-Allow-Credentials', 'true');

   if (req.method === 'OPTIONS') {
      res.sendStatus(200);
   } else {
      next();
   }
};

module.exports = {
   authenticateToken,
   authenticateSocket,
   optionalAuth,
   requireOwnership,
   rateLimiter,
   requestLogger,
   corsMiddleware
};
