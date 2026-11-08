# Pocket`nt

Aplikasi pencatat pengeluaran bersama. Beberapa orang mencatat di satu "kantong", dengan ringkasan harian, mingguan, bulanan, grafik kebutuhan primer dan sekunder, dan unduhan PDF rekap bulanan. Bisa dipasang di layar utama iPhone dan Android.

Tidak ada langkah build. Semua berkas langsung dipakai apa adanya. Yang kamu butuhkan: akun Supabase (database dan login) dan akun hosting statis.

Waktu yang dibutuhkan sekitar 20 menit.

## Isi folder

| Berkas | Fungsi |
|---|---|
| `index.html`, `css/style.css` | Tampilan |
| `js/config.js` | Tempat mengisi URL dan kunci Supabase (**wajib diisi**) |
| `js/app.js`, `api.js`, `util.js`, `charts.js`, `pdf.js` | Logika aplikasi |
| `supabase/schema.sql` | Tabel dan aturan keamanan database (pemasangan baru) |
| `supabase/migrasi-saldo.sql` | Tambahan kolom saldo untuk database yang sudah dipakai |
| `manifest.webmanifest`, `sw.js`, `icons/` | Agar bisa dipasang seperti aplikasi |

## Langkah 1. Siapkan Supabase

1. Daftar di https://supabase.com, lalu buat proyek baru. Catat kata sandi database yang kamu pilih. Untuk wilayah server, pilih yang terdekat dengan pengguna (misalnya Singapore).
2. Buka **SQL Editor**, pilih **New query**, tempel seluruh isi `supabase/schema.sql`, lalu klik **Run**. Harus muncul "Success". Aman dijalankan ulang.
3. Buka **Project Settings > API**. Salin dua nilai:
   - **Project URL**
   - **anon public** key
4. Buka `js/config.js`, ganti dua teks `GANTI_...` dengan nilai tadi.

Kunci `anon` memang dibuat untuk ditaruh di aplikasi browser. Data tetap aman karena dijaga aturan keamanan di `schema.sql`: hanya anggota sebuah kantong yang bisa membaca dan menulis datanya. Jangan pernah menaruh kunci `service_role` di berkas mana pun di folder ini.

### Pengaturan login (Authentication)

- **Konfirmasi email.** Secara bawaan, pendaftar harus klik tautan di email sebelum bisa masuk. Kalau kamu ingin langsung masuk tanpa konfirmasi (mudah untuk keluarga atau teman dekat), matikan di **Authentication > Sign In / Providers > Email > Confirm email**. Kalau tetap dinyalakan, aplikasi sudah menampilkan pesan "Cek emailmu".
- **Site URL.** Setelah aplikasi punya alamat (langkah 2), isi alamat itu di **Authentication > URL Configuration > Site URL**, supaya tautan di email konfirmasi mengarah ke aplikasimu.
- Email bawaan Supabase punya batas jumlah kiriman per jam. Kalau banyak orang mendaftar sekaligus lalu muncul pesan "terlalu banyak percobaan", tunggu sebentar atau matikan konfirmasi email.

## Langkah 2. Pasang di hosting

Aplikasi ini hanya berkas statis, jadi hosting statis apa pun bisa. Pastikan alamatnya **HTTPS** (semua pilihan di bawah sudah HTTPS), karena pemasangan di ponsel dan service worker membutuhkannya.

**Netlify (paling mudah, tanpa perintah apa pun).**
1. Masuk ke https://app.netlify.com, buka bagian **Sites**.
2. Seret seluruh isi folder `pocketnt` (yang sudah kamu isi `config.js`) ke area unggah. Pastikan yang diunggah adalah isi foldernya sehingga `index.html` ada di level paling atas.
3. Beberapa detik kemudian kamu mendapat alamat seperti `https://nama-acak.netlify.app`. Nama situs bisa diganti di pengaturan situs.

**Cloudflare Pages, Vercel, atau GitHub Pages** juga bisa. Hubungkan ke repositori yang berisi folder ini, tanpa perintah build, dan folder keluaran adalah akar proyek (`/`).

Kalau mau memakai domain sendiri (misalnya `pocketnt.com`), beli domain di penyedia mana pun lalu sambungkan dari pengaturan Domain di hosting yang kamu pilih. Biaya domain dan batas paket gratis hosting berubah dari waktu ke waktu, jadi cek di situs masing-masing.

## Langkah 3. Pasang di ponsel

**iPhone (harus Safari).**
1. Buka alamat aplikasimu di Safari.
2. Ketuk tombol **Bagikan** (kotak dengan panah ke atas).
3. Pilih **Tambah ke Layar Utama**, lalu **Tambah**.

**Android (Chrome).**
1. Buka alamat aplikasimu di Chrome.
2. Ketuk menu titik tiga, lalu **Instal aplikasi** atau **Tambahkan ke layar utama**.

Setelah itu ikon Pocket`nt muncul di layar utama dan terbuka layar penuh seperti aplikasi biasa.

## Cara pakai

1. Daftar dengan email dan kata sandi, lalu **Buat kantong**. Kamu otomatis jadi pemilik.
2. Ketuk **Undang** untuk melihat kode undangan, lalu kirim ke teman atau keluarga. Mereka daftar, pilih **Gabung dengan kode**, dan langsung ikut mencatat.
3. Catat pengeluaran lewat form. Pilih kategori primer atau sekunder, dan catatan semua orang muncul langsung di layar anggota lain.
4. Ganti periode dengan tombol Harian, Mingguan, Bulanan, lalu geser dengan panah.
5. **Unduh PDF** membuat rekap bulan yang sedang dilihat. Di ponsel, PDF dibuka lewat lembar bagikan sehingga bisa disimpan ke Berkas atau dikirim lewat WhatsApp.

Aturan hak akses: semua anggota bisa melihat dan mencatat. Menghapus catatan hanya untuk pencatatnya sendiri atau pemilik kantong. Kode undangan berlaku selama kantong ada, jadi jangan dibagikan sembarangan.

## Saldo awal dan pengeluaran per anggota

- **Saldo awal.** Pemilik kantong mengetuk **Atur saldo awal** (atau **Ubah**) di kartu paling atas, mengisi jumlah dan tanggal mulai. Semua pengeluaran sejak tanggal itu, dari seluruh anggota, dikurangkan dari saldo awal. Kartu menampilkan sisa saldo, jumlah terpakai, dan peringatan saat sisa di bawah 20% atau saldo terlampaui. Anggota lain hanya melihat, tidak bisa mengubah.
- **Per anggota.** Kartu "Per anggota" menampilkan berapa yang dikeluarkan tiap orang pada periode yang sedang dilihat. Ketuk satu nama untuk memfilter seluruh tampilan (total, grafik, riwayat) hanya untuk orang itu, ketuk lagi untuk kembali. Kartu saldo tidak ikut terfilter karena saldo milik seluruh kantong.
- PDF rekap ikut memuat ringkasan saldo dan tabel per anggota.

## Memperbarui aplikasi yang sudah terpasang

Urutannya penting:
1. Buka Supabase > SQL Editor, jalankan isi `supabase/migrasi-saldo.sql` **lebih dulu**. Tanpa ini, aplikasi versi baru gagal membaca kantong.
2. Ganti berkas aplikasi (index.html, css/style.css, js/app.js, js/api.js, js/util.js, js/pdf.js, sw.js). **Jangan menimpa `js/config.js`**, karena isinya sudah kamu isi.
3. Unggah ulang ke hosting, tunggu selesai, lalu muat ulang aplikasi dua kali.

## Mengubah aplikasi nanti

Setiap kali kamu mengubah berkas lalu mengunggah ulang, **naikkan angka `VERSION` di `sw.js`** (misalnya `pocketnt-v1` menjadi `pocketnt-v2`). Kalau tidak, ponsel bisa tetap menampilkan versi lama yang tersimpan.

## Batasan yang perlu kamu tahu

- **Harus online untuk mencatat.** Tampilan aplikasi bisa terbuka tanpa sinyal, tapi data dibaca dan ditulis langsung ke Supabase. Catatan yang dibuat saat offline belum disimpan antrean.
- **Belum diuji dengan Supabase sungguhan.** Logika perhitungan, grafik, dan PDF sudah diuji dengan data tiruan, dan kode sudah diperiksa sintaksnya. Alur login, kantong, dan sinkron antar pengguna baru terbukti setelah kamu menjalankannya. Kalau ada pesan galat, kirim ke saya.
- **Bukan App Store atau Play Store.** Yang kamu dapat adalah aplikasi web yang dipasang di layar utama. Untuk masuk ke toko aplikasi, folder ini perlu dibungkus lagi (misalnya dengan Capacitor), dan itu butuh akun pengembang berbayar dari Apple dan Google serta proses review mereka.
- **Mata uang tunggal.** Semua jumlah dalam Rupiah.
- **Lupa kata sandi** belum ada tombolnya. Sementara bisa direset dari dashboard Supabase (Authentication > Users).
