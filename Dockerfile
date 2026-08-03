FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
COPY core ./core
COPY mcp ./mcp
COPY ui ./ui
COPY scripts ./scripts
COPY corpus.json serve.js ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "serve.js"]
