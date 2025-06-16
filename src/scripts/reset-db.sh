#!/bin/bash
# Script per resettare completamente il database e riapplicare le migrazioni

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Stampa intestazione
echo -e "${YELLOW}===========================================================${NC}"
echo -e "${YELLOW}          RESET COMPLETO DATABASE AUTOBE                   ${NC}"
echo -e "${YELLOW}===========================================================${NC}"
echo -e "${RED}ATTENZIONE: Questo script eliminerà TUTTI i dati del database!${NC}"
echo -e "${RED}            Assicurati di avere un backup se necessario.      ${NC}"
echo -e "${YELLOW}===========================================================${NC}"

# Richiedi conferma
read -p "Sei sicuro di voler procedere? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo -e "${GREEN}Operazione annullata.${NC}"
    exit 0
fi

echo -e "${YELLOW}Inizia il reset del database...${NC}"

# 1. Termina tutte le connessioni al database
echo -e "${YELLOW}Terminazione delle connessioni attive...${NC}"
docker compose exec postgres psql -U autobeuser -d postgres -c "
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = 'autobe'
  AND pid <> pg_backend_pid();
"

# 2. Elimina il database (questo comando non può essere in una transazione)
echo -e "${YELLOW}Eliminazione del database...${NC}"
docker compose exec postgres psql -U autobeuser -d postgres -c "DROP DATABASE IF EXISTS autobe;"

# Verifica se il comando ha avuto successo
if [ $? -ne 0 ]; then
    echo -e "${RED}Errore durante l'eliminazione del database.${NC}"
    exit 1
fi

# 3. Crea il database
echo -e "${YELLOW}Creazione del nuovo database...${NC}"
docker compose exec postgres psql -U autobeuser -d postgres -c "CREATE DATABASE autobe WITH TEMPLATE = template0 ENCODING = 'UTF8';"

# Verifica se il comando ha avuto successo
if [ $? -ne 0 ]; then
    echo -e "${RED}Errore durante la creazione del database.${NC}"
    exit 1
fi

# 4. Assegna i permessi
echo -e "${YELLOW}Assegnazione permessi...${NC}"
docker compose exec postgres psql -U autobeuser -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE autobe TO autobeuser;"

echo -e "${GREEN}Database ricreato con successo.${NC}"

# 5. Installa l'estensione uuid-ossp
echo -e "${YELLOW}Installazione estensione uuid-ossp...${NC}"
docker compose exec postgres psql -U autobeuser -d autobe -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"

# Verifica se il comando ha avuto successo
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Avviso: Non è stato possibile installare l'estensione uuid-ossp.${NC}"
    echo -e "${YELLOW}Tentativo di installazione dell'estensione pgcrypto...${NC}"
    docker compose exec postgres psql -U autobeuser -d autobe -c "CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";"
    
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}Avviso: Non è stato possibile installare pgcrypto.${NC}"
        echo -e "${YELLOW}Utilizzeremo gen_random_uuid() nativo di PostgreSQL se disponibile.${NC}"
    else
        echo -e "${GREEN}Estensione pgcrypto installata con successo.${NC}"
    fi
else
    echo -e "${GREEN}Estensione uuid-ossp installata con successo.${NC}"
fi

# 6. Applicazione di tutte le migrazioni
echo -e "${YELLOW}Applicazione di tutte le migrazioni...${NC}"
docker compose exec api npx sequelize-cli db:migrate

# Verifica se il comando ha avuto successo
if [ $? -ne 0 ]; then
    echo -e "${RED}Errore durante l'applicazione delle migrazioni.${NC}"
    exit 1
fi

echo -e "${GREEN}Migrazioni applicate con successo.${NC}"

# 7. Chiedi all'utente se vuole eseguire i seeder
echo -e "${YELLOW}===========================================================${NC}"
echo -e "${YELLOW}Vuoi eseguire anche tutti i seeder? (y/n)${NC}"
read -p "" -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo -e "${YELLOW}Esecuzione di tutti i seeder...${NC}"
    docker compose exec api npx sequelize-cli db:seed:all
    
    # Verifica se il comando ha avuto successo
    if [ $? -ne 0 ]; then
        echo -e "${RED}Errore durante l'esecuzione dei seeder.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Seeder eseguiti con successo.${NC}"
else
    echo -e "${YELLOW}Seeder non eseguiti.${NC}"
fi

echo -e "${YELLOW}===========================================================${NC}"
echo -e "${GREEN}Reset database completato con successo!${NC}"
echo -e "${YELLOW}===========================================================${NC}"

exit 0