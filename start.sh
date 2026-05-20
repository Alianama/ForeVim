#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ForeVim — Startup Script
# Prometheus sudah jalan di: http://192.168.9.16:9090
# ─────────────────────────────────────────────────────────────────────────────

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMETHEUS_URL="http://192.168.9.16:9090"

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
echo -e "${YELLOW}[1/5] Memeriksa prasyarat...${NC}"

command -v docker >/dev/null 2>&1 || { echo -e "${RED}❌ Docker tidak ditemukan. Install dulu: https://docs.docker.com/get-docker/${NC}"; exit 1; }
command -v docker compose >/dev/null 2>&1 || { echo -e "${RED}❌ Docker Compose tidak ditemukan.${NC}"; exit 1; }

echo -e "  ${GREEN}✅ Docker OK${NC}"

# ─── Cek koneksi ke Prometheus ───────────────────────────────────────────────
echo -e "${YELLOW}[2/5] Memeriksa koneksi ke Prometheus ($PROMETHEUS_URL)...${NC}"

if curl -sf --max-time 5 "$PROMETHEUS_URL/-/healthy" > /dev/null; then
    echo -e "  ${GREEN}✅ Prometheus UP — $PROMETHEUS_URL${NC}"

    # Hitung jumlah node_exporter targets
    NODE_COUNT=$(curl -s "$PROMETHEUS_URL/api/v1/targets" | python3 -c "
import sys, json
data = json.load(sys.stdin)
targets = data.get('data', {}).get('activeTargets', [])
count = sum(1 for t in targets
    if '9100' in t.get('labels', {}).get('instance', '')
    and t.get('health') == 'up')
print(count)
" 2>/dev/null || echo "?")
    echo -e "  ${GREEN}✅ Node Exporter targets aktif: ${NODE_COUNT}${NC}"
else
    echo -e "  ${RED}❌ Prometheus tidak bisa dijangkau di $PROMETHEUS_URL${NC}"
    echo -e "  Pastikan Prometheus jalan dan bisa diakses dari mesin ini."
    exit 1
fi

# ─── Pastikan .env sudah ada ─────────────────────────────────────────────────
echo -e "${YELLOW}[3/5] Memeriksa konfigurasi...${NC}"

if [ ! -f "$PROJECT_DIR/backend/.env" ]; then
    echo -e "  Membuat backend/.env dari template..."
    cp "$PROJECT_DIR/backend/.env.example" "$PROJECT_DIR/backend/.env"
fi

if [ ! -f "$PROJECT_DIR/frontend/.env.local" ]; then
    echo -e "  Membuat frontend/.env.local dari template..."
    cp "$PROJECT_DIR/frontend/.env.example" "$PROJECT_DIR/frontend/.env.local"
fi

echo -e "  ${GREEN}✅ Konfigurasi siap${NC}"

# ─── Build & Start containers ─────────────────────────────────────────────────
echo -e "${YELLOW}[4/5] Membangun dan menjalankan containers...${NC}"
echo -e "  (proses build pertama kali butuh 3-10 menit)"
echo ""

cd "$PROJECT_DIR"
docker compose up -d --build

echo ""
echo -e "${YELLOW}[5/5] Menunggu services siap...${NC}"

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
echo -e "  🔥 Prometheus:   ${CYAN}$PROMETHEUS_URL${NC}"
echo ""
echo -e "  👤 Login: ${YELLOW}admin@forevim.local${NC} / ${YELLOW}Admin123!${NC}"
echo ""
echo -e "  💡 Setelah login, pergi ke Settings → Sync dari Prometheus"
echo -e "     untuk import semua VM secara otomatis."
echo ""
echo -e "  📋 Lihat logs:  ${CYAN}docker compose logs -f backend${NC}"
echo -e "  🛑 Stop:        ${CYAN}docker compose down${NC}"
echo ""
