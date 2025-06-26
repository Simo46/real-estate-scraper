# Real Estate Scraper - Onboarding Guide

## 🚀 Quick Reference

**Setup essenziale (2 comandi):**
```bash
git clone <repository-url>
cd real-estate-scraper && ./scripts/dev-setup.sh
```

**Verifica funzionamento:**
- API Gateway: http://localhost:3000/api/health
- Login test: `POST /api/auth/login` con `admin/admin123`
- Tenant ID default: `78c0ba61-2123-4e63-b1c8-d92e945fc260`

**Servizi attualmente attivi:**
- **API Gateway** (3000): Sistema auth/authorization completo + API REST ✅
- **PostgreSQL** (5432): Database utenti, ruoli, permessi ✅
- **Redis** (6379): Cache e session storage ✅
- **MongoDB** (27017): Database preparato per annunci immobiliari ⏳
- **Ollama** (11434): Modelli AI locali preparati ⏳

**Comandi utili:**
```bash
docker compose logs -f api-gateway    # Log del servizio principale
docker compose ps                     # Stato di tutti i servizi
docker compose down                   # Ferma tutto
```

**Credenziali di default:**
- **Username**: `admin`
- **Password**: `admin123`
- **Tenant ID**: `78c0ba61-2123-4e63-b1c8-d92e945fc260`

---

## 📖 Benvenuto nel Real Estate Scraper

Questo progetto è una **piattaforma intelligente per lo scraping e l'analisi di annunci immobiliari** che utilizza AI per elaborare ricerche in linguaggio naturale e fornire insights di mercato avanzati.

### Cos'è il Real Estate Scraper

**Obiettivo Finale**: Permettere ricerche immobiliari intelligenti come "Appartamento 3 camere zona Brera Milano, budget 300k, possibilmente con terrazzo" e ottenere risultati elaborati da multiple piattaforme italiane.

**Stato Attuale**: Sistema backend robusto con autenticazione multi-tenant e multi-ruolo completo, pronto per l'integrazione con:
- Scraping di portali immobiliari italiani (Immobiliare.it, Casa.it, etc.)
- Elaborazione AI con modelli locali (Ollama + Llama)
- Frontend Vue.js per interfaccia utente

### Flusso Applicativo Pianificato

```
Input utente → NLP Processing → Scraping Portali → AI Analysis → Risultati Elaborati
```

**Al momento implementato:**
- **Infrastruttura**: Sistema auth/authorization enterprise-grade
- **Database**: Schema multi-tenant per isolamento dati
- **API Gateway**: Endpoint sicuri e performanti

**In sviluppo:**
- **NLP Service**: Elaborazione richieste linguaggio naturale
- **Scraping Engine**: Estrazione dati da portali immobiliari
- **Frontend**: Interfaccia utente moderna

---

## 🗂️ Struttura Progetto

```
real-estate-scraper/
├── docs/                           # 📚 Documentazione generale
├── scripts/                        # 🔧 Utility e setup
├── services/
│   ├── api-gateway/                # 🚪 Servizio principale (✅ COMPLETO)
│   │   ├── src/
│   │   │   ├── api/               # Controllers, routes, validators
│   │   │   ├── middleware/        # Auth, permissions, tenant
│   │   │   ├── models/            # Sequelize models
│   │   │   ├── policies/          # Autorizzazioni CASL
│   │   │   ├── services/          # Business logic
│   │   │   └── utils/             # Utilities e helpers
│   │   ├── docs/                  # 📖 Doc specifiche (4 guide complete)
│   │   ├── docker-entrypoint.sh   # 🚀 Inizializzazione container
│   │   └── Dockerfile
│   ├── nlp-service/               # 🧠 Elaborazione NLP (⏳ PREPARATO)
│   │   ├── app/
│   │   │   ├── models/            # Gestione modelli Ollama
│   │   │   ├── processors/        # Pipeline NLP
│   │   │   └── utils/             # Utilities Python
│   │   └── Dockerfile
│   └── ...                        # Altri servizi (📋 PIANIFICATI)
├── .env.example                    # Template configurazione
├── docker-compose.yaml             # Orchestrazione servizi
└── package.json                    # Scripts npm root-level
```

---

## 🛠️ Setup Ambiente di Sviluppo

### Prerequisiti

Il progetto è completamente containerizzato, servono solo:
- **Git** (per clonare il repository)
- **Docker** + **Docker Compose** (per i servizi)

### Setup Automatico

Il processo di setup è stato ottimizzato per essere **il più semplice possibile**:

```bash
# 1. Clona il repository
git clone <repository-url>
cd real-estate-scraper

# 2. Esegui setup automatico
./scripts/dev-setup.sh
```

### Cosa fa lo script di setup

Lo script `dev-setup.sh` automatizza tutto il processo:

1. **Controllo dipendenze**: Verifica che Docker sia installato
2. **Configurazione ambiente**: Crea `.env` da `.env.example` se non esiste
3. **Build e avvio servizi**: `docker compose up -d`
4. **Inizializzazione API Gateway**: `docker-entrypoint.sh` configura tutto
5. **Database setup**: Migrations e seeding automatici con dati di test
6. **Download modelli AI**: Ollama scarica i modelli necessari (preparazione futura)
7. **Health check**: Verifica che tutti i servizi siano attivi

**Tempo stimato**: 3-5 minuti (più tempo per modelli AI se connessione lenta)

### Struttura generata

Dopo il setup avrai:
```
real-estate-scraper/
├── .env                    # Configurazione ambiente (auto-generato)
├── docker-compose.yaml     # Orchestrazione servizi
├── services/
│   ├── api-gateway/        # ✅ Servizio principale funzionante
│   ├── nlp-service/        # ⏳ Preparato per sviluppi futuri
│   └── ...                 # Altri servizi (in pianificazione)
├── docs/                   # Documentazione completa progetto
└── scripts/                # Utility e setup
```

---

## ✅ Verifica Funzionamento

### 1. Controllo servizi attivi

```bash
# Verifica che tutti i container siano running
docker compose ps

# Dovrai vedere:
# ✅ api-gateway (Up)
# ✅ postgres (Up) 
# ✅ redis (Up)
# ✅ mongodb (Up) - preparato
# ✅ ollama (Up) - preparato
```

### 2. Test API Gateway (Sistema Principale)

**Health check**:
```bash
curl http://localhost:3000/api/health
# Output atteso: {"status": "healthy", "timestamp": "..."}
```

**Test autenticazione con credenziali di default**:
```bash
# Login con utente admin creato dal seeding
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: 78c0ba61-2123-4e63-b1c8-d92e945fc260" \
  -d '{"username": "admin", "password": "admin123"}'

# Output atteso: 
# {
#   "status": "success",
#   "data": {
#     "user": { "username": "admin", "active_role": { "name": "Admin" } },
#     "tokens": { "accessToken": "eyJ...", "refreshToken": "eyJ..." }
#   }
# }
```

**Test endpoint protetto**:
```bash
# Estrai il token dalla risposta precedente
TOKEN="<access-token-from-login>"

# Testa endpoint protetto
curl -X GET http://localhost:3000/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: 78c0ba61-2123-4e63-b1c8-d92e945fc260"

# Output atteso: Lista utenti del tenant
```

### 3. Test Database PostgreSQL

```bash
# Accedi al database per verificare le tabelle create
docker compose exec postgres psql -U real_estate_user -d real_estate

# Comandi utili nel database:
# \dt                    - Lista tabelle create
# SELECT * FROM users;   - Verifica utenti dal seeding (dovrai vedere admin)
# SELECT * FROM tenants; - Verifica tenant di default
# \q                     - Esci
```

### 4. Verifica Servizi Preparati (Non Ancora Attivi)

**MongoDB** (preparato per annunci):
```bash
# Verifica che MongoDB sia attivo (container up)
docker compose exec mongodb mongosh
# Comando: show dbs (dovrebbe mostrare database vuoti)
# exit
```

**Ollama** (preparato per AI):
```bash
# Verifica che Ollama sia attivo e abbia modelli
curl http://localhost:11434/api/tags
# Output atteso: Lista modelli installati (se download completato)
```

---

## 🏗️ Panoramica Servizi

### API Gateway (Porto 3000) - ✅ ATTIVO E COMPLETO
**Tecnologia**: Node.js 22 + Express 5
**Stato**: **Production-ready con documentazione completa**

**Responsabilità implementate**:
- **Autenticazione JWT** multi-ruolo con refresh token
- **Autorizzazioni granulari** con CASL e policy system
- **Multi-tenancy** con isolamento dati completo
- **API REST** per gestione utenti e ruoli
- **Rate limiting** e security avanzata
- **Audit trail** ready per compliance

**Documentazione disponibile**:
- `services/api-gateway/docs/01-auth-system-guide.md` - Sistema autenticazione
- `services/api-gateway/docs/02-permission-system-guide.md` - Autorizzazioni CASL
- `services/api-gateway/docs/03-multi-tenant-guide.md` - Sistema multi-tenant
- `services/api-gateway/docs/04-api-development-guide.md` - Sviluppo API

**Endpoints principali**:
```bash
# Autenticazione
POST /api/auth/login           # Login multi-ruolo
POST /api/auth/refresh         # Refresh token
POST /api/auth/switch-role     # Cambio ruolo in sessione

# Gestione utenti (con autorizzazioni)
GET  /api/users               # Lista utenti filtrata per tenant
POST /api/users               # Creazione utenti
PUT  /api/users/:id           # Aggiornamento con permission check

# Gestione ruoli e permessi
GET  /api/roles               # Lista ruoli
POST /api/users/:id/abilities # Permessi individuali
```

### Database Services - ✅ ATTIVI

**PostgreSQL (Porto 5432)**:
- **Stato**: Completamente configurato e utilizzato
- **Contenuto**: Utenti, ruoli, permessi, tenant, audit trail
- **Schema**: Relazionale con constraints e indexes
- **Seeding**: Dati di test automatici (admin user, tenant default)

**Redis (Porto 6379)**:
- **Stato**: Attivo e configurato
- **Uso attuale**: Cache API responses (ready)
- **Futuro**: Session storage, message queue

**MongoDB (Porto 27017)**:
- **Stato**: Container attivo, schema preparato
- **Uso futuro**: Annunci immobiliari, risultati ricerche
- **Preparazione**: Collections e indexes pronti per implementazione

### AI Infrastructure - ⏳ PREPARATO

**Ollama (Porto 11434)**:
- **Stato**: Container attivo, modelli in download
- **Modelli preparati**: Llama 3.2:3b, nomic-embed-text
- **Uso futuro**: NLP processing per richieste utente
- **Resource**: Gestione memoria intelligente

**NLP Service (Porto 8001)**:
- **Stato**: Struttura pronta, non ancora attivo
- **Tecnologia**: Python + FastAPI + spaCy
- **Pipeline futura**: Entity extraction, intent classification
- **Integration point**: Ready per collegamento con API Gateway

---

## 🧪 Ambiente di Sviluppo

### Hot Reload Attivo

L'API Gateway è configurato per **hot reload** durante lo sviluppo:
- **Nodemon** rileva modifiche `.js` e riavvia automaticamente
- **Database**: Preserva dati tra restart per continuità sviluppo
- **Environment variables**: Reload automatico da `.env`

### Logs e Debug

```bash
# Log in tempo reale del servizio principale
docker compose logs -f api-gateway

# Log specifici per debugging auth
DEBUG=middleware:auth,config:passport npm start

# Log di tutti i servizi
docker compose logs -f

# Log con filtro per errori
docker compose logs | grep ERROR
```

### Database Development

```bash
# Esegui nuova migration
docker compose exec api-gateway npx sequelize-cli migration:generate --name add-new-feature

# Applica migrations
docker compose exec api-gateway npm run migrate

# Reset database (attenzione: cancella tutti i dati)
docker compose exec api-gateway npm run db:reset

# Verifica seeding (dati di test)
docker compose exec api-gateway npm run seed
```

### Testing del Sistema Auth

```bash
# Test completo del flusso di autenticazione
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: 78c0ba61-2123-4e63-b1c8-d92e945fc260" \
  -d '{"username": "admin", "password": "admin123"}'

# Salva il token
export TOKEN="<access-token-dalla-risposta>"

# Test switch ruolo (se utente multi-ruolo)
curl -X POST http://localhost:3000/api/auth/switch-role \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"roleId": "<role-id>"}'

# Test refresh token
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refresh-token>"}'
```

---

## 🔐 Sistema Multi-Tenant + Auth

Il cuore del progetto è un **sistema enterprise-grade** per gestione multi-cliente:

### Multi-Tenancy
- **Isolamento completo**: Ogni agenzia immobiliare ha i propri dati
- **Identificazione automatica**: Via header `X-Tenant-ID` (dev) o sottodominio (prod)
- **Database segregation**: Filtri automatici a livello ORM
- **Configurazioni separate**: Settings JSON per personalizzazioni

### Autenticazione Avanzata
- **JWT stateless** con access token (15 min) + refresh token (7 giorni)
- **Multi-ruolo**: Utenti possono avere più ruoli e switchare in sessione
- **Rate limiting**: Protezione da attacchi con reset automatico
- **Audit trail**: Tracciamento completo delle azioni

### Autorizzazioni Granulari (CASL)
- **Policy-based**: Logica autorizzazione centralizzata e testabile
- **Field-level**: Controllo accesso fino al singolo campo
- **Resource-based**: Permessi specifici per risorsa
- **Inheritance**: Permessi ereditati da ruoli + permessi individuali

**Esempio flusso autorizzazione:**
```
Request → tenantMiddleware → authenticate → policyMiddleware → controller
```

---

## 🎯 Prossimi Passi per Development

### 1. **Familiarizzazione con Sistema Esistente** (Raccomandato)

**Studia la documentazione completa**:
- `services/api-gateway/docs/01-auth-system-guide.md` - Come funziona l'auth
- `services/api-gateway/docs/02-permission-system-guide.md` - Sistema permessi
- `services/api-gateway/docs/03-multi-tenant-guide.md` - Multi-tenancy
- `services/api-gateway/docs/04-api-development-guide.md` - Pattern sviluppo

**Esplora il codice**:
- `services/api-gateway/src/api/controllers/` - Pattern controller
- `services/api-gateway/src/policies/` - Logica autorizzazioni
- `services/api-gateway/src/middleware/` - Pipeline request

### 2. **Test Pratico Sistema**

**Crea utenti di test**:
```bash
# Usa l'endpoint di creazione utenti
curl -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: 78c0ba61-2123-4e63-b1c8-d92e945fc260" \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "email": "test@example.com", "password": "password123"}'
```

**Testa autorizzazioni**:
```bash
# Prova accesso con utente normale vs admin
# Testa field filtering automatico nelle risposte
# Sperimenta con permessi individuali
```

### 3. **Sviluppo Features Real Estate**

**Roadmap suggerita**:
1. **NLP Integration**: Attivare servizio elaborazione linguaggio naturale
2. **Scraping Engine**: Implementare estrazione dati portali
3. **Frontend**: Interfaccia Vue.js per utenti finali

### 4. **Pattern di Sviluppo**

**Per nuove API**:
1. **Modello**: Crea Sequelize model con multi-tenancy
2. **Policy**: Definisci autorizzazioni specifiche
3. **Controller**: Implementa business logic
4. **Routes**: Configura middleware stack
5. **Test**: Verifica autorizzazioni e funzionalità

---

## 🆘 Risoluzione Problemi Comuni

### Container non si avviano
```bash
# Controlla lo stato
docker compose ps

# Verifica i log per errori
docker compose logs api-gateway
docker compose logs postgres

# Ricostruisci se necessario
docker compose up -d --build
```

### Database connection failed
```bash
# Verifica PostgreSQL
docker compose ps postgres

# Controlla variabili d'ambiente
cat .env | grep DB_

# Reset completo database
docker compose down
docker volume rm real-estate-scraper_postgres_data
docker compose up -d
```

### Login fallisce con 401
```bash
# Verifica che il seeding sia stato eseguito
docker compose exec postgres psql -U real_estate_user -d real_estate -c "SELECT * FROM users;"

# Verifica tenant ID corretto
docker compose exec postgres psql -U real_estate_user -d real_estate -c "SELECT * FROM tenants;"

# Re-run seeding se necessario
docker compose exec api-gateway npm run seed
```

### Modelli AI non pronti
```bash
# Verifica download modelli Ollama
docker compose exec ollama ollama list

# Forza download se necessario
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama pull nomic-embed-text
```

### Problemi di permessi (Linux/Mac)
```bash
# Assicurati che i volumi Docker abbiano i permessi corretti
sudo chown -R $USER:$USER .
```

---

## 📞 Supporto e Risorse

### Documentazione Completa
- **Setup**: Questo documento per onboarding
- **Architettura**: `docs/02-architecture-overview.md`
- **Development**: `docs/03-development-workflow.md`
- **API Gateway**: Documentazione completa in `services/api-gateway/docs/`

### Tools di Debug
- **Database GUI**: Puoi connettere pgAdmin a PostgreSQL per debugging
- **API Testing**: Usa Postman o curl per test endpoint
- **Logs Structure**: JSON logging con Pino per debugging avanzato

### Supporto Sviluppo
- **Issues**: Usa GitHub Issues per bug o feature request
- **Documentation**: Aggiorna la docs quando implementi nuove features
- **Code Review**: Pattern stabiliti da seguire per consistency

**Credenziali di partenza**:
- **Username**: `admin`
- **Password**: `admin123` *(da cambiare in produzione!)*
- **Tenant**: `78c0ba61-2123-4e63-b1c8-d92e945fc260`

**Buon sviluppo! 🚀**