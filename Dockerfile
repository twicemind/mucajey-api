FROM node:20-alpine AS deps
WORKDIR /app

# Install only production dependencies with lockfile fidelity
COPY src/package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    API_KEY=mucajey-dev-key-2024

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

# Prepare data directories (can be mounted as volumes) and ensure ownership
RUN mkdir -p /app/data/cards /app/data/api \
    && chown -R app:app /app/data

COPY --from=deps /app/node_modules ./node_modules
COPY src/ .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q --spider http://127.0.0.1:3000/health || exit 1

USER app

CMD ["node", "server.js"]
