#!/bin/sh
set -e

# Colori per logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}[api-gateway] ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}[api-gateway] ✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}[api-gateway] ⚠️  $1${NC}"; }
log_error() { echo -e "${RED}[api-gateway] ❌ $1${NC}" >&2; }

# ================================================================
# Environment Variables Setup
# ================================================================
# Tutte le variabili ora arrivano da Docker Compose environment injection

# Database parameters con fallback sicuri
DB_HOST=${DB_HOST:-postgres}
DB_PORT=${DB_PORT:-5432}
DB_DATABASE=${DB_DATABASE:-real_estate}
DB_USERNAME=${DB_USERNAME:-app_user}
DB_PASSWORD=${DB_PASSWORD:-app_password}
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-secret}

log_info "Environment variables loaded from Docker Compose"
log_info "Database: ${DB_HOST}:${DB_PORT}/${DB_DATABASE}"
log_info "Node Environment: ${NODE_ENV:-development}"

# ================================================================
# Database Setup (ONLY PostgreSQL - what we actually need)
# ================================================================

# Attendi che Postgres sia pronto con retry intelligente
log_info "Waiting for PostgreSQL on $DB_HOST:$DB_PORT..."
retry_count=0
max_retries=30

until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER"; do
  retry_count=$((retry_count + 1))
  if [ $retry_count -ge $max_retries ]; then
    log_error "PostgreSQL non raggiungibile dopo $max_retries tentativi"
    exit 1
  fi
  log_info "Tentativo $retry_count/$max_retries..."
  sleep 2
done

log_success "PostgreSQL raggiungibile"

# Controlla se il database esiste, altrimenti crealo
log_info "Controllo database $DB_DATABASE..."
DB_EXIST=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U "$POSTGRES_USER" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_DATABASE'")
if [ "$DB_EXIST" != "1" ]; then
  log_info "Creazione database $DB_DATABASE..."
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U "$POSTGRES_USER" -c "CREATE DATABASE $DB_DATABASE;"
  log_success "Database $DB_DATABASE creato"
else
  log_success "Database $DB_DATABASE già esistente"
fi

# Controlla se l'utente esiste, altrimenti crealo
log_info "Controllo utente $DB_USERNAME..."
USER_EXIST=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U "$POSTGRES_USER" -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USERNAME'")
if [ "$USER_EXIST" != "1" ]; then
  log_info "Creazione utente $DB_USERNAME..."
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U "$POSTGRES_USER" -c "CREATE USER $DB_USERNAME WITH PASSWORD '$DB_PASSWORD';"
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U "$POSTGRES_USER" -c "GRANT ALL PRIVILEGES ON DATABASE $DB_DATABASE TO $DB_USERNAME;"
  log_success "Utente $DB_USERNAME creato"
else
  log_success "Utente $DB_USERNAME già esistente"
fi

# Garantisce i permessi sullo schema public
log_info "Aggiornamento permessi..."
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U "$POSTGRES_USER" -d "$DB_DATABASE" -c "GRANT ALL ON SCHEMA public TO $DB_USERNAME;"
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U "$POSTGRES_USER" -d "$DB_DATABASE" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USERNAME;"

# Verifica connessione applicazione
log_info "Test connessione applicazione..."
if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USERNAME" -d "$DB_DATABASE" \
   -c "SELECT version();" >/dev/null 2>&1; then
    log_success "Connessione applicazione funzionante"
else
    log_error "Connessione applicazione fallita"
    exit 1
fi

# ================================================================
# Migrations and Seeders
# ================================================================

# Esegui le migration solo se mancano tabelle utente
log_info "Controllo migrations..."
TABLES=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USERNAME" -d "$DB_DATABASE" -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public' LIMIT 1;")
if [ -z "$TABLES" ]; then
  log_info "Esecuzione migrations..."
  npx sequelize-cli db:migrate
  if ! npx sequelize-cli db:seed:all --seeders-path src/seeders/base; then
    log_error "Base seeders failed"
  else
    log_success "Base seeders completati"
  fi
else
  log_success "Tabelle già esistenti, skip migrations"
  if ! npx sequelize-cli db:seed:all --seeders-path src/seeders/base; then
    log_error "Base seeders failed"
  else
    log_success "Base seeders completati"
  fi
fi

# ================================================================
# Optional: Log External Service URLs (no health check)
# ================================================================
# Solo logging delle configurazioni - non facciamo health check
# perché non abbiamo i client installati e Docker Compose 
# gestisce già le dipendenze con depends_on

if [ -n "$REDIS_URL" ]; then
    log_info "Redis configurato: $REDIS_URL"
fi

if [ -n "$MONGO_URL" ]; then
    log_info "MongoDB configurato: $MONGO_URL"
fi

if [ -n "$OLLAMA_URL" ]; then
    log_info "Ollama configurato: $OLLAMA_URL"
fi

log_success "Setup completato, avvio applicazione..."

# Avvia il servizio Node.js
exec "$@"