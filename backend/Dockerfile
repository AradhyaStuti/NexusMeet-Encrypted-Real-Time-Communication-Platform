# ── Build stage: install deps (including native mediasoup build) ──
FROM node:20-slim AS deps

# mediasoup requires Python + build tools to compile C++ worker
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Runtime stage ──
FROM node:20-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Expose HTTP API + Socket.IO port
EXPOSE 8000

# Expose mediasoup RTC UDP/TCP port range (configured in src/sfu/config.js)
EXPOSE 10000-10100/udp
EXPOSE 10000-10100/tcp

ENV NODE_ENV=production

CMD ["node", "src/app.js"]
