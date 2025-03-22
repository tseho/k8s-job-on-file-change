FROM node:23-alpine

WORKDIR /srv/app

COPY package.json package-lock.json ./
COPY src src

RUN npm install --omit dev

CMD ["node", "src/index.ts"]
