const path = require('path');
require('dotenv').config();

class DatabaseConnection {
   constructor() {
      this.db = null;
      this.type = process.env.DB_TYPE || 'sqlite';
   }

   async connect() {
      switch (this.type) {
         case 'sqlite':
            return this.connectSQLite();
         case 'postgres':
            return this.connectPostgreSQL();
         case 'mysql':
            return this.connectMySQL();
         default:
            throw new Error(`Banco ${this.type} não suportado`);
      }
   }

   connectSQLite() {
      const Database = require('better-sqlite3');
      const dbPath = path.join(__dirname, '..', process.env.DB_FILE || 'chat.db');

      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL'); // Melhor performance
      this.db.pragma('foreign_keys = ON');  // Ativar foreign keys

      console.log('✅ Conectado ao SQLite:', dbPath);
      this.createTables();
      return this.db;
   }

   connectPostgreSQL() {
      const { Pool } = require('pg');
      this.db = new Pool({
         host: process.env.DB_HOST,
         port: process.env.DB_PORT,
         database: process.env.DB_NAME,
         user: process.env.DB_USER,
         password: process.env.DB_PASSWORD,
      });
      console.log('✅ Conectado ao PostgreSQL');
      return this.db;
   }

   connectMySQL() {
      const mysql = require('mysql2/promise');
      this.db = mysql.createPool({
         host: process.env.DB_HOST,
         port: process.env.DB_PORT,
         database: process.env.DB_NAME,
         user: process.env.DB_USER,
         password: process.env.DB_PASSWORD,
      });
      console.log('✅ Conectado ao MySQL');
      return this.db;
   }

   createTables() {
      if (this.type === 'sqlite') {
         // Tabela de usuários
         this.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          avatar VARCHAR(255),
          status VARCHAR(20) DEFAULT 'available',
          is_online BOOLEAN DEFAULT FALSE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

         // Tabela de salas/grupos
         this.db.exec(`
        CREATE TABLE IF NOT EXISTS rooms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name VARCHAR(100),
          type VARCHAR(20) NOT NULL DEFAULT 'private',
          created_by INTEGER REFERENCES users(id),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

         // Tabela de membros das salas
         this.db.exec(`
        CREATE TABLE IF NOT EXISTS room_members (
          room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (room_id, user_id)
        )
      `);

         // Tabela de mensagens
         this.db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id),
          content TEXT,
          message_type VARCHAR(20) DEFAULT 'text',
          file_data JSON,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

         // Tabela de sessões para JWT
         this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          token_hash VARCHAR(255),
          expires_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

         // Índices para performance
         this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
        CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);
      `);

         console.log('✅ Tabelas SQLite criadas/verificadas');
      }
   }

   getConnection() {
      return this.db;
   }

   getType() {
      return this.type;
   }

   close() {
      if (this.db && this.type === 'sqlite') {
         this.db.close();
      } else if (this.db) {
         this.db.end();
      }
   }
}

module.exports = new DatabaseConnection();
