# Multi-stage Dockerfile for Cloud Run / Cloud Build deployment
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifest files
COPY package*.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# Copy source code
COPY . .

# Set environment variable for build
ENV NODE_ENV=production

# Build frontend and server bundle
RUN npm run build

# Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy package manifest files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev --legacy-peer-deps || npm install --omit=dev --legacy-peer-deps

# Copy built application assets and server bundle from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json

# Expose port (Cloud Run sets PORT env var automatically, default 8080)
EXPOSE 8080

# Start production server
CMD ["node", "dist/server.cjs"]
