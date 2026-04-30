FROM node:20-alpine

WORKDIR /app

RUN apk update && apk upgrade --no-cache

# Upgrade npm to get patched bundled dependencies
RUN npm install -g npm@latest

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

EXPOSE 3001
USER node
CMD ["node", "app.js"]