# Panduan Distribusi & Instalasi ForeVim via Docker (Single Unified Image)

Dokumen ini menjelaskan cara mendistribusikan ForeVim menggunakan **Single Unified Docker Image** (menggabungkan Frontend, Backend, dan Nginx Reverse Proxy menjadi satu kontainer utuh) yang di-host di **GitHub Container Registry (GHCR)**, serta cara melakukan instalasi menggunakan `docker-compose` dan database PostgreSQL eksternal.

---

## 1. Arsitektur & Cara Kerja Distribusi

Untuk memudahkan penyebaran aplikasi dan menyederhanakan konfigurasi jaringan bagi pengguna akhir:
1. **Single Image**: Frontend (Next.js standalone), Backend (FastAPI), dan Nginx dipaketkan ke dalam **satu Docker Image** tunggal.
2. **Nginx Reverse Proxy**: Berjalan di dalam kontainer di port `80`:
   - Rute `/api/v1`, `/docs`, dan WebSocket `/api/v1/ws` diarahkan secara internal ke FastAPI (port `8000`).
   - Rute halaman dashboard lainnya diarahkan secara internal ke Next.js (port `3000`).
   - Hal ini membuat pengguna tidak perlu mengatur CORS atau membuka port tambahan di firewall (hanya perlu membuka satu port web saja).
3. **GitHub Actions Workflow**: Secara otomatis mem-build image tunggal ini ketika ada push ke branch `main` atau pembuatan git tag (`v*`), lalu mengunggahnya ke **GHCR**:
   - Image Path: `ghcr.io/<github-username>/forevim:latest`
4. **Runtime Env Injection**: Saat kontainer dijalankan, skrip `entrypoint.sh` secara dinamis menyesuaikan alamat API pada berkas terkompilasi agar sesuai dengan domain/IP yang diakses pengguna.

---

## 2. Persiapan Sebelum Instalasi (Sisi Pengguna)

Pengguna harus menyiapkan:
1. **Docker & Docker Compose** terpasang di server target.
2. **Database PostgreSQL**: Database PostgreSQL eksternal (milik Anda sendiri).
   - Pastikan database sudah dibuat (misal bernama `forevim`).
   - Gunakan driver `postgresql+asyncpg` pada berkas konfigurasi.
   - Contoh URL koneksi: `postgresql+asyncpg://username:password@db-host:5432/forevim`

---

## 3. Langkah-Langkah Instalasi & Menjalankan Aplikasi

### Langkah 1: Unduh Berkas `docker-compose.yml`
Buat sebuah direktori baru di server Anda, lalu unduh berkas `docker-compose.prod.yml` (disimpan sebagai `docker-compose.yml`) dari repositori:
```bash
mkdir forevim-deploy && cd forevim-deploy
# Unduh berkas dari repositori
curl -o docker-compose.yml https://raw.githubusercontent.com/<github-username>/forevim/main/docker-compose.prod.yml
```

### Langkah 2: Konfigurasi Berkas `docker-compose.yml`
Buka berkas `docker-compose.yml` menggunakan editor teks (seperti `nano` atau `vim`):
```bash
nano docker-compose.yml
```

Sesuaikan nilai-nilai variabel lingkungan di dalam blok `environment` layanan `forevim`:
```yaml
    environment:
      # 1. Koneksi Database PostgreSQL Anda (Wajib menggunakan postgresql+asyncpg)
      - DATABASE_URL=postgresql+asyncpg://forevim_user:securepassword123@192.168.1.100:5432/forevim_db

      # 2. Key Keamanan (Ganti dengan string random hex panjang)
      # Hasilkan string ini dengan perintah: openssl rand -hex 32
      - SECRET_KEY=e4a8c9830db923ac0c329d20c32187fca7e7d9e03dcb2910fae1c03e87d8123c

      # 3. CORS Backend (Masukkan alamat frontend Anda agar diizinkan memanggil backend)
      # Karena frontend & backend disatukan di port yang sama, Anda cukup memasukkan port akses web Anda (misal port 80)
      - ALLOWED_ORIGINS_STR=http://localhost:80,http://127.0.0.1:80

      # 4. Akses URL di Browser Pengguna (PENTING: Sesuaikan dengan IP Server / Domain Anda)
      # Jika dideploy di server ber-IP 192.168.1.50, ganti localhost menjadi 192.168.1.50.
      - NEXT_PUBLIC_API_URL=http://<ip-server-anda>:80/api/v1
      - NEXT_PUBLIC_WS_URL=ws://<ip-server-anda>:80
```

> [!IMPORTANT]
> Jangan lupa mengubah `<ip-server-anda>` pada `NEXT_PUBLIC_API_URL` dan `NEXT_PUBLIC_WS_URL` sesuai dengan IP publik / domain server Anda agar browser pengguna dapat terhubung dengan API dan WebSocket secara lancar.


### Langkah 3: Jalankan Container
Jalankan perintah berikut untuk mengunduh image dari GHCR dan menyalakan ForeVim:
```bash
docker compose up -d
```

Kontainer secara otomatis akan:
- Mengunduh image `forevim` terbaru dari GHCR.
- Menginisialisasi tabel-tabel database PostgreSQL Anda secara otomatis (`init_db.py`).
- Menjalankan migrasi database (`alembic`).
- Menjalankan Next.js, FastAPI, dan Nginx secara bersamaan.
- Membuka port web `80` (Anda dapat mengubah mapping port di `docker-compose.yml` misalnya menjadi `"8080:80"` jika port 80 bentrok).

### Langkah 4: Verifikasi & Uji Coba
1. Buka browser dan akses dashboard: `http://<ip-server-anda>:80` (atau port lain jika Anda mengubah pemetaan port).
2. Coba login menggunakan kredensial admin Anda.
3. Untuk memeriksa kesehatan backend, kunjungi: `http://<ip-server-anda>:80/health`.

---

## 4. Cara Menghentikan & Memperbarui Aplikasi

* **Menghentikan Aplikasi**:
  ```bash
  docker compose down
  ```
* **Memperbarui ke Versi Terbaru**:
  Jika ada rilis baru di repositori GitHub, cukup jalankan perintah:
  ```bash
  docker compose pull
  docker compose up -d
  ```

---

## 5. Konfigurasi GitHub Actions Workflow (Sisi Pengembang)

Jika Anda ingin mempublikasikan image ke GHCR milik Anda sendiri:
1. Pastikan repositori Anda berada di GitHub (misalnya: `https://github.com/username/forevim`).
2. Aktifkan perizinan package write di repositori Anda (`Settings` -> `Actions` -> `General` -> `Workflow permissions` -> Pilih `Read and write permissions`).
3. File GitHub Actions sudah dikonfigurasi di `.github/workflows/docker-publish.yml`. Setiap kali Anda melakukan `git push origin main` atau membuat git tag baru, GitHub akan otomatis mengompilasi dan mengunggah image Docker ke GitHub Packages (`ghcr.io`).
4. Sesuaikan nama image di `docker-compose.prod.yml` untuk merujuk ke namespace organisasi/akun GitHub Anda sendiri:
   - Ganti `ghcr.io/alianama/` menjadi `ghcr.io/<username-github-anda>/`.
