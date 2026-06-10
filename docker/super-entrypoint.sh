#!/bin/sh
set -e

echo "=== Starting ForeVim Unified Container ==="

# 1. Run frontend environment variables injection
echo "Injecting frontend runtime environment variables..."
cd /app/frontend
# Execute the sub-entrypoint script as nextjs user or locally
./docker-entrypoint.sh echo "Injection complete"

# 2. Run backend migrations and start backend in background
echo "Initializing database & starting backend API..."
cd /app/backend
python init_db.py
alembic stamp head
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 &
BACKEND_PID=$!

# 3. Start Next.js frontend in background
echo "Starting frontend dashboard..."
cd /app/frontend
node server.js &
FRONTEND_PID=$!

# 4. Start Nginx in foreground
echo "Starting Nginx reverse proxy on port 80..."
exec nginx -g "daemon off;"
