FROM node:20-alpine

WORKDIR /app

COPY agent/package*.json ./
RUN npm install

COPY agent ./

CMD ["node", "server.mjs"]
