FROM node:22-alpine

WORKDIR /app

# Dependencies first, so this layer is cached until package*.json changes
COPY package*.json ./
RUN npm ci

# Source code, then compile TypeScript to dist/
COPY . .
RUN npm run build

EXPOSE 3001
CMD ["node", "dist/index.js"]
