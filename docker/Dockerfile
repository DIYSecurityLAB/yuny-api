FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production && npm cache clean --force

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]