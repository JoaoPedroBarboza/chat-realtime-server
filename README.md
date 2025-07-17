# 🚀 Chat em Tempo Real

Um sistema de chat em tempo real desenvolvido com React, Node.js e Socket.IO, oferecendo uma experiência de comunicação moderna e intuitiva.

## ✨ Funcionalidades Principais

### 💬 Comunicação
- **Mensagens privadas** em tempo real
- **Grupos de conversa** com múltiplos membros
- **Indicador de digitação** visual
- **Histórico de mensagens** persistente
- **Busca de mensagens** no chat

### 🎨 Interface
- **Tema escuro/claro** alternável
- **Emojis integrados** com seletor
- **Notificações push** para novas mensagens
- **Design responsivo** para mobile
- **Avatars personalizados** para usuários

### 👥 Usuários
- **Status online/offline** em tempo real
- **Último visto** com timestamp
- **Status personalizado** (Disponível, Ocupado, Ausente, Não Perturbe)
- **Lista de usuários** atualizada dinamicamente

### 🔧 Funcionalidades Avançadas
- **Salas de chat** (grupos)
- **Persistência de mensagens** no servidor
- **API REST** para consultas
- **Suporte a arquivos** (preparado para implementação)
- **Scroll automático** para novas mensagens

## 🛠️ Tecnologias Utilizadas

### Frontend
- **React 19** + **Hooks**
- **Socket.IO Client** para comunicação real-time
- **CSS3** com variáveis customizadas
- **Vite** como bundler

### Backend
- **Node.js** + **Express**
- **Socket.IO** para WebSocket
- **CORS** habilitado
- **Estrutura de dados** em memória

## 🚀 Como Executar

### 1. Servidor (Backend)
```bash
cd chat-realtime-server
npm install
npm run dev  # Para desenvolvimento
# ou
npm start   # Para produção
```

### 2. Cliente (Frontend)
```bash
cd chat-realtime-client
npm install
npm run dev
```

## 📋 Estrutura do Projeto

```
chat-realtime/
├── chat-realtime-server/
│   ├── index.js           # Servidor principal
│   ├── package.json       # Dependências do servidor
│   └── uploads/           # Arquivos enviados (futuro)
│
└── chat-realtime-client/
    ├── src/
    │   ├── App.jsx        # Componente principal
    │   ├── App.css        # Estilos principais
    │   └── main.jsx       # Ponto de entrada
    ├── package.json       # Dependências do cliente
    └── vite.config.js     # Configuração do Vite
```

## 🌟 Principais Melhorias Implementadas

### Backend
- ✅ Estrutura de dados melhorada com Map
- ✅ API REST para consultas externas
- ✅ Histórico de mensagens persistente
- ✅ Suporte a grupos de chat
- ✅ Gestão de status de usuários
- ✅ Logs detalhados de eventos

### Frontend
- ✅ Temas claro/escuro
- ✅ Seletor de emojis integrado
- ✅ Notificações em tempo real
- ✅ Busca de mensagens
- ✅ Indicador de digitação animado
- ✅ Responsividade completa

## 🔜 Próximas Implementações

- 📁 **Upload de arquivos** (imagens, documentos)
- 🔐 **Autenticação de usuários**
- 💾 **Banco de dados** (MongoDB/PostgreSQL)
- 🔔 **Notificações push** nativas
- 📱 **App mobile** (React Native)
- 🌐 **Deploy em produção**

## 📱 Responsividade

O sistema é totalmente responsivo e funciona em:
- 💻 **Desktop** (1200px+)
- 📱 **Tablets** (768px-1199px)
- 📱 **Mobile** (320px-767px)

## 🎯 Como Contribuir

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

## 🤝 Suporte

Se você tiver dúvidas ou sugestões, sinta-se à vontade para:
- Abrir uma **issue** no GitHub
- Enviar um **pull request**
- Entrar em contato pelo **email**

---

**Desenvolvido com ❤️ por João Lima**
