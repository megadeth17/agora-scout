FROM node:20-alpine

WORKDIR /app

# Install deps first (layer cache)
COPY package.json ./
RUN npm install --omit=dev

# Copy source
COPY server.mjs pay-agent.mjs ./

EXPOSE 3402

CMD ["node", "server.mjs"]
