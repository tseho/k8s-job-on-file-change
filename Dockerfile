FROM node:23-alpine

WORKDIR /srv/app

COPY package.json package-lock.json ./
RUN npm install --omit dev
COPY src src

CMD ["node", "src/index.ts"]
