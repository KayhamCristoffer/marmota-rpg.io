# 🔧 Como aplicar as Regras do Firebase

## Problema: PERMISSION_DENIED ao criar/editar quests no admin

As regras antigas usavam `auth.uid === 'UID_FIXO'` — apenas 1 usuário podia
ser admin. As novas regras verificam `role === 'admin'` no banco de dados,
permitindo múltiplos admins.

---

## 1. Acesse o Console Firebase

https://console.firebase.google.com/project/marmota-rpg/database/marmota-rpg-default-rtdb/rules

---

## 2. Cole as regras abaixo

```json
{
  "rules": {
    "users": {
      ".read": "auth !== null",
      "$uid": {
        ".write": "$uid === auth.uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        "role": {
          ".write": "root.child('users').child(auth.uid).child('role').val() === 'admin'"
        }
      }
    },
    "quests": {
      ".read": "auth !== null",
      "$questId": {
        ".write": "root.child('users').child(auth.uid).child('role').val() === 'admin'",
        "currentUsers": {
          ".write": "auth !== null"
        }
      }
    },
    "userQuests": {
      "$uid": {
        ".read":  "$uid === auth.uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".write": "$uid === auth.uid || root.child('users').child(auth.uid).child('role').val() === 'admin'"
      }
    },
    "submissions": {
      ".read":  "auth !== null",
      ".write": "auth !== null"
    },
    "achievements": {
      ".read":  "auth !== null",
      ".write": "root.child('users').child(auth.uid).child('role').val() === 'admin'"
    },
    "rankings": {
      ".read":  "auth !== null",
      ".write": "auth !== null"
    },
    "meta": {
      ".read":  "auth !== null",
      ".write": "root.child('users').child(auth.uid).child('role').val() === 'admin'"
    }
  }
}
```

---

## 3. Clique em "Publicar" (Publish)

---

## 4. Verifique o role do seu usuário no banco

Se ainda der PERMISSION_DENIED, confirme que seu usuário tem `role: "admin"`:

1. Console Firebase → Realtime Database → Data
2. Navegue para: `/users/<seu-uid>/role`
3. O valor deve ser `"admin"`

Se não for, edite manualmente no console para `"admin"`.

---

## Por que essa mudança?

| Antes | Depois |
|-------|--------|
| `auth.uid === 'UID_FIXO'` | `role === 'admin'` no banco |
| Apenas 1 admin possível | Múltiplos admins possíveis |
| Token expirado = sem acesso | Funciona para qualquer admin |

