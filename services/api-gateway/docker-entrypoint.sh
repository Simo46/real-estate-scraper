#!/bin/sh
set -e

# Carica variabili d'ambiente
. /app/.env || true

# Parametri DB
DB_HOST=${DB_HOST:-postgres}
DB_PORT=${DB_PORT:-5432}
DB_DATABASE=${DB_DATABASE:-real_estate}
DB_USERNAME=${DB_USERNAME:-app_user}
DB_PASSWORD=${DB_PASSWORD:-app_password}
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-secret}

# Attendi che Postgres sia pronto
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER"; do
  echo "[api-gateway] Waiting for postgres..."
  sleep 2
done

# Controlla se il database esiste, altrimenti crealo
DB_EXIST=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U "$POSTGRES_USER" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_DATABASE'")
if [ "$DB_EXIST" != "1" ]; then
  echo "[api-gateway] Creating database $DB_DATABASE..."
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U "$POSTGRES_USER" -c "CREATE DATABASE $DB_DATABASE;"
else
  echo "[api-gateway] Database $DB_DATABASE already exists."
fi

# Controlla se l'utente esiste, altrimenti crealo
USER_EXIST=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U "$POSTGRES_USER" -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USERNAME'")
if [ "$USER_EXIST" != "1" ]; then
  echo "[api-gateway] Creating user $DB_USERNAME..."
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U "$POSTGRES_USER" -c "CREATE USER $DB_USERNAME WITH PASSWORD '$DB_PASSWORD';"
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U "$POSTGRES_USER" -c "GRANT ALL PRIVILEGES ON DATABASE $DB_DATABASE TO $DB_USERNAME;"
else
  echo "[api-gateway] User $DB_USERNAME already exists."
fi

# Garantisce i permessi sullo schema public
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U "$POSTGRES_USER" -d "$DB_DATABASE" -c "GRANT ALL ON SCHEMA public TO $DB_USERNAME;"
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -U "$POSTGRES_USER" -d "$DB_DATABASE" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USERNAME;"

# Esegui le migration solo se mancano tabelle utente
TABLES=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USERNAME" -d "$DB_DATABASE" -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public' LIMIT 1;")
if [ -z "$TABLES" ]; then
  echo "[api-gateway] Running migrations..."
  npx sequelize-cli db:migrate
  npx sequelize-cli db:seed:all || true
else
  echo "[api-gateway] Tables already exist, skipping migrations."
fi

# Avvia il servizio Node.js
exec "$@"
