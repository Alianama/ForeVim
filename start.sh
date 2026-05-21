#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ForeVim — Startup Script
# URL Prometheus dikonfigurasi via web (Prometheus Sources), bukan env
# ─────────────────────────────────────────────────────────────────────────────

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}"
echo "  ███████╗ ██████╗ ██████╗ ███████╗██╗   ██╗██╗███╗   ███╗"
echo "  ██╔════╝██╔═══██╗██╔══██╗██╔════╝██║   ██║██║████╗ ████║"
echo "  █████╗  ██║   ██║██████╔╝█████╗  ██║   ██║██║██╔████╔██║"
echo "  ██╔══╝  ██║   ██║██╔══██╗██╔══╝  ╚██╗ ██╔╝██║██║╚██╔╝██║"
echo "  ██║     ╚██████╔╝██║  ██║███████╗ ╚████╔╝ ██║██║ ╚═╝ ██║"
echo "  ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚══════╝  ╚═══╝  ╚═╝╚═╝     ╚═╝"
echo -e "${NC}"
echo -e "  VM Monitoring & Forecasting Platform"
echo ""

# ─── Cek prasyarat ────────────────────────────────────────────────────────────
echo -e "${YELLOW}[1/4] Memeriksa prasyarat...${NC}"

command -v docker >/dev/null 2>&1 || { echo -e "${RED}❌ Docker tidak ditemukan. Install dulu: https://docs.docker.com/get-docker/${NC}"; exit 1; }
command -v docker compose >/dev/null 2>&1 || { echo -e "${RED}❌ Docker Compose tidak ditemukan.${NC}"; exit 1; }

echo -e "  ${GREEN}✅ Docker OK${NC}"

# ─── Pastikan .env sudah ada ─────────────────────────────────────────────────
echo -e "${YELLOW}[2/4] Memeriksa konfigurasi...${NC}"

if [ ! -f "$PROJECT_DIR/backend/.env" ]; then
    echo -e "  Membuat backend/.env dari template..."
    cp "$PROJECT_DIR/backend/.env.example" "$PROJECT_DIR/backend/.env"
fi

if [ ! -f "$PROJECT_DIR/frontend/.env.local" ]; then
    echo -e "  Membuat frontend/.env.local dari template..."
    cp "$PROJECT_DIR/frontend/.env.example" "$PROJECT_DIR/frontend/.env.local"
fi

echo -e "  ${GREEN}✅ Konfigurasi siap${NC}"
echo -e "  ${YELLOW}ℹ️  Prometheus URL: tambahkan di web → Prometheus Sources setelah login${NC}"

# ─── Build & Start containers ─────────────────────────────────────────────────
echo -e "${YELLOW}[3/4] Membangun dan menjalankan containers...${NC}"
echo -e "  (proses build pertama kali butuh 3-10 menit)"
echo ""

cd "$PROJECT_DIR"
docker compose up -d --build

echo ""
echo -e "${YELLOW}[4/4] Menunggu services siap...${NC}"

# Tunggu backend sehat
echo -n "  Menunggu backend"
for i in $(seq 1 30); do
    if curl -sf --max-time 3 "http://localhost:8000/health" > /dev/null 2>&1; then
        echo -e " ${GREEN}✅${NC}"
        break
    fi
    echo -n "."
    sleep 3
done

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🚀 ForeVim berhasil dijalankan!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  🌐 Dashboard:    ${CYAN}http://localhost:3000${NC}"
echo -e "  📡 Backend API:  ${CYAN}http://localhost:8000/api/docs${NC}"
echo ""
echo -e "  👤 Login: ${YELLOW}admin@forevim.io${NC} / ${YELLOW}Admin123!${NC}"
echo ""
echo -e "  💡 Langkah pertama:"
echo -e "     1. Buka ${CYAN}Prometheus Sources${NC} → tambahkan IP/URL Prometheus"
echo -e "     2. Buka ${CYAN}Virtual Machines${NC} → Sync from Prometheus"
echo ""
echo -e "  📋 Lihat logs:  ${CYAN}docker compose logs -f backend${NC}"
echo -e "  🛑 Stop:        ${CYAN}docker compose down${NC}"
echo ""
