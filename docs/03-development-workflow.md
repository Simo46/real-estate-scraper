# Real Estate Scraper - Development Workflow

## 🚀 Quick Reference

**Git Flow Commands:**
```bash
# Feature development
git flow feature start feature-name
git flow feature finish feature-name

# Release preparation  
git flow release start v1.0.0
git flow release finish v1.0.0

# Emergency fixes
git flow hotfix start hotfix-name
git flow hotfix finish hotfix-name
```

**Branch Structure:**
- `main` - Codice di produzione (production-ready)
- `develop` - Integrazione sviluppo (latest features)
- `feature/*` - Nuove funzionalità 
- `release/*` - Preparazione release
- `hotfix/*` - Fix urgenti per produzione

**Current Workflow:**
- ✅ **Git Flow** per branching strategy
- ✅ **Docker** per ambiente sviluppo consistente
- ⏳ **Code Review** processo da definire
- ⏳ **Testing** strategy da implementare
- ⏳ **CI/CD** pipeline futura

**Development Setup:**
```bash
git clone <repository>
cd real-estate-scraper
./scripts/dev-setup.sh  # Ambiente pronto in un comando
```

---

## 📋 Git Flow Workflow

### Branching Strategy Implementata

Il progetto utilizza **Git Flow** come strategia di branching per gestire il ciclo di vita del codice in modo strutturato e prevedibile.

#### Branch Principali

**`main` Branch**
- Contiene il codice di **produzione**
- Sempre in stato deployable
- Ogni commit è una release taggata
- Protected branch (richiede PR per modifiche)

**`develop` Branch**  
- Branch di **integrazione** per lo sviluppo
- Contiene le ultime funzionalità completate
- Base per nuove feature branch
- Merge point per feature completate

#### Branch Temporanei

**`feature/*` Branches**
- Per sviluppo di **nuove funzionalità**
- Branching da `develop`
- Naming convention: `feature/auth-system`, `feature/nlp-integration`
- Merge su `develop` quando completate

**`release/*` Branches**
- Per **preparazione release**
- Branching da `develop` quando feature set è completo
- Solo bug fixes e finalizzazione
- Merge su `main` e `develop`

**`hotfix/*` Branches**
- Per **fix urgenti** in produzione
- Branching da `main` per risolvere problemi critici
- Merge immediato su `main` e `develop`
- Bypassa il normale ciclo di sviluppo

---

## 🔧 Development Process

### 1. Setup Ambiente di Sviluppo

**Prima configurazione:**
```bash
# Clone repository
git clone <repository-url>
cd real-estate-scraper

# Installa git-flow (se necessario)
# macOS: brew install git-flow
# Ubuntu: sudo apt-get install git-flow

# Inizializza git-flow (prima volta)
git flow init
# Accetta defaults: main, develop, feature/, release/, hotfix/, v

# Setup ambiente
./scripts/dev-setup.sh
```

**Verifica configurazione:**
```bash
# Controlla branch attuale
git branch -a

# Verifica servizi attivi
docker compose ps

# Test API
curl http://localhost:3000/api/health
```

### 2. Sviluppo Feature

**Iniziare nuova feature:**
```bash
# Assicurati di essere su develop
git checkout develop
git pull origin develop

# Crea nuova feature branch
git flow feature start <feature-name>
# Esempio: git flow feature start user-management

# Ora sei su feature/user-management
```

**Durante lo sviluppo:**
```bash
# Sviluppa normalmente con commit frequenti
git add .
git commit -m "feat: add user authentication middleware"

# Push per backup (opzionale)
git push origin feature/<feature-name>
```

**Completare feature:**
```bash
# Finalizza feature
git flow feature finish <feature-name>

# Questo fa automaticamente:
# 1. Merge feature branch in develop
# 2. Cancella feature branch locale
# 3. Switch a develop branch
```

### 3. Processo Release

**Preparare release:**
```bash
# Da develop branch, quando feature set è completo
git checkout develop
git pull origin develop

# Crea release branch
git flow release start v1.0.0
```

**Durante release preparation:**
```bash
# Solo bug fixes e preparazione
# - Update version numbers
# - Update documentation  
# - Final testing
# - Bug fixes only (no new features)

git add .
git commit -m "chore: prepare v1.0.0 release"
```

**Finalizzare release:**
```bash
# Completa release
git flow release finish v1.0.0

# Questo fa automaticamente:
# 1. Merge release in main
# 2. Tag release su main  
# 3. Merge release in develop
# 4. Cancella release branch
```

### 4. Hotfix Process

**Per fix urgenti:**
```bash
# Da main branch per fix critico
git checkout main
git pull origin main

# Crea hotfix branch
git flow hotfix start critical-fix

# Fix il problema
git add .
git commit -m "fix: resolve critical authentication bug"

# Finalizza hotfix
git flow hotfix finish critical-fix

# Questo fa automaticamente:
# 1. Merge hotfix in main
# 2. Tag hotfix su main
# 3. Merge hotfix in develop  
# 4. Cancella hotfix branch
```

---

## 📝 Commit Conventions

### Commit Message Format

Usiamo **Conventional Commits** per commit message consistenti:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types disponibili:**
- `feat:` - Nuova funzionalità
- `fix:` - Bug fix
- `docs:` - Solo documentazione
- `style:` - Formattazione (no logic changes)
- `refactor:` - Code refactoring
- `test:` - Aggiunta/modifica test
- `chore:` - Maintenance tasks

**Esempi:**
```bash
feat(auth): add JWT token refresh mechanism
fix(api): resolve user validation error
docs: update API documentation
refactor(database): optimize user query performance
chore: update dependencies to latest versions
```

### Branch Naming

**Feature branches:**
```
feature/auth-system
feature/nlp-integration  
feature/user-dashboard
feature/api-rate-limiting
```

**Release branches:**
```
release/v1.0.0
release/v1.1.0
release/v2.0.0
```

**Hotfix branches:**
```
hotfix/critical-auth-bug
hotfix/database-connection-fix
hotfix/security-patch
```

---

## 🔄 Integration Workflow

### Pull Request Process (Future)

**Quando implementeremo code review:**

1. **Feature completion** su feature branch
2. **Push branch** to remote repository
3. **Create Pull Request** da feature branch a develop
4. **Code review** da team member
5. **Address feedback** se necessario
6. **Approve & merge** quando pronto

### Continuous Integration (Future)

**Pipeline pianificata:**
```yaml
# Futuro: .github/workflows/ci.yml
on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop, main]

jobs:
  test:
    - Run unit tests
    - Run integration tests  
    - Check code quality
    - Build Docker images
    - Security scanning
```

---

## 🐳 Development Environment

### Docker Workflow

**Hot reload attivo:**
- Modifiche al codice si riflettono immediatamente
- No rebuild container per development
- Database preserva dati tra restart

**Comandi utili:**
```bash
# Restart singolo servizio
docker compose restart api-gateway

# Rebuild dopo dependency changes
docker compose up -d --build api-gateway

# View logs
docker compose logs -f api-gateway

# Clean restart
docker compose down && docker compose up -d
```

### Database Workflow

**Migrations:**
```bash
# Genera nuova migration
docker compose exec api-gateway npx sequelize-cli migration:generate --name add-new-feature

# Applica migrations
docker compose exec api-gateway npm run migrate

# Rollback ultima migration (se necessario)
docker compose exec api-gateway npx sequelize-cli db:migrate:undo
```

**Seeders:**
```bash
# Run base seeders (users, roles, etc.)
docker compose exec api-gateway npx sequelize-cli db:seed:all --seeders-path src/seeders/base

# Run dev seeders (sample data)
docker compose exec api-gateway npx sequelize-cli db:seed:all --seeders-path src/seeders/dev
```

---

## 🧪 Testing Strategy (Future Implementation)

### Livelli di Testing Pianificati

**Unit Tests:**
- Model validation e business logic
- Policy authorization rules
- Service layer functions
- Utility functions

**Integration Tests:**
- API endpoint functionality
- Database operations
- Service-to-service communication
- Authentication/authorization flow

**E2E Tests:**
- Complete user workflows
- Cross-service functionality
- UI interactions (quando frontend sarà pronto)

### Testing Commands (Future)

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- --grep "auth"

# Run in watch mode
npm run test:watch
```

---

## 📊 Code Quality (Future Implementation)

### Quality Gates Pianificate

**Static Analysis:**
- ESLint per code style consistency
- Prettier per formatting automatico
- SonarQube per code quality metrics
- Security scanning con tools dedicati

**Code Coverage:**
- Minimum 80% test coverage per new code
- Critical paths devono avere 95%+ coverage
- Exclusion di file boilerplate/config

**Performance:**
- API response time monitoring
- Database query optimization
- Memory usage tracking
- Bundle size monitoring (frontend)

---

## 🚀 Deployment Workflow (Future)

### Planned Deployment Strategy

**Environments:**
- **Development** - Feature branches, automatic deployment
- **Staging** - Develop branch, manual deployment
- **Production** - Main branch, manual deployment con approval

**Process:**
1. **Develop** → Auto deploy a staging per testing
2. **Release** → Manual deployment preview
3. **Main** → Production deployment con blue-green strategy

---

## 📋 Best Practices Attuali

### Code Organization

**Service Structure:**
```
services/api-gateway/src/
├── api/              # Controllers, routes, validators
├── middleware/       # Auth, permissions, utilities  
├── models/          # Database models
├── policies/        # Authorization policies
├── services/        # Business logic
└── utils/           # Helper functions
```

**File Naming:**
- `camelCase` per variabili e funzioni
- `PascalCase` per classi e modelli
- `kebab-case` per file names
- `UPPER_CASE` per costanti

### Documentation Standards

**API Documentation:**
- Ogni endpoint ha description chiara
- Request/response examples
- Error codes e handling
- Authentication requirements

**Code Comments:**
- JSDoc per funzioni pubbliche
- Inline comments per logica complessa
- TODO comments per future improvements
- FIXME per known issues

---

## 🎯 Workflow Evolution

### Current State
- ✅ Git Flow per structured branching
- ✅ Docker per consistent environment
- ✅ Automated setup script
- ✅ Hot reload per development speed

### Next Steps (Priority Order)
1. **Code Review Process** - Define PR templates e review guidelines
2. **Testing Framework** - Setup Jest + testing utilities
3. **CI Pipeline** - Automated testing su PR
4. **Code Quality Tools** - ESLint, Prettier, coverage
5. **Deployment Automation** - CD pipeline per staging

### Future Considerations
- **Feature Flags** per controlled rollouts
- **A/B Testing** framework integration
- **Performance Monitoring** con APM tools
- **Error Tracking** con Sentry o simili

---

## 🔧 Troubleshooting Development

### Common Issues

**Git Flow Problems:**
```bash
# Se git flow non inizializzato
git flow init -d  # Use defaults

# Se feature branch esiste già
git flow feature start feature-name  # Errore
git checkout feature/feature-name    # Switch manualmente

# Se merge conflicts durante finish
# Risolvi conflicts manualmente, poi:
git add .
git commit
git flow feature finish feature-name
```

**Docker Issues:**
```bash
# Container non si avvia
docker compose logs api-gateway

# Database connection failed  
docker compose restart postgres
docker compose exec api-gateway npm run migrate

# Port già in uso
# Modifica porte in .env o ferma processo conflittuale
```

**Database Problems:**
```bash
# Migration failed
docker compose exec api-gateway npx sequelize-cli db:migrate:undo
# Fix migration file
docker compose exec api-gateway npm run migrate

# Corrupted development database  
docker compose down
docker volume rm real_estate_postgres_data
docker compose up -d
```

---

## 📚 Resources

### Documentation
- **API Documentation**: Vedi `services/api-gateway/docs/`
- **Architecture**: `docs/01-architecture-overview.md`
- **Setup Guide**: `docs/00-onboarding-guide.md`

### Tools Setup
- **Git Flow**: [nvie.com/git-model](https://nvie.com/posts/a-successful-git-branching-model/)
- **Docker**: Configurato in `docker-compose.yaml`
- **Conventional Commits**: [conventionalcommits.org](https://www.conventionalcommits.org/)

### Future Learning
- **Testing**: Jest documentation
- **CI/CD**: GitHub Actions workflow examples  
- **Code Quality**: ESLint + Prettier setup guides

---

**Il workflow è progettato per crescere con il team e il progetto, mantenendo semplicità oggi con flessibilità per il futuro. 🚀**