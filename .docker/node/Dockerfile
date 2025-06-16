FROM node:22-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Install global development tools
RUN npm install -g nodemon pino-pretty

# Bundle app source
COPY . .

# Expose port
EXPOSE 3000

# Run the app
CMD ["npm", "run", "dev"]