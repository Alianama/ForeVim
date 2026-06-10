#!/bin/sh
set -e

# Replace Next.js environment variables at runtime in the build bundles
if [ -n "$NEXT_PUBLIC_API_URL" ]; then
  echo "Setting API URL to: $NEXT_PUBLIC_API_URL"
  # Replace in both standalone node app and static assets
  find /app/.next -type f -exec sed -i "s|http://localhost:8000/api/v1|$NEXT_PUBLIC_API_URL|g" {} +
  find /app/public -type f -exec sed -i "s|http://localhost:8000/api/v1|$NEXT_PUBLIC_API_URL|g" {} + 2>/dev/null || true
fi

if [ -n "$NEXT_PUBLIC_WS_URL" ]; then
  echo "Setting WS URL to: $NEXT_PUBLIC_WS_URL"
  # Replace in both standalone node app and static assets
  find /app/.next -type f -exec sed -i "s|ws://localhost:8000|$NEXT_PUBLIC_WS_URL|g" {} +
  find /app/public -type f -exec sed -i "s|ws://localhost:8000|$NEXT_PUBLIC_WS_URL|g" {} + 2>/dev/null || true
fi

exec "$@"
