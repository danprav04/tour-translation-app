FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 27495
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://localhost:27495/health || exit 1
CMD ["node", "index.js"]
