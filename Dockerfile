# Multi-stage build for production
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Remove dev dependencies
RUN npm prune --production

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install timezone data
RUN apk add --no-cache tzdata
ENV TZ=Asia/Dhaka

# Copy from builder
COPY --from=builder /app /app
COPY --from=builder /etc/passwd /etc/passwd

# Set permissions
RUN chown -R nodejs:nodejs /app
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-5000}/health', (r) => {if(r.statusCode !== 200) throw new Error()})"

EXPOSE 5000

CMD ["node", "src/server.js"]