# Dockerfile semplice ma ottimizzato per layer caching
FROM node:22-alpine

WORKDIR /app

# Layer 1: System dependencies (cached fino a quando non cambia Dockerfile)
RUN apk add --no-cache curl postgresql-client

# Layer 2: NPM dependencies (cached fino a quando non cambia package.json)
COPY package*.json ./
RUN npm install
# RUN npm ci --only=production

# Layer 3: Global dev tools (opzionale, solo per development)
RUN if [ "$NODE_ENV" != "production" ]; then \
        npm install -g nodemon pino-pretty; \
    fi

# Layer 4: Application code (cambia spesso, quindi alla fine)
COPY . .

# Setup
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]