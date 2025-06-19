#!/bin/bash
# Script di setup per ambiente di sviluppo Real Estate Scraper

set -e

# Colori per output (invariati)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Setting up Real Estate Scraper development environment...${NC}"

# Check dependencies 
echo -e "${YELLOW}📋 Checking dependencies...${NC}"

command -v docker >/dev/null 2>&1 || { 
  echo -e "${RED}❌ Docker is required but not installed. Please install Docker first.${NC}" >&2
  exit 1
}

echo -e "${GREEN}✅ Dependencies check passed${NC}"

# ================================================================
# Setup ROOT environment file invece del service-specific
# ================================================================

# Setup ROOT environment file (Single Source of Truth)
if [ ! -f .env ]; then
  echo -e "${YELLOW}📝 Creating ROOT .env file from template...${NC}"
  if [ -f .env.example ]; then
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit ROOT .env file with your configuration if needed${NC}"
  else
    echo -e "${RED}❌ .env.example not found in root directory${NC}"
    echo -e "${YELLOW}You can create it manually or copy from the artifacts provided${NC}"
    exit 1
  fi
else
  echo -e "${GREEN}✅ ROOT .env file already exists${NC}"
fi

# Check if user has old service-specific .env files (NUOVO)
if [ -f services/api-gateway/.env ]; then
  echo -e "${YELLOW}⚠️  Found old service-specific .env file${NC}"
  echo -e "${YELLOW}   With the new setup, all environment variables come from ROOT .env${NC}"
  echo -e "${YELLOW}   The service .env file is no longer needed for Docker Compose${NC}"
  echo -e "${YELLOW}   Do you want to remove services/api-gateway/.env? (y/N)${NC}"
  read -p "" -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm services/api-gateway/.env
    echo -e "${GREEN}✅ Removed old service .env file${NC}"
  else
    echo -e "${YELLOW}⚠️  Warning: Having both root and service .env files may cause confusion${NC}"
  fi
fi

# Build and start services 
echo -e "${YELLOW}🐳 Building and starting Docker services...${NC}"
docker compose up -d --build

# Wait until a container becomes healthy 
wait_for_healthy() {
  local container_name=$1
  local timeout_seconds=$2
  local waited=0

  echo -e "${YELLOW}⏳ Waiting for ${container_name} to become healthy...${NC}"
  while [[ $(docker inspect --format='{{json .State.Health.Status}}' "$container_name") != "\"healthy\"" ]]; do
    sleep 2
    waited=$((waited + 2))
    if [ "$waited" -ge "$timeout_seconds" ]; then
      echo -e "${RED}❌ ${container_name} failed to become healthy within ${timeout_seconds} seconds${NC}"
      docker compose logs "$container_name"
      exit 1
    fi
  done

  echo -e "${GREEN}✅ ${container_name} is healthy${NC}"
}

# Get Containers IDs 
POSTGRES_CONTAINER=$(docker compose ps -q postgres)
API_CONTAINER=$(docker compose ps -q api-gateway)

# Wait for PostgreSQL to be ready 
wait_for_healthy "$POSTGRES_CONTAINER" 60
echo -e "${GREEN}✅ Postgres is ready${NC}"

# Wait for API Gateway to be ready 
wait_for_healthy "$API_CONTAINER" 60
echo -e "${GREEN}✅ API Gateway is ready${NC}"

# Check seeders 
if docker compose logs --no-color --since 30s api-gateway | grep -q "\[api-gateway\] ❌ Base seeders failed"; then
  echo -e "${RED}⚠️  Warning: Base seeders failed. Check api-gateway logs for details.${NC}"
else
  echo -e "${GREEN}✅ Base seeders completed successfully${NC}"
  # Ask about dev seeders
  echo -e "${YELLOW}🌱 Do you want to run database DEV seeders? (y/n)${NC}"
  read -p "" -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
      echo -e "${YELLOW}🌱 Running database seeders...${NC}"
      docker compose exec api-gateway npx sequelize-cli db:seed:all --seeders-path src/seeders/dev
      
      if [ $? -ne 0 ]; then
          echo -e "${RED}❌ Database seeders failed${NC}"
      else
          echo -e "${GREEN}✅ Database seeders completed${NC}"
      fi
  fi
fi

# ================================================================
# Summary finale con porte dinamiche dal ROOT .env
# ================================================================

echo -e "${BLUE}===========================================================${NC}"
echo -e "${GREEN}✅ Setup completed successfully!${NC}"
echo -e "${BLUE}===========================================================${NC}"
echo -e "${YELLOW}🌐 Services available:${NC}"

# Leggi le porte dal ROOT .env invece di usare valori hardcoded
API_PORT=$(grep "^API_PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo '3000')
POSTGRES_PORT=$(grep "^POSTGRES_PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo '5444')
MONGO_PORT=$(grep "^MONGO_PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo '27018')
REDIS_PORT=$(grep "^REDIS_PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo '6389')
OLLAMA_PORT=$(grep "^OLLAMA_PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo '11434')

echo -e "${YELLOW}   - API Gateway: http://localhost:${API_PORT}${NC}"
echo -e "${YELLOW}   - PostgreSQL: localhost:${POSTGRES_PORT}${NC}"
echo -e "${YELLOW}   - MongoDB: localhost:${MONGO_PORT}${NC}"
echo -e "${YELLOW}   - Redis: localhost:${REDIS_PORT}${NC}"
echo -e "${YELLOW}   - Ollama: localhost:${OLLAMA_PORT}${NC}"
echo -e ""
echo -e "${YELLOW}🔧 Useful commands:${NC}"
echo -e "${YELLOW}   - View logs: docker compose logs -f${NC}"
echo -e "${YELLOW}   - Stop services: docker compose down${NC}"
echo -e "${YELLOW}   - Edit config: nano .env${NC}"
echo -e ""
echo -e "${BLUE}📝 Environment Configuration:${NC}"
echo -e "${YELLOW}   - All settings: ROOT .env file${NC}"
echo -e "${YELLOW}   - Service-specific .env files are no longer needed for Docker${NC}"
echo -e "${BLUE}===========================================================${NC}"