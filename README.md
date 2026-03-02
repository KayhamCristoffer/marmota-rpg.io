# 🎮 RPG Quests — Sistema de Quests Gamificado com Login Discord

> Um sistema de quests gamificado estilo RPG com login via Discord OAuth2, painel admin, sistema de ranking por período, XP e níveis.

![RPG Quests](https://img.shields.io/badge/RPG%20Quests-v1.0.0-gold?style=for-the-badge&logo=discord)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-brightgreen?style=for-the-badge&logo=mongodb)

---

## ✨ Funcionalidades

### 🔐 Autenticação
- Login via **Discord OAuth2** (sem senha)
- Sessão persistente
- Criação automática de perfil ao primeiro login

### 🗡️ Sistema de Quests
- Quests **Diárias**, **Semanais**, **Mensais** e **Eventos**
- Limite de usuários por quest
- Nível mínimo para desbloquear quests
- Envio de **comprovante (print/imagem)** para revisão
- Status: Ativa → Em Análise → Concluída / Rejeitada

### 📊 Estatísticas & Perfil
- XP e Sistema de Níveis (`XP necessário = 100 × nível`)
- Moedas totais, diárias, semanais e mensais
- Contador de quests por status
- Nickname personalizável
- **Conquistas/Badges** (Bronze, Prata, Ouro, Diamante)

### 🏆 Ranking
- Filtros: **Total | Diário | Semanal | Mensal**
- Pódio visual para Top 3
- Destaque para posição do usuário atual

### 👑 Painel Admin
- Criar, editar, ativar/desativar e deletar quests
- **Aprovar ou rejeitar** comprovantes enviados
- Gerenciar roles de usuários (User / Admin)
- **Reset manual** de rankings (diário, semanal, mensal)

### ⏰ Reset Automático (CRON)
| Período | Horário |
|---------|---------|
| Diário  | 00:00 todos os dias |
| Semanal | 00:00 todo domingo |
| Mensal  | 00:00 todo dia 1 |

---

## 🛠️ Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML5, CSS3, JavaScript (Vanilla) |
| Backend | Node.js + Express |
| Database | MongoDB + Mongoose |
| Auth | Passport.js + Discord OAuth2 |
| Upload | Multer (local) / Cloudinary (produção) |
| Agendamento | node-cron |
| Fonts | Cinzel (Google Fonts) |
| Icons | Font Awesome 6 |

---

## 📁 Estrutura

```
rpg-quests/
├── index.html          # Login Discord
├── home.html           # Dashboard do usuário
├── admin.html          # Painel Admin
├── css/
│   └── style.css       # Tema RPG completo
├── js/
│   ├── auth.js         # Autenticação + sidebar
│   ├── home.js         # Dashboard + estatísticas
│   ├── quests.js       # Quests + upload de print
│   ├── ranking.js      # Sistema de ranking
│   └── admin.js        # Painel administrativo
├── public/
│   └── uploads/        # Imagens enviadas
└── backend/
    ├── server.js
    ├── config/
    │   └── passport.js
    ├── models/
    │   ├── User.js
    │   ├── Quest.js
    │   ├── UserQuest.js
    │   └── Ranking.js
    ├── routes/
    │   ├── auth.js
    │   ├── quests.js
    │   ├── users.js
    │   ├── ranking.js
    │   └── admin.js
    ├── controllers/
    │   ├── questController.js
    │   ├── userController.js
    │   ├── rankingController.js
    │   └── adminController.js
    └── middleware/
        ├── auth.js
        └── upload.js
```

---

## 🚀 Como Rodar

### 1. Pré-requisitos
- Node.js 18+
- MongoDB (local ou Atlas)
- Aplicação Discord criada em: https://discord.com/developers/applications

### 2. Configurar Discord App
1. Vá em https://discord.com/developers/applications
2. Crie uma nova aplicação
3. Em **OAuth2 → General**, copie o `Client ID` e `Client Secret`
4. Adicione o redirect: `http://localhost:3000/auth/discord/callback`

### 3. Variáveis de Ambiente

```bash
cd backend
cp .env.example .env
# Edite o .env com suas configurações
```

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/rpg-quests
DISCORD_CLIENT_ID=seu_client_id
DISCORD_CLIENT_SECRET=seu_client_secret
DISCORD_CALLBACK_URL=http://localhost:3000/auth/discord/callback
SESSION_SECRET=sua_chave_secreta_forte
```

### 4. Instalar dependências e rodar

```bash
cd backend
npm install
npm run dev
```

### 5. Acessar
Abra: **http://localhost:3000**

---

## 🔑 Tornar-se Admin

Após fazer login, execute no MongoDB:

```javascript
db.users.updateOne(
  { username: "SeuUsernameDiscord" },
  { $set: { role: "admin" } }
)
```

---

## 🌐 Deploy em Produção

### Backend (Railway / Render)
1. Faça push para GitHub
2. Conecte ao Railway/Render
3. Configure as variáveis de ambiente
4. MongoDB Atlas para banco de dados

### Variáveis de produção extras:
```env
NODE_ENV=production
DISCORD_CALLBACK_URL=https://seu-dominio.com/auth/discord/callback
FRONTEND_URL=https://seu-dominio.com
```

---

## 📸 Sistema de Badges

| Badge | Requisito |
|-------|-----------|
| ⚡ Primeira Quest | 1 quest concluída |
| 🥉 Bronze | 10 quests concluídas |
| 🥈 Prata | 50 quests concluídas |
| 🥇 Ouro | 100 quests concluídas |
| 💎 Diamante | 250 quests concluídas |

---

## 🔒 Segurança

- Tokens Discord validados pelo Passport.js
- Middleware de autenticação em todas as rotas protegidas
- Middleware de admin para rotas administrativas
- Upload limitado a 5MB, apenas imagens
- Sessões seguras com express-session

---

## 💡 Roadmap

- [ ] 🛒 Loja de itens com moedas
- [ ] 👥 Sistema de Guildas
- [ ] ⚔️ PvP de Quests
- [ ] 🔔 Notificações Discord (webhooks)
- [ ] 🎄 Eventos sazonais especiais
- [ ] 📱 App mobile (PWA)

---

## 📄 Licença

MIT — use e modifique à vontade!

---

> Feito com ⚔️ e ☕ por um Aventureiro
