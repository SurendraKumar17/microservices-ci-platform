FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY *.js ./
COPY public ./public

EXPOSE 3000

CMD ["node", "app.js"]