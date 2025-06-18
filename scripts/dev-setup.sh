#!/bin/bash
# Script di setup per ambiente di sviluppo Real Estate Scraper

set -e

# Colori per output
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

# Setup environment file
if [ ! -f services/api-gateway/.env ]; then
  echo -e "${YELLOW}📝 Creating .env file from template...${NC}"
  cp services/api-gateway/.env.example services/api-gateway/.env
  echo -e "${YELLOW}⚠️  Please edit .env file with your configuration if needed${NC}"
else
  echo -e "${GREEN}✅ .env file already exists${NC}"
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


echo -e "${BLUE}===========================================================${NC}"
echo -e "${GREEN}✅ Setup completed successfully!${NC}"
echo -e "${BLUE}===========================================================${NC}"
echo -e "${YELLOW}🌐 Services available:${NC}"
echo -e "${YELLOW}   - API Gateway: http://localhost:3000${NC}"
echo -e "${YELLOW}   - Nginx Proxy: http://localhost:80${NC}"
echo -e "${YELLOW}   - PostgreSQL: localhost:5444${NC}"
echo -e ""
echo -e "${YELLOW}🔧 Useful commands:${NC}"
echo -e "${YELLOW}   - View logs: docker compose logs -f${NC}"
echo -e "${YELLOW}   - Stop services: docker compose down${NC}"
echo -e "${YELLOW}   - Reset database: ./services/api-gateway/src/scripts/reset-db.sh${NC}"
echo -e "${BLUE}===========================================================${NC}"