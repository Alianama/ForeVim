# ==============================================================================
# Stage 1: Build Frontend (Next.js standalone)
# ==============================================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm config set registry https://registry.npmmirror.com && \
    npm install --legacy-peer-deps
COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# ==============================================================================
# Stage 2: Final Run Image (Python + Node.js + Nginx)
# ==============================================================================
FROM python:3.12-slim AS runner

WORKDIR /app

# Install system dependencies, curl, Node.js, and Nginx
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl gnupg nginx \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy Backend code
COPY backend/ ./backend/

# Copy Frontend compiled assets (standalone Next.js runner)
COPY --from=frontend-builder /app/frontend/public ./frontend/public
COPY --from=frontend-builder /app/frontend/.next/standalone ./frontend/
COPY --from=frontend-builder /app/frontend/.next/static ./frontend/.next/static
COPY frontend/docker-entrypoint.sh ./frontend/

# Copy Nginx Configuration
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Copy supervisor script / entrypoint script to run Nginx, Backend, and Frontend
COPY docker/super-entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh ./frontend/docker-entrypoint.sh

# Expose Nginx port
EXPOSE 80

ENTRYPOINT ["./entrypoint.sh"]
