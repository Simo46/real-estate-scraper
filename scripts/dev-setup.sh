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
if [ ! -f .env ]; then
  echo -e "${YELLOW}📝 Creating .env file from template...${NC}"
  cp .env.example .env
  echo -e "${YELLOW}⚠️  Please edit .env file with your configuration if needed${NC}"
else
  echo -e "${GREEN}✅ .env file already exists${NC}"
fi

# Build and start services
echo -e "${YELLOW}🐳 Building and starting Docker services...${NC}"
docker compose up -d --build

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}⏳ Waiting for PostgreSQL to be ready...${NC}"
timeout 90 bash -c 'until docker compose exec postgres pg_isready -U postgres -d real_estate; do sleep 2; done'

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ PostgreSQL failed to start within 90 seconds${NC}"
    exit 1
fi

echo -e "${GREEN}✅ PostgreSQL is ready${NC}"

# Wait for API Gateway to be ready
echo -e "${YELLOW}⏳ Waiting for API Gateway to be ready...${NC}"
timeout 60 bash -c 'until curl -f http://localhost:3000/health >/dev/null 2>&1; do sleep 2; done'

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ API Gateway failed to start within 60 seconds${NC}"
    echo -e "${YELLOW}📋 Checking logs...${NC}"
    docker compose logs api-gateway
    exit 1
fi

echo -e "${GREEN}✅ API Gateway is ready${NC}"

# Run migrations
echo -e "${YELLOW}🔄 Running database migrations...${NC}"
docker compose exec api-gateway npx sequelize-cli db:migrate

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Database migrations failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Database migrations completed${NC}"

# Ask about seeders
echo -e "${YELLOW}🌱 Do you want to run database seeders? (y/n)${NC}"
read -p "" -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}🌱 Running database seeders...${NC}"
    docker compose exec api-gateway npx sequelize-cli db:seed:all
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Database seeders failed${NC}"
    else
        echo -e "${GREEN}✅ Database seeders completed${NC}"
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