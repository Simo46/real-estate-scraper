-- Connettiti al database real_estate
\c real_estate;

-- Estensioni utili per il progetto
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";          -- Per UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";            -- Per similarity search
CREATE EXTENSION IF NOT EXISTS "unaccent";           -- Per ricerche senza accenti
CREATE EXTENSION IF NOT EXISTS "postgis";            -- Per geospatial data (opzionale)
CREATE EXTENSION IF NOT EXISTS "btree_gin";          -- Per indexing avanzato
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- Per performance monitoring