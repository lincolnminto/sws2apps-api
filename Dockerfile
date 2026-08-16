# ── Base: install all dependencies ────────────────────────────────────────────
FROM node:24-bookworm-slim AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── Development: hot-reload via nodemon + tsx ─────────────────────────────────
FROM base AS development
ENV NODE_ENV=development
COPY tsconfig*.json nodemon.json ./
COPY src ./src
EXPOSE 8000
CMD ["npm", "run", "dev"]

# ── Builder: compile TypeScript ───────────────────────────────────────────────
FROM base AS builder
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# ── Production: lean image, compiled JS only ──────────────────────────────────
FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm ci --omit=dev
EXPOSE 8000
CMD ["node", "dist/index.js"]
