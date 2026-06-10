# ForeVim — VM Monitoring & Forecasting Platform

> **Enterprise-grade observability platform** for Linux VMs. Real-time metrics via Prometheus, AI-powered forecasting, WebSocket streaming, and a stunning dark dashboard.

![ForeVim Architecture](https://img.shields.io/badge/Stack-FastAPI%20%7C%20Next.js%20%7C%20Prometheus-blue?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## Architecture

```
Linux VM
  └─► node_exporter (:9100)
        └─► Prometheus (:9090)
              └─► Nginx Proxy (:80)  ◄── [Docker Single Image / Unified Port]
                    ├─► Next.js Frontend (:3000)
                    └─► FastAPI Backend (:8000)
                          ├─► PostgreSQL (metadata, alerts, forecasts)
                          └─► WebSocket (realtime push)
```

> The backend **only queries Prometheus HTTP API** — no direct VM connections.
> The frontend **only queries the API through the Nginx Proxy** (or backend directly if locally run) — never Prometheus directly.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, React 19, TypeScript, TailwindCSS, ECharts, TanStack Query, Zustand |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy (async), Alembic, APScheduler, httpx |
| **Database** | PostgreSQL 16 (metadata only — metrics stay in Prometheus) |
| **Metrics** | Prometheus + node_exporter |
| **Realtime** | WebSocket (FastAPI native) |
| **Auth** | JWT (access + refresh tokens), RBAC |

---

## Deployment & Quick Start

Ada dua cara untuk menjalankan ForeVim: menggunakan **Single Unified Image** (direkomendasikan untuk produksi/penggunaan praktis) atau membangunnya dari source code secara lokal untuk pengembangan.

### Pilihan A: Production Deployment (Single Image via GHCR - Rekomendasi)

Dengan pilihan ini, Anda tidak perlu mengunduh seluruh source code. Anda hanya perlu menyiapkan satu folder bersih di server Anda, menyiapkan berkas konfigurasi, lalu menarik image dari **GHCR** (GitHub Container Registry).

#### 1. Struktur Folder
Siapkan sebuah direktori kosong di server Anda dengan struktur berkas berikut:
```
forevim-deploy/
├── docker-compose.yml   (Diunduh dari docker-compose.prod.yml)
└── .env                 (Dibuat dari .env.example)
```

#### 2. Langkah Instalasi

##### Langkah 1: Unduh Berkas Konfigurasi
Jalankan perintah berikut di server Anda untuk membuat direktori dan mengunduh berkas konfigurasi:
```bash
mkdir forevim-deploy && cd forevim-deploy
curl -o docker-compose.yml https://raw.githubusercontent.com/alianama/forevim/main/docker-compose.prod.yml
curl -o .env https://raw.githubusercontent.com/alianama/forevim/main/.env.example
```

##### Langkah 2: Konfigurasi Berkas `.env`
Buka berkas `.env` menggunakan editor teks (misal: `nano .env`) dan sesuaikan variabelnya:
* **`POSTGRES_USER`**, **`POSTGRES_PASSWORD`**, **`POSTGRES_DB`**: Mengatur nama user, kata sandi, dan nama database untuk kontainer database lokal Anda.
* **`SECRET_KEY`**: Kunci rahasia JWT (bisa diisi string acak atau digenerate dengan `openssl rand -hex 32`).
* **`NEXT_PUBLIC_API_URL`**: Alamat URL API publik Anda. Jika server dideploy di IP `192.168.1.50`, ubah menjadi `http://192.168.1.50/api/v1` (Port `80`).
* **`NEXT_PUBLIC_WS_URL`**: Alamat WebSocket publik Anda. Contoh: `ws://192.168.1.50` (Port `80`).

##### Langkah 3: Jalankan Aplikasi
Jalankan perintah berikut untuk mengunduh image dari GHCR dan menyalakan ForeVim beserta database PostgreSQL:
```bash
docker compose up -d
```

##### Langkah 4: Akses Aplikasi
Buka browser dan akses server Anda di port `80`:
* **Dashboard Web**: `http://<ip-server-anda>`
* **Status API Health**: `http://<ip-server-anda>/health`
* Kredensial default: `admin@forevim.local` / `ChangeMe123!`

---

---

### Pilihan B: Local Development (Build dari Source)

Jika Anda ingin mem-build image secara lokal dari repositori ini:

#### 1. Clone & Konfigurasi

```bash
git clone https://github.com/yourorg/forevim.git
cd forevim

# Konfigurasi Backend
cp backend/.env.example backend/.env
# Edit backend/.env — isi SECRET_KEY, dsb.

# Konfigurasi Frontend
cp frontend/.env.example frontend/.env.local
```

#### 2. Jalankan dengan Docker Compose Lokal

```bash
# Build & jalankan frontend, backend, dan postgres lokal
docker compose up -d --build
```

Layanan lokal:
- Frontend: `http://localhost:3000`
- Backend API Docs: `http://localhost:8000/docs`

---

### 3. Konfigurasi Prometheus (Melalui Web UI)

Setelah berhasil login (Default login: `admin@forevim.local` / `ChangeMe123!`), buka menu **Prometheus Sources** di web UI dashboard untuk mendaftarkan URL server Prometheus Anda (misal: `http://192.168.1.10:9090`).

> URL Prometheus **tidak** dikonfigurasi melalui `.env` — semuanya diatur secara dinamis melalui dashboard web.

---

## Installing node_exporter on Linux VMs

Run this on **each Linux VM** you want to monitor:

```bash
# Download node_exporter (latest)
NODE_EXPORTER_VERSION="1.8.2"
wget https://github.com/prometheus/node_exporter/releases/download/v${NODE_EXPORTER_VERSION}/node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64.tar.gz
tar xvf node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64.tar.gz
sudo mv node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64/node_exporter /usr/local/bin/

# Create systemd service
sudo tee /etc/systemd/system/node_exporter.service > /dev/null <<EOF
[Unit]
Description=Node Exporter
After=network.target

[Service]
Type=simple
User=nobody
ExecStart=/usr/local/bin/node_exporter
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable node_exporter
sudo systemctl start node_exporter

# Verify
curl http://localhost:9100/metrics | head -20
```

### Register VM in ForeVim

After installing node_exporter, register the VM via the dashboard or API:

```bash
curl -X POST http://localhost:8000/api/v1/vms \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "vm-prod-01",
    "ip_address": "192.168.1.10",
    "description": "Production API Server",
    "environment": "production",
    "prometheus_instance": "192.168.1.10:9100"
  }'
```

---

## Backend API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login/json` | Login with email/password → JWT tokens |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| GET | `/api/v1/auth/me` | Get current user |

### VM Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/vms` | List all VMs |
| POST | `/api/v1/vms` | Register new VM |
| GET | `/api/v1/vms/{id}` | Get VM details |
| PATCH | `/api/v1/vms/{id}` | Update VM metadata |
| DELETE | `/api/v1/vms/{id}` | Deregister VM |
| GET | `/api/v1/vms/{id}/metrics` | Current metrics (live from Prometheus) |
| GET | `/api/v1/vms/{id}/history` | Historical metrics (`?metric=cpu&hours=24&step=5m`) |
| GET | `/api/v1/vms/{id}/forecast` | AI forecast (`?metric=cpu&algorithm=linear_regression&period_days=7`) |
| GET | `/api/v1/vms/summary` | Dashboard summary stats |

### Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/alerts` | List alerts (`?vm_id=...&alert_status=active`) |
| POST | `/api/v1/alerts/{id}/acknowledge` | Acknowledge alert |
| POST | `/api/v1/alerts/{id}/resolve` | Resolve alert |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check |

---

## WebSocket API

### Endpoints

```
ws://localhost:8000/api/v1/ws           ← Global (all VMs)
ws://localhost:8000/api/v1/ws/vm/{id}  ← Per-VM subscription
```

Authenticate by passing `?token=<access_token>` in the URL.

### Events

#### `metrics_update`
```json
{
  "event": "metrics_update",
  "data": {
    "vm_id": "uuid",
    "hostname": "vm-prod-01",
    "cpu_usage": 42.3,
    "ram_usage": 67.1,
    "disk_usage": 55.0,
    "status": "healthy",
    "collected_at": "2024-01-01T12:00:00Z"
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### `alert`
```json
{
  "event": "alert",
  "data": {
    "vm_id": "uuid",
    "hostname": "vm-prod-01",
    "severity": "critical",
    "metric": "cpu_usage",
    "message": "[vm-prod-01] CPU usage is 91.2% — above critical threshold"
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

Send `ping` text to keep connection alive → server responds with `{"event":"pong"}`.

---

## Forecasting

### Algorithms

| Algorithm | Status | Description |
|-----------|--------|-------------|
| `linear_regression` | ✅ Active | OLS over time index, includes R² accuracy |
| `moving_average` | ✅ Active | Rolling window average with std bands |
| `prophet` | 🔮 Planned | Facebook Prophet (`pip install prophet`) |
| `arima` | 🔮 Planned | ARIMA via statsmodels |
| `lstm` | 🔮 Planned | PyTorch/TensorFlow LSTM |

### API Usage

```bash
# CPU forecast for next 7 days using Linear Regression
GET /api/v1/vms/{id}/forecast?metric=cpu&algorithm=linear_regression&period_days=7

# RAM forecast for next 30 days using Moving Average
GET /api/v1/vms/{id}/forecast?metric=ram&algorithm=moving_average&period_days=30
```

### Response Shape

```json
{
  "vm_id": "uuid",
  "metric": "cpu",
  "algorithm": "linear_regression",
  "period_days": 7,
  "historical": [
    { "timestamp": "...", "value": 42.1, "is_forecast": false }
  ],
  "forecast": [
    {
      "timestamp": "...", "value": 51.3,
      "lower_bound": 45.0, "upper_bound": 57.6,
      "is_forecast": true
    }
  ],
  "accuracy_score": 0.87,
  "generated_at": "..."
}
```

---

## Prometheus Queries Reference

These PromQL queries are used internally by the backend:

```promql
# CPU Usage %
100 - (avg by (instance) (rate(node_cpu_seconds_total{instance="<ip>:9100",mode="idle"}[5m])) * 100)

# RAM Usage %
100 - ((node_memory_MemAvailable_bytes{instance="<ip>:9100"} / node_memory_MemTotal_bytes{instance="<ip>:9100"}) * 100)

# Disk Usage % (root filesystem)
100 - ((node_filesystem_avail_bytes{instance="<ip>:9100",mountpoint="/"} / node_filesystem_size_bytes{instance="<ip>:9100",mountpoint="/"}) * 100)

# Network RX (Mbps)
rate(node_network_receive_bytes_total{instance="<ip>:9100",device!="lo"}[5m]) / 1e6

# System Uptime (seconds)
node_time_seconds{instance="<ip>:9100"} - node_boot_time_seconds{instance="<ip>:9100"}

# Load Average
node_load1{instance="<ip>:9100"}

# Instance UP/DOWN
up{instance="<ip>:9100", job="node_exporter"}
```

---

## Project Structure

```
forevim/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   ← Route handlers
│   │   ├── core/               ← Config, DB, Security, Logging
│   │   ├── models/             ← SQLAlchemy ORM
│   │   ├── schemas/            ← Pydantic schemas
│   │   ├── services/           ← Business logic (VM, Auth)
│   │   ├── prometheus/         ← Prometheus HTTP client
│   │   ├── forecasting/        ← Algorithm registry
│   │   ├── alerts/             ← Alert rules + notifications
│   │   ├── websocket/          ← WebSocket connection manager
│   │   └── scheduler/          ← APScheduler background tasks
│   ├── alembic/                ← Database migrations
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   ├── app/                    ← Next.js App Router pages
│   │   ├── dashboard/          ← Overview + VM detail
│   │   └── login/
│   ├── components/
│   │   ├── charts/             ← ECharts components
│   │   ├── dashboard/          ← Summary cards
│   │   ├── vm/                 ← VM table, metrics cards
│   │   ├── alerts/             ← Alert list
│   │   └── layout/             ← Sidebar, TopBar
│   ├── hooks/                  ← TanStack Query + WS hooks
│   ├── services/               ← API service layer
│   ├── stores/                 ← Zustand stores
│   ├── types/                  ← TypeScript definitions
│   ├── websocket/              ← WS client abstraction
│   └── lib/                    ← Axios client
│
├── docker/
│   └── prometheus/
│       └── prometheus.yml
└── docker-compose.yml
```

---

## Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| CPU | 70% | 85% |
| RAM | 75% | 90% |
| Disk | 70% | 85% |

Alerts auto-resolve with 5% hysteresis to prevent flapping.

---

## Notifications

### Telegram
```env
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
```

### Slack
```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
```

---

## Database Migrations

```bash
cd backend

# Generate migration
alembic revision --autogenerate -m "describe_change"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

---

## RBAC Roles

| Role | Permissions |
|------|-------------|
| `superadmin` | Full access: users, VMs, alerts, settings |
| `admin` | Manage VMs, acknowledge alerts |
| `viewer` | Read-only: view metrics, history, forecasts |

---

## Future Roadmap

- [ ] Kubernetes pod/node monitoring (k8s metrics-server / kube-state-metrics)
- [ ] Prophet / ARIMA / LSTM forecasting backends
- [ ] Multi-cluster Prometheus federation
- [ ] AlertManager integration
- [ ] Anomaly detection ML model
- [ ] Custom alert rules UI
- [ ] User invitation system
- [ ] Grafana-style dashboard builder
- [ ] Audit log viewer
- [ ] Cost estimation forecasting

---

## License

MIT © ForeVim Contributors
