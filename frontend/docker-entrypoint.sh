#!/bin/sh
set -e

# Replaces Next.js environment variables at runtime in the build bundles.
# We auto-detect the path to handle both standalone and unified container layouts.
TARGET_NEXT="./.next"
TARGET_PUBLIC="./public"

if [ ! -d "$TARGET_NEXT" ]; then
  # Fallback to unified container structure
  TARGET_NEXT="/app/frontend/.next"
  TARGET_PUBLIC="/app/frontend/public"
  if [ ! -d "$TARGET_NEXT" ]; then
    # Fallback to standalone container structure
    TARGET_NEXT="/app/.next"
    TARGET_PUBLIC="/app/public"
  fi
fi

echo "Injecting variables into bundles at: $TARGET_NEXT and $TARGET_PUBLIC"

if [ -n "$NEXT_PUBLIC_API_URL" ]; then
  echo "Setting API URL to: $NEXT_PUBLIC_API_URL"
  find "$TARGET_NEXT" -type f -exec sed -i "s|http://localhost:8000/api/v1|$NEXT_PUBLIC_API_URL|g" {} + 2>/dev/null || true
  find "$TARGET_PUBLIC" -type f -exec sed -i "s|http://localhost:8000/api/v1|$NEXT_PUBLIC_API_URL|g" {} + 2>/dev/null || true
fi

if [ -n "$NEXT_PUBLIC_WS_URL" ]; then
  echo "Setting WS URL to: $NEXT_PUBLIC_WS_URL"
  find "$TARGET_NEXT" -type f -exec sed -i "s|ws://localhost:8000|$NEXT_PUBLIC_WS_URL|g" {} + 2>/dev/null || true
  find "$TARGET_PUBLIC" -type f -exec sed -i "s|ws://localhost:8000|$NEXT_PUBLIC_WS_URL|g" {} + 2>/dev/null || true
fi

exec "$@"
