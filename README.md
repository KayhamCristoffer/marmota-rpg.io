# 🎮 RPG Quests — Sistema de Quests Gamificado

> Sistema de quests gamificado estilo RPG com Firebase Realtime Database, painel admin, ranking por período, XP e níveis.

![RPG Quests](https://img.shields.io/badge/RPG%20Quests-v5.0-gold?style=for-the-badge)
![Firebase](https://img.shields.io/badge/Firebase-Realtime%20DB-orange?style=for-the-badge&logo=firebase)
![Vanilla JS](https://img.shields.io/badge/JavaScript-Vanilla-yellow?style=for-the-badge&logo=javascript)

---

## ✨ Funcionalidades

### 🔐 Autenticação
- Login com **email/senha** (Firebase Auth)
- Sessão persistente com auto-logout em 30 minutos de inatividade
- Criação automática de perfil ao primeiro login

### 🗡️ Sistema de Quests
- Quests **Diárias**, **Semanais**, **Mensais** e **Eventos**
- Limite de usuários por quest
- Nível mínimo para desbloquear quests
- Envio de **comprovante (print/imagem)** para revisão
- Status: Ativa → Em Análise → Concluída / Rejeitada
- Uma quest por usuário (rejeição permite reenvio)

### 📊 Estatísticas & Perfil
- XP e Sistema de Níveis (`XP necessário = 100 × nível`)
- Moedas totais, diárias, semanais e mensais
- Nickname personalizável
- Avatar emoji personalizável
- **Conquistas** (gerenciadas pelo admin)

### 🏆 Ranking
- Filtros: **Total | Diário | Semanal | Mensal**
- Pódio visual para Top 3
- Atualização em tempo real via `onValue`

### 👑 Painel Admin (`admin.html`)
- Criar, editar, ativar/desativar e deletar quests
- Aprovar ou rejeitar comprovantes enviados
- Gerenciar roles de usuários (User / Admin)
- Gerenciar conquistas (criar, editar, deletar)
- Reset manual de rankings

---

## 🛠️ Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML5, CSS3, JavaScript (Vanilla, ESM) |
| Database | Firebase Realtime Database |
| Auth | Firebase Authentication (Email/Senha) |
| Fonts | Cinzel (Google Fonts) |
| Icons | Font Awesome 6 |

---

## 📁 Estrutura

```
rpg-quests/
├── index.html               # Login
├── home.html                # Dashboard do usuário
├── admin.html               # Painel Admin
├── firebase.json            # Config Firebase CLI
├── firebase-rules.json      # Regras de segurança Firebase
├── css/
│   └── style.css
├── firebase/
│   ├── firebase-config.js   # Credenciais + ADMIN_UID
│   ├── services-config.js   # Auth + DB instances
│   ├── database.js          # Todas as funções DB (v5.0)
│   ├── session-manager.js   # Gestão de sessão + UI
│   └── firebase.datatime.js # Helpers de data/hora
├── js/
│   ├── auth.js              # Login/registro
│   ├── home.js              # Dashboard + estatísticas
│   ├── quests.js            # Quests + upload de print
│   ├── ranking.js           # Ranking em tempo real
│   └── admin.js             # Painel administrativo
└── deploy-rules.sh          # Script para publicar regras
```

---

## 🚀 Como Rodar

### 1. Servir os arquivos localmente

```bash
# Python
python3 -m http.server 8080

# Node
npx serve . -p 8080
```

Acesse: **http://localhost:8080**

### 2. Acessar o Painel Admin

Acesse `admin.html` — requer conta com `role: "admin"` no banco.

---

## 🔒 Publicar Regras de Segurança do Firebase

> ⚠️ **IMPORTANTE**: As regras em `firebase-rules.json` precisam ser publicadas no Firebase Console para que o admin possa criar/editar quests.

### Opção 1 — Via Firebase Console (mais simples)

1. Acesse: https://console.firebase.google.com/project/marmota-rpg/database/rules
2. Copie o conteúdo de `firebase-rules.json`
3. Cole no editor e clique em **Publicar**

### Opção 2 — Via Firebase CLI

```bash
# Instalar Firebase CLI (uma vez)
npm install -g firebase-tools

# Login
firebase login

# Publicar regras
firebase deploy --only database --project marmota-rpg

# Ou use o script incluso:
chmod +x deploy-rules.sh
./deploy-rules.sh
```

### Regras atuais (`firebase-rules.json`)

As regras permitem escrita em quests/conquistas para:
- **UID fixo do admin** (`F69XMBOumJSiuBvQm3c63HyJAjy2`) — fallback sempre funciona
- **Qualquer usuário com `role: "admin"`** no banco — permite múltiplos admins

---

## 🔑 Tornar um Usuário Admin

### Via Painel Admin
1. Faça login com a conta admin principal
2. Vá em **Painel Admin → Usuários**
3. Clique em **Tornar Admin** para o usuário desejado

### Via Firebase Console
1. Acesse o Realtime Database: https://console.firebase.google.com/project/marmota-rpg/database
2. Navegue até `users/{uid}`
3. Altere o campo `role` para `"admin"`

---

## 📸 Sistema de Conquistas

Conquistas são **criadas pelo admin** no painel (`admin.html → Conquistas`) e **concedidas automaticamente** quando o usuário completa o número necessário de quests.

Campos de uma conquista:
| Campo | Descrição |
|-------|-----------|
| `name` | Nome da conquista |
| `icon` | Emoji (ex: `🏆`) |
| `description` | Descrição |
| `level` | Nível mínimo necessário |
| `questsRequired` | Quests completas necessárias |
| `xpBonus` | XP bônus concedido |
| `coinsBonus` | Moedas bônus concedidas |

---

## 🔒 Segurança

- Todas as rotas protegidas por Firebase Auth
- Regras granulares no Realtime Database
- Upload de imagens comprimido (JPEG, max ~500KB) direto no banco
- Auto-logout por inatividade (30 min)

---

## 📄 Licença

MIT — use e modifique à vontade!

---

> Feito com ⚔️ e ☕ por um Aventureiro
