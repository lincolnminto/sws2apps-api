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

# ── Production: lean image, compiled JS + runtime assets ──────────────────────
FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm ci --omit=dev
# Static assets read at runtime relative to /app that `tsc` does NOT emit into
# dist/. Missing these makes the container exit(1) before it can listen:
#   • locales/         → i18n_config.ts reads ../../../locales/<lang>/main.json
#   • public/          → express.static('public') + serve-favicon
#   • src/v3/views/    → nodemailer-express-handlebars email templates
COPY locales ./locales
COPY public ./public
COPY src/v3/views ./src/v3/views
EXPOSE 8000
CMD ["node", "dist/index.js"]
