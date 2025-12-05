FROM node:25-alpine3.21 AS dependencies
WORKDIR /app

# Install only production dependencies with lockfile fidelity
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:25-alpine3.21 AS openapi
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY scripts/openapi/ ./scripts/openapi/
COPY src/server/routes ./src/server/routes
RUN npm run openapi:build

FROM node:25-alpine3.21 AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

COPY --from=dependencies /app/node_modules ./node_modules
COPY src/server/ .
COPY --from=openapi /app/docs/openapi/dist ./openapi




# # Prepare data directories (can be mounted as volumes) and ensure ownership
# RUN mkdir -p /app/data/cards /app/data/api \
#     && chown -R app:app /app/data

# COPY --from=deps /app/node_modules ./node_modules
# COPY src/ .
# RUN mkdir -p /app/openapi/paths /app/openapi/dist && chown -R app:app /app/openapi

# EXPOSE 3000

# HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q --spider http://127.0.0.1:3000/health || exit 1

# USER app

# CMD ["npm", "start"]
