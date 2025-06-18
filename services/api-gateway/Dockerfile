FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN apk add --no-cache curl postgresql-client

RUN npm install

# Install global dev tools (opzionale)
RUN npm install -g nodemon pino-pretty

COPY . .

RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]