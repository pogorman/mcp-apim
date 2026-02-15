# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# --- Runtime stage ---
FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

ENV MCP_TRANSPORT=http
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/index.js"]
