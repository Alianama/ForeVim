#!/usr/bin/env bash
# ForeVim — Mode Development (tanpa Docker, untuk coding/testing)

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo -e "${CYAN}ForeVim — Development Mode${NC}"
echo ""

# ─── Backend ─────────────────────────────────────────────────────────────────
echo -e "${YELLOW}Menjalankan Backend (FastAPI)...${NC}"

# Deteksi venv
if [ -d "$BACKEND_DIR/.venv313" ]; then
    VENV="$BACKEND_DIR/.venv313"
elif [ -d "$BACKEND_DIR/.venv" ]; then
    VENV="$BACKEND_DIR/.venv"
else
    echo "Membuat virtual environment dengan Python 3.13..."
    python3.13 -m venv "$BACKEND_DIR/.venv313"
    VENV="$BACKEND_DIR/.venv313"
    source "$VENV/bin/activate"
    pip install -r "$BACKEND_DIR/requirements.txt" -q
    pip install "pydantic[email]" -q
fi

source "$VENV/bin/activate"

# Set env vars untuk dev (Prometheus URL via web → Prometheus Sources)
export DATABASE_URL="postgresql+asyncpg://forevim:forevim@localhost:5432/forevim"
export DEBUG="true"
export LOG_FORMAT="text"
export SECRET_KEY="dev-secret-key-not-for-production-use"
export FIRST_SUPERUSER_PASSWORD="Admin123!"
export ALLOWED_ORIGINS="http://localhost:3000"

echo -e "  ${GREEN}✅ Backend akan jalan di http://localhost:8000${NC}"
echo -e "  ${GREEN}✅ Prometheus: konfigurasi via web → Prometheus Sources${NC}"
echo ""

# Jalankan backend di background
cd "$BACKEND_DIR"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

sleep 3

# ─── Frontend ─────────────────────────────────────────────────────────────────
echo -e "${YELLOW}Menjalankan Frontend (Next.js)...${NC}"
echo -e "  ${GREEN}✅ Frontend akan jalan di http://localhost:3000${NC}"
echo ""

cd "$FRONTEND_DIR"
NEXT_PUBLIC_API_URL="http://localhost:8000/api/v1" \
NEXT_PUBLIC_WS_URL="ws://localhost:8000" \
npm run dev &
FRONTEND_PID=$!

# ─── Handler untuk Ctrl+C ─────────────────────────────────────────────────────
trap "echo -e '\n${YELLOW}Menghentikan services...${NC}'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  Dev server berjalan!${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "  🌐 Frontend: ${CYAN}http://localhost:3000${NC}"
echo -e "  📡 API Docs: ${CYAN}http://localhost:8000/api/docs${NC}"
echo -e "  👤 Login:    ${CYAN}admin@forevim.local / Admin123!${NC}"
echo ""
echo "  Tekan Ctrl+C untuk stop."
echo ""

wait
