# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package.json turbo.json ./

# Copy app package.json
COPY apps/echo-ui/package.json ./apps/echo-ui/

# Install turbo globally
RUN npm install -g turbo

# Install dependencies (using npm since we're in Docker)
RUN npm install

# Copy all source files
COPY apps/echo-ui ./apps/echo-ui
COPY packages ./packages

# Build the Next.js application
WORKDIR /app/apps/echo-ui
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package.json first
COPY --from=builder /app/apps/echo-ui/package.json ./package.json

# Install production dependencies only
RUN npm install --omit=dev --no-audit --no-fund

# Copy built application and config files
COPY --from=builder /app/apps/echo-ui/.next ./.next
COPY --from=builder /app/apps/echo-ui/public ./public
COPY --from=builder /app/apps/echo-ui/next.config.ts ./next.config.ts
COPY --from=builder /app/apps/echo-ui/tsconfig.json ./tsconfig.json
COPY --from=builder /app/apps/echo-ui/postcss.config.mjs ./postcss.config.mjs
COPY --from=builder /app/apps/echo-ui/eslint.config.mjs ./eslint.config.mjs

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Change ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node_modules/.bin/next", "start"]

