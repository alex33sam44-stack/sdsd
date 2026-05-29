# ---------- Stage 1: build ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Install build deps for argon2 (native module)
RUN apk add --no-cache python3 make g++ openssl

COPY package*.json ./
COPY prisma ./prisma
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json nest-cli.json ./
COPY src ./src
COPY scripts ./scripts

RUN npx prisma generate
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl tini

ENV NODE_ENV=production
ENV PORT=4000

COPY package*.json ./
COPY prisma ./prisma
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi && npx prisma generate

# Bring compiled output + scripts (for one-shot migrations)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
# Production boot applies committed Prisma migrations only.
# Missing migrations fail fast instead of silently syncing schema.
CMD ["sh", "-c", "test -d prisma/migrations && test -n \"$(ls -A prisma/migrations 2>/dev/null)\" && npx prisma migrate deploy && node dist/main.js"]
