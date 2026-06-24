FROM node:22-slim

# Install OpenSSL (required by Prisma at runtime)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN groupadd -r worker && useradd -r -g worker worker

WORKDIR /app

# 1. Copy package files first (layer caching — only reinstalls when deps change)
COPY worker/package.json worker/package-lock.json ./worker/
COPY web/prisma/schema.prisma ./web/prisma/schema.prisma

# 2. Install dependencies (cached unless package*.json changes)
WORKDIR /app/worker
RUN npm ci --omit=dev

# 3. Generate Prisma client
RUN npx prisma generate --schema=../web/prisma/schema.prisma

# 4. Copy source code last (changes most often, doesn't bust dep cache)
COPY worker/src ./src

# Switch to non-root user
USER worker

# tsx is now a dependency — no more npx download on every boot
CMD ["node", "--import", "tsx", "src/index.ts"]
