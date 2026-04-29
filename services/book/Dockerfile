FROM node:20-alpine

WORKDIR /app

# Upgrades zlib to 1.3.2-r0, fixing CVE-2026-22184
RUN apk update && apk upgrade --no-cache

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

EXPOSE 3001

USER node

CMD ["node", "app.js"]