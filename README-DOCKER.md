# Panduan Distribusi & Instalasi ForeVim via Docker

Dokumen ini menjelaskan cara mendistribusikan ForeVim menggunakan Docker Image yang di-host di **GitHub Container Registry (GHCR)**, serta cara melakukan instalasi menggunakan `docker-compose` dan database PostgreSQL eksternal (milik Anda sendiri).

---

## 1. Arsitektur & Cara Kerja Distribusi

Untuk memudahkan pengguna lain memakai ForeVim tanpa harus melakukan build kode dari awal:
1. **GitHub Actions Workflow** otomatis akan mem-build kode `backend` & `frontend` menjadi Docker Image ketika ada perubahan di branch `main` atau pembuatan git tag (`v*`).
2. Image hasil build akan di-push ke registry milik GitHub (**GHCR**):
   - Backend: `ghcr.io/<github-username>/forevim-backend:latest`
   - Frontend: `ghcr.io/<github-username>/forevim-frontend:latest`
3. Pengguna lain cukup mengunduh berkas `docker-compose.prod.yml` dan `.env`, lalu menjalankan container.
4. **Runtime Env Injection**: Frontend menggunakan Next.js standalone. Karena alamat backend (`NEXT_PUBLIC_API_URL`) berubah-ubah tergantung IP server pengguna, kami telah menambahkan script `docker-entrypoint.sh` di frontend untuk mengubah alamat API di berkas JavaScript terkompilasi secara dinamis saat container pertama kali dinyalakan.

---

## 2. Persiapan Sebelum Instalasi (Sisi Pengguna)

Pengguna harus menyiapkan:
1. **Docker & Docker Compose** terpasang di server/komputer target.
2. **Database PostgreSQL**: Database PostgreSQL eksternal yang dapat diakses oleh server Docker.
   - Database harus sudah dibuat (misal dengan nama `forevim`).
   - Contoh URL koneksi: `postgresql+asyncpg://username:password@db-host:5432/forevim`
   - *Catatan: Pastikan database mengizinkan koneksi dari subnet Docker.*

---

## 3. Langkah-Langkah Instalasi & Menjalankan Aplikasi

### Langkah 1: Unduh Berkas Konfigurasi
Unduh berkas `docker-compose.prod.yml` dan `.env.example` dari repositori ini, lalu tempatkan ke dalam satu direktori di server Anda:
```bash
mkdir forevim-deploy && cd forevim-deploy
# Unduh berkas dari repositori
curl -o docker-compose.yml https://raw.githubusercontent.com/<github-username>/forevim/main/docker-compose.prod.yml
curl -o .env https://raw.githubusercontent.com/<github-username>/forevim/main/.env.example
```

### Langkah 2: Konfigurasi Berkas `.env`
Buka berkas `.env` menggunakan text editor (seperti `nano` atau `vim`) dan sesuaikan nilainya:
```bash
nano .env
```

Isi dari `.env` yang harus disesuaikan:
```ini
# 1. Koneksi Database PostgreSQL Anda (Wajib menggunakan postgresql+asyncpg)
DATABASE_URL=postgresql+asyncpg://forevim_user:securepassword123@192.168.1.100:5432/forevim_db

# 2. Key Keamanan (Ganti dengan string random hex panjang)
# Anda bisa menghasilkan string ini dengan perintah: openssl rand -hex 32
SECRET_KEY=e4a8c9830db923ac0c329d20c32187fca7e7d9e03dcb2910fae1c03e87d8123c

# 3. CORS Backend (Masukkan alamat frontend Anda agar diizinkan memanggil backend)
ALLOWED_ORIGINS_STR=http://localhost:3000,http://<ip-server-anda>:3000

# 4. Akses URL di Browser Pengguna (PENTING: Sesuaikan dengan IP Server / Domain Anda)
# Jika dideploy di server ber-IP 192.168.1.50, ganti localhost menjadi IP tersebut.
NEXT_PUBLIC_API_URL=http://<ip-server-anda>:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://<ip-server-anda>:8000
```

> [!IMPORTANT]
> Jangan lupa mengubah `<ip-server-anda>` pada `NEXT_PUBLIC_API_URL` dan `NEXT_PUBLIC_WS_URL` agar browser pengguna lain dapat menghubungi backend API dan WebSocket server secara sukses.

### Langkah 3: Jalankan Container
Jalankan perintah berikut untuk mengunduh image dari GHCR dan menyalakan seluruh layanan ForeVim:
```bash
docker compose up -d
```

Docker secara otomatis akan:
- Menarik image `forevim-backend` dan `forevim-frontend` terbaru dari GHCR.
- Menginisialisasi tabel-tabel database PostgreSQL Anda secara otomatis (`init_db.py`).
- Menjalankan migrasi database (`alembic`).
- Menjalankan backend di port `8000` dan frontend di port `3000`.

### Langkah 4: Verifikasi & Uji Coba
1. Buka browser dan akses **Dashboard Frontend**: `http://<ip-server-anda>:3000`
2. Coba login menggunakan kredensial default admin Anda.
3. Anda dapat memeriksa kesehatan backend dengan mengakses: `http://<ip-server-anda>:8000/health` (harus mengembalikan status JSON `{"status": "healthy"}`).

---

## 4. Cara Menghentikan & Memperbarui Aplikasi

* **Menghentikan Aplikasi**:
  ```bash
  docker compose down
  ```
* **Memperbarui ke Versi Terbaru**:
  Jika ada pembaruan versi di repositori, cukup lakukan pull image terbaru dan jalankan kembali:
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
