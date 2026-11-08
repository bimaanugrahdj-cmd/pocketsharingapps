-- Pocket`nt: migrasi untuk fitur saldo awal.
-- Jalankan SEKALI di Supabase > SQL Editor SEBELUM mengunggah aplikasi versi baru.
-- Aman dijalankan ulang. Data yang sudah ada tidak berubah.

alter table public.pockets
  add column if not exists opening_balance bigint not null default 0
    check (opening_balance >= 0 and opening_balance <= 100000000000);

alter table public.pockets
  add column if not exists balance_from date not null default current_date;
