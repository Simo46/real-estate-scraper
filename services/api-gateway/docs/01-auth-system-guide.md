# API Gateway - Authentication System Guide

## 🚀 Quick Reference

**Middleware essenziali:**
```javascript
const { authenticate, hasRole } = require('../middleware/authMiddleware');

// Protezione route base
router.get('/protected', authenticate, controller.method);

// Protezione con ruolo specifico  
router.post('/admin', authenticate, hasRole('Admin'), controller.method);
```

**Flussi autenticazione:**
- **Single Role**: `POST /auth/login` → Token immediato
- **Multi Role**: `POST /auth/login` → PreAuth → `POST /auth/confirm-role` → Token
- **Refresh**: `POST /auth/refresh` → Nuovi token
- **Switch Role**: `POST /auth/switch-role` → Token con nuovo ruolo

**Token JWT payload:**
```javascript
{
  sub: "user-id",
  username: "admin",
  tenant_id: "tenant-uuid", 
  active_role_id: "role-uuid",    // Ruolo attivo
  active_role_name: "Admin",      // Nome ruolo
  iat: 1640995200,
  exp: 1640999200
}
```

**File chiave:**
- `src/config/passport.js` - Strategia JWT
- `src/middleware/authMiddleware.js` - Middleware protezione
- `src/services/jwtService.js` - Generazione/verifica token
- `src/api/controllers/authController.js` - Logica autenticazione

---

## 🔐 Panoramica Sistema

### Architettura Authentication

Il sistema di autenticazione è progettato per essere:
- **Stateless** con JWT per scalabilità orizzontale
- **Multi-ruolo** per utenti con permessi diversi
- **Multi-tenant** con isolamento completo dati
- **Sicuro** con refresh token rotation e rate limiting

### Componenti Principali

**1. JWT Service** - Generazione e verifica token
**2. Passport Strategy** - Validazione JWT e utenti  
**3. Auth Middleware** - Protezione route
**4. Auth Controller** - Logica flussi autenticazione
**5. Rate Limiter** - Protezione da attacchi

---

## 🔑 Tipi di Token JWT

### 1. Access Token (15 minuti)

**Scopo**: Autenticazione API calls
**Durata**: 15 minuti (configurabile via `JWT_EXPIRES_IN`)
**Algoritmo**: HS256

**Payload completo:**
```javascript
{
  sub: "94918079-c73f-4429-875c-5623a81944b5",
  name: "Administrator", 
  email: "admin@example.com",
  username: "admin",
  tenant_id: "78c0ba61-2123-4e63-b1c8-d92e945fc260",
  filiale_id: null,                    // Per future implementazioni
  active_role_id: "admin-role-uuid",   // Ruolo attivo corrente  
  active_role_name: "Admin",           // Nome umano del ruolo
  iat: 1640995200,
  exp: 1640999200
}
```

### 2. Refresh Token (7 giorni)

**Scopo**: Rinnovare access token senza re-login
**Durata**: 7 giorni (configurabile via `JWT_REFRESH_EXPIRES_IN`)

**Payload refresh:**
```javascript
{
  sub: "94918079-c73f-4429-875c-5623a81944b5",
  type: "refresh",
  jti: "refresh-token-unique-id",      // Per tracking/revocazione
  active_role_id: "admin-role-uuid",   // Mantiene ruolo attivo
  iat: 1640995200,
  exp: 1641600000
}
```

### 3. PreAuth Token (2 minuti)

**Scopo**: Selezione sicura ruolo per utenti multi-ruolo
**Durata**: 2 minuti (configurabile via `JWT_PRE_AUTH_EXPIRES_IN`)

**Payload preauth:**
```javascript
{
  type: "pre_auth",
  sub: "94918079-c73f-4429-875c-5623a81944b5",
  tenant_id: "78c0ba61-2123-4e63-b1c8-d92e945fc260",
  available_role_ids: [                // Ruoli tra cui scegliere
    "admin-role-uuid",
    "user-role-uuid"
  ],
  jti: "preauth-token-unique-id",      // Prevenire riutilizzo
  iat: 1640995200,
  exp: 1640995320                      // Solo 2 minuti!
}
```

---

## 🚪 Flussi di Autenticazione

### 1. Login Utente Single-Role

**Scenario**: Utente con un solo ruolo (Admin, User, System)

```javascript
// Request
POST /api/auth/login
{
  "username": "admin",
  "password": "admin123"
}

// Response immediata con token
{
  "status": "success",
  "message": "Login completato",
  "data": {
    "user": {
      "id": "user-uuid",
      "username": "admin",
      "active_role": {
        "id": "admin-role-uuid", 
        "name": "Admin"
      }
    },
    "tokens": {
      "accessToken": "eyJ0eXAiOiJKV1Q...",
      "refreshToken": "eyJ0eXAiOiJKV1Q...", 
      "expires": "2024-01-01T12:15:00Z"
    }
  }
}
```

### 2. Login Utente Multi-Role

**Scenario**: Utente con più ruoli (raro ma supportato)

```javascript
// Step 1: Login iniziale
POST /api/auth/login
{
  "username": "multi_user", 
  "password": "password"
}

// Response con richiesta selezione ruolo
{
  "status": "choose_role",
  "message": "Seleziona il ruolo per questa sessione",
  "data": {
    "preAuthToken": "eyJ0eXAiOiJKV1Q...",  // Token temporaneo 2 min
    "available_roles": [
      {
        "id": "admin-role-uuid",
        "name": "Admin",
        "description": "Accesso completo"
      },
      {
        "id": "user-role-uuid", 
        "name": "User",
        "description": "Accesso limitato"
      }
    ]
  }
}

// Step 2: Conferma ruolo scelto
POST /api/auth/confirm-role
{
  "preAuthToken": "eyJ0eXAiOiJKV1Q...",
  "roleId": "admin-role-uuid"
}

// Response con token finale
{
  "status": "success",
  "message": "Login completato",
  "data": {
    "user": { /* user data con ruolo attivo */ },
    "tokens": { /* access + refresh token */ }
  }
}
```

### 3. Refresh Token Flow

**Scenario**: Access token scaduto, rinnovo automatico

```javascript
// Request con refresh token
POST /api/auth/refresh
{
  "refreshToken": "eyJ0eXAiOiJKV1Q..."
}

// Response con nuovi token (mantiene ruolo attivo)
{
  "status": "success", 
  "data": {
    "tokens": {
      "accessToken": "eyJ0eXAiOiJKV1Q...",    // Nuovo access token
      "refreshToken": "eyJ0eXAiOiJKV1Q...",   // Nuovo refresh token
      "expires": "2024-01-01T12:30:00Z"
    }
  }
}
```

### 4. Switch Role Durante Sessione

**Scenario**: Cambio ruolo senza re-login (per utenti multi-ruolo)

```javascript
// Request cambio ruolo
POST /api/auth/switch-role
Authorization: Bearer <current-access-token>
{
  "roleId": "user-role-uuid"
}

// Response con token aggiornati
{
  "status": "success",
  "message": "Ruolo cambiato", 
  "data": {
    "user": {
      "id": "user-uuid",
      "username": "multi_user",
      "active_role": {
        "id": "user-role-uuid",
        "name": "User"                   // Ruolo aggiornato
      }
    },
    "tokens": {
      "accessToken": "eyJ0eXAiOiJKV1Q...",    // Token con nuovo ruolo
      "refreshToken": "eyJ0eXAiOiJKV1Q..."    // Refresh token aggiornato
    }
  }
}
```

---

## ⚙️ Configurazione Passport.js

### Strategia JWT Implementata

Il sistema utilizza Passport.js con strategia JWT custom per validazione robusta:

```javascript
// Configurazione in config/passport.js
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
  algorithms: ['HS256'],
  ignoreExpiration: false
};

// Validazioni multiple nella strategia
const jwtStrategy = new JwtStrategy(jwtOptions, async (payload, done) => {
  // 1. Verifica esistenza e attivazione utente
  // 2. Verifica validità temporale token vs password update
  // 3. Verifica corrispondenza tenant
  // 4. Validazione ruolo attivo se specificato
  // 5. Caricamento ruoli e permessi
});
```

### Validazioni Implementate

**1. Verifica Utente Attivo:**
```javascript
if (!user || !user.active) {
  return done(null, false, { message: 'Utente non trovato o non attivo' });
}
```

**2. Invalidazione Token dopo Password Change:**
```javascript
if (payload.iat < Math.floor(new Date(user.updated_at).getTime() / 1000)) {
  return done(null, false, { message: 'Token non più valido, necessario nuovo login' });
}
```

**3. Verifica Multi-Tenant:**
```javascript
if (payload.tenant_id !== user.tenant_id) {
  return done(null, false, { message: 'Token non valido per questo tenant' });
}
```

**4. Validazione Ruolo Attivo:**
```javascript
if (payload.active_role_id) {
  const hasActiveRole = user.roles.some(role => 
    role.id === payload.active_role_id && role.active !== false
  );
  
  if (!hasActiveRole) {
    return done(null, false, { 
      message: 'Ruolo non più valido, necessario nuovo login',
      code: 'INVALID_ROLE'
    });
  }
}
```

---

## 🛡️ Middleware di Protezione

### 1. Authenticate Middleware

**Scopo**: Verifica JWT e carica utente in `req.user`

Esempio:
```javascript
// Uso base - protezione route
router.get('/profile', authenticate, userController.getProfile);

// Il middleware aggiunge automaticamente:
// req.user = {
//   id: "user-uuid",
//   username: "admin", 
//   active_role_id: "role-uuid",
//   active_role_name: "Admin",
//   tenant_id: "tenant-uuid",
//   roles: [...],        // Array ruoli con abilities
//   hasRole(name),       // Helper method
//   hasAnyRole([names])  // Helper method
// }
```

**Gestione Errori Automatica:**
- Token mancante → 401 "Token non valido"
- Token scaduto → 401 "Token non valido" 
- Utente non attivo → 401 "Utente non trovato o non attivo"
- Ruolo non valido → 403 "Ruolo non più valido"

### 2. HasRole Middleware

**Scopo**: Verifica ruoli specifici dopo autenticazione

```javascript
// Singolo ruolo
router.delete('/users/:id', 
  authenticate, 
  hasRole('Admin'),           // Solo Admin può eliminare
  userController.deleteUser
);

// Ruoli multipli
router.get('/reports', 
  authenticate,
  hasRole(['Admin', 'Manager']),  // Admin O Manager
  reportController.getReports
);
```

**Note Implementative:**
- Sempre usare `authenticate` prima di `hasRole`
- `hasRole` utilizza i metodi helper dell'oggetto user
- Supporta sia stringa che array di ruoli

---

## 🔧 Servizio JWT

### Generazione Token

Il `JwtService` gestisce tutti i tipi di token:

```javascript
const jwtService = require('../services/jwtService');

// Token standard con ruolo attivo
const { accessToken, refreshToken } = jwtService.generateTokens(
  user,                    // Oggetto utente 
  'admin-role-uuid',      // ID ruolo attivo
  { custom: 'claims' }    // Claims aggiuntivi (opzionale)
);

// Token pre-autenticazione
const { preAuthToken } = jwtService.generatePreAuthToken(
  user,                   // Utente autenticato
  ['role1', 'role2']     // Ruoli disponibili per selezione
);
```

### Configurazione Ambiente

**Variabili JWT richieste:**
```bash
# .env
JWT_SECRET=your-super-secret-key-for-access-tokens
JWT_REFRESH_SECRET=your-super-secret-key-for-refresh-tokens  
JWT_PRE_AUTH_SECRET=your-super-secret-key-for-preauth-tokens

# Durate token (opzionali, defaults sensati)
JWT_EXPIRES_IN=15m              # Access token
JWT_REFRESH_EXPIRES_IN=7d       # Refresh token  
JWT_PRE_AUTH_EXPIRES_IN=2m      # PreAuth token
```

**Sicurezza Secrets:**
- Usa secret diversi per ogni tipo di token
- Minimum 256-bit per sicurezza ottimale
- Genera con `openssl rand -base64 32`

---

## 🚫 Rate Limiting

### Protezione Endpoint

Il sistema implementa rate limiting specifico per endpoint di autenticazione:

**Configurazione attuale:**
- **Login**: 5 tentativi per IP ogni 15 minuti
- **Confirm Role**: 10 tentativi per token
- **Switch Role**: 20 switch per utente ogni ora
- **General Auth**: Rate limiting generale per tutti gli endpoint

**Bypass per Admin:**
```javascript
// Rate limiting può essere resettato da amministratori
POST /api/auth/reset-rate-limit
{
  "identifier": "192.168.1.100",   // IP da resettare
  "type": "ip",                    // Tipo: 'ip' o 'user'
  "reason": "False positive"       // Motivazione reset
}
```

---

## 🎯 Multi-Tenant Integration

### Identificazione Tenant

Il sistema supporta identificazione tenant in due modi:

**1. Header X-Tenant-ID (Development):**
```javascript
// Per sviluppo e test
curl -H "X-Tenant-ID: 78c0ba61-2123-4e63-b1c8-d92e945fc260" \
     -H "Authorization: Bearer <token>" \
     http://localhost:3000/api/users
```

**2. Sottodominio (Production):**
```javascript
// Produzione con sottodomini
// tenant1.app.com → tenant_id automatico da database
// tenant2.app.com → tenant_id diverso
```

### Isolamento Dati

**Token JWT includono tenant_id:**
- Ogni token è legato a un tenant specifico
- Validazione automatica tenant nel Passport strategy
- Cross-tenant access automaticamente bloccato

**Database queries filtrate:**
- Middleware automatico aggiunge `tenant_id` alle query
- Sequelize hooks garantiscono filtri corretti
- Nessun dato leak tra tenant diversi

---

## 🔄 Integrazione con Sistema Permessi

### CASL Integration

L'autenticazione si integra perfettamente con il sistema di autorizzazione CASL:

```javascript
// Dopo authenticate middleware:
// req.user contiene ruoli e abilities

// Il sistema CASL usa automaticamente il ruolo attivo
const ability = await abilityService.defineAbilityFor(req.user);

// Solo il ruolo attivo determina i permessi
if (req.user.active_role_id) {
  // Usa SOLO il ruolo attivo per generare abilities
  const activeRoles = req.user.roles.filter(role => 
    role.id === req.user.active_role_id
  );
} else {
  // Fallback legacy: usa tutti i ruoli (per token vecchi)
  const allRoles = req.user.roles;
}
```

### Policy Middleware Integration

```javascript
// Autenticazione + autorizzazione in pipeline
router.put('/users/:id',
  authenticate,                           // 1. Verifica JWT
  policyMiddlewareFactory.create('User', 'update'),  // 2. Verifica policy
  userController.updateUser              // 3. Esegui azione
);

// La policy riceve automaticamente:
// - req.user (da authenticate)
// - req.ability (calcolato dal ruolo attivo)
// - req.resource (caricato se necessario)
```

---

## 🧪 Testing Authentication

### Test Login Flow

```javascript
// Test utente single-role
const response = await request(app)
  .post('/api/auth/login')
  .send({
    username: 'admin',
    password: 'admin123'
  })
  .expect(200);

expect(response.body.status).toBe('success');
expect(response.body.data.tokens.accessToken).toBeDefined();
expect(response.body.data.user.active_role.name).toBe('Admin');
```

### Test Protected Routes

```javascript
// Test route protetta
const loginResponse = await request(app)
  .post('/api/auth/login') 
  .send({ username: 'admin', password: 'admin123' });

const token = loginResponse.body.data.tokens.accessToken;

const protectedResponse = await request(app)
  .get('/api/users')
  .set('Authorization', `Bearer ${token}`)
  .expect(200);

expect(protectedResponse.body.data).toBeDefined();
```

### Test Multi-Tenant

```javascript
// Test isolamento tenant
const response = await request(app)
  .get('/api/users')
  .set('Authorization', `Bearer ${token}`)
  .set('X-Tenant-ID', 'different-tenant-id')
  .expect(401);  // Token non valido per tenant diverso
```

---

## 🔍 Debugging e Troubleshooting

### Log Authentication

Il sistema logga dettagliatamente per debugging:

```javascript
// Abilita debug logging
DEBUG=middleware:auth,config:passport,services:jwt npm start

// Logs tipici
[middleware:auth] Utente admin autenticato con ruolo Admin
[config:passport] Ruolo attivo validato: Admin (uuid)
[services:jwt] Token generati per utente admin con ruolo Admin
```

### Errori Comuni

**"Token non valido":**
- Verifica JWT_SECRET in .env
- Controlla formato token (Bearer prefix)
- Verifica scadenza token

**"Ruolo non più valido":**
- Ruolo rimosso dall'utente durante sessione
- Ruolo disattivato da admin
- Richiede nuovo login

**"Token non valido per questo tenant":**
- Header X-Tenant-ID non corrisponde al token
- Token generato per tenant diverso
- Problema identificazione tenant

### Validazione Token JWT

```bash
# Decodifica token per debug (senza verifica firma)
echo "eyJ0eXAiOiJKV1Q..." | base64 -d | jq

# Verifica token online
# jwt.io per debug manuale
```

---

## 📋 Security Best Practices

### Configurazione Sicura

**1. Secrets Management:**
```bash
# Genera secrets sicuri
openssl rand -base64 32  # Per JWT_SECRET
openssl rand -base64 32  # Per JWT_REFRESH_SECRET  
openssl rand -base64 32  # Per JWT_PRE_AUTH_SECRET
```

**2. Token Durata:**
- Access token: 15-30 minuti massimo
- Refresh token: 7 giorni massimo  
- PreAuth token: 2 minuti fissi (non modificare)

**3. HTTPS Only:**
```javascript
// Produzione: sempre HTTPS
app.use((req, res, next) => {
  if (req.header('x-forwarded-proto') !== 'https') {
    res.redirect(`https://${req.header('host')}${req.url}`);
  } else {
    next();
  }
});
```

### Token Security

**1. Revocazione Token:**
- Cambiare JWT_SECRET invalida tutti i token esistenti
- Database tracking di refresh token per revoca selettiva (future)
- Logout invalida refresh token (implementare)

**2. XSS/CSRF Protection:**
- Non memorizzare JWT in localStorage (usa httpOnly cookies)
- Implementare CSRF token per state-changing operations
- Sanitizzare input per prevenire XSS

---

## 🎯 Prossimi Passi

### Implementazioni Future

**1. Token Blacklist:**
- Database tracking per logout sicuro
- Revoca selettiva refresh token
- Cleanup automatico token scaduti

**2. Session Management:**
- Tracking sessioni attive per utente
- Logout da tutti i dispositivi
- Notifica login sospetti

**3. Enhanced Security:**
- 2FA (Two-Factor Authentication)
- Device fingerprinting
- Geolocation tracking per security

**4. Performance Optimization:**
- Token caching in Redis
- Lazy loading ruoli e permessi
- Background refresh token rotation

---

## 📚 Reference API

### Endpoint Authentication

```javascript
// Login standard
POST /api/auth/login
Body: { username, password, roleId? }
Response: { user, tokens } | { status: "choose_role", preAuthToken, roles }

// Login con ruolo specifico (shortcut)
POST /api/auth/login-with-role
Body: { username, password, roleId }
Response: { user, tokens }

// Conferma ruolo (dopo choose_role)
POST /api/auth/confirm-role  
Body: { preAuthToken, roleId }
Response: { user, tokens }

// Cambio ruolo durante sessione
POST /api/auth/switch-role
Auth: Bearer token
Body: { roleId }
Response: { user, tokens }

// Refresh token
POST /api/auth/refresh
Body: { refreshToken }
Response: { tokens }

// User info corrente
GET /api/auth/me
Auth: Bearer token
Response: { user }

// Ruoli disponibili per utente
GET /api/auth/available-roles
Auth: Bearer token  
Response: { roles }

// Logout (future)
POST /api/auth/logout
Auth: Bearer token
Response: { success }
```

Il sistema di autenticazione è robusto, sicuro e pronto per supportare l'evoluzione del progetto real estate scraper. 🔐