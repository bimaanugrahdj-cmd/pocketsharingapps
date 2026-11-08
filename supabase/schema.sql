-- Pocket`nt: skema database untuk Supabase
-- Cara pakai: Supabase Dashboard > SQL Editor > New query > tempel seluruh isi file ini > Run.
-- Aman dijalankan ulang (memakai "if not exists" / "create or replace").

-- ============================================================
-- 1. Tabel
-- ============================================================

-- Kantong: satu ruang catatan yang dipakai bersama.
create table if not exists public.pockets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique
              default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Saldo awal kantong (fitur saldo). Pengeluaran sejak balance_from dikurangkan dari saldo ini.
alter table public.pockets
  add column if not exists opening_balance bigint not null default 0
    check (opening_balance >= 0 and opening_balance <= 100000000000);
alter table public.pockets
  add column if not exists balance_from date not null default current_date;

-- Anggota kantong. Nama tampilan disimpan per kantong.
create table if not exists public.pocket_members (
  pocket_id    uuid not null references public.pockets (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (pocket_id, user_id)
);

-- Pengeluaran.
create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  pocket_id  uuid not null references public.pockets (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount     bigint not null check (amount > 0 and amount <= 100000000000),
  category   text not null check (category in (
               'makanan', 'transport', 'tagihan', 'rumah', 'kesehatan', 'pendidikan',
               'hiburan', 'belanja', 'kafe', 'langganan', 'hobi', 'lain')),
  note       text check (note is null or char_length(note) <= 80),
  spent_on   date not null,
  created_at timestamptz not null default now()
);

create index if not exists expenses_pocket_date_idx
  on public.expenses (pocket_id, spent_on desc);
create index if not exists pocket_members_user_idx
  on public.pocket_members (user_id);

-- ============================================================
-- 2. Fungsi bantu (dipakai oleh aturan keamanan)
--    security definer: dibaca tanpa memicu aturan keamanan lagi (menghindari putaran tak berujung).
-- ============================================================

create or replace function public.is_member(pid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pocket_members m
    where m.pocket_id = pid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_owner(pid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pocket_members m
    where m.pocket_id = pid and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- ============================================================
-- 3. Fungsi buat dan gabung kantong
--    Dilakukan lewat fungsi agar pembuat langsung jadi pemilik, dan
--    orang lain hanya bisa masuk dengan kode undangan yang benar.
-- ============================================================

create or replace function public.create_pocket(p_name text, p_display text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_pocket public.pockets;
begin
  if v_uid is null then
    raise exception 'TIDAK_LOGIN';
  end if;

  insert into public.pockets (name, created_by)
  values (trim(p_name), v_uid)
  returning * into v_pocket;

  insert into public.pocket_members (pocket_id, user_id, display_name, role)
  values (v_pocket.id, v_uid, trim(p_display), 'owner');

  return json_build_object(
    'id', v_pocket.id,
    'name', v_pocket.name,
    'invite_code', v_pocket.invite_code
  );
end;
$$;

create or replace function public.join_pocket(p_code text, p_display text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_pocket public.pockets;
begin
  if v_uid is null then
    raise exception 'TIDAK_LOGIN';
  end if;

  select * into v_pocket
  from public.pockets
  where invite_code = upper(trim(p_code));

  if not found then
    raise exception 'KODE_TIDAK_VALID';
  end if;

  insert into public.pocket_members (pocket_id, user_id, display_name, role)
  values (v_pocket.id, v_uid, trim(p_display), 'member')
  on conflict (pocket_id, user_id) do nothing;

  return json_build_object(
    'id', v_pocket.id,
    'name', v_pocket.name,
    'invite_code', v_pocket.invite_code
  );
end;
$$;

revoke execute on function public.create_pocket(text, text) from public, anon;
revoke execute on function public.join_pocket(text, text)   from public, anon;
grant  execute on function public.create_pocket(text, text) to authenticated;
grant  execute on function public.join_pocket(text, text)   to authenticated;

-- ============================================================
-- 4. Aturan keamanan (Row Level Security)
--    Hanya anggota kantong yang bisa membaca dan menulis datanya.
-- ============================================================

alter table public.pockets        enable row level security;
alter table public.pocket_members enable row level security;
alter table public.expenses       enable row level security;

-- Kantong
drop policy if exists "anggota melihat kantong"  on public.pockets;
drop policy if exists "pemilik mengubah kantong" on public.pockets;
drop policy if exists "pemilik menghapus kantong" on public.pockets;

create policy "anggota melihat kantong" on public.pockets
  for select to authenticated using (public.is_member(id));
create policy "pemilik mengubah kantong" on public.pockets
  for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));
create policy "pemilik menghapus kantong" on public.pockets
  for delete to authenticated using (public.is_owner(id));

-- Anggota (menambah anggota hanya lewat fungsi join_pocket / create_pocket)
drop policy if exists "anggota melihat anggota"   on public.pocket_members;
drop policy if exists "ubah nama sendiri"         on public.pocket_members;
drop policy if exists "keluar dari kantong"       on public.pocket_members;

create policy "anggota melihat anggota" on public.pocket_members
  for select to authenticated using (public.is_member(pocket_id));
create policy "ubah nama sendiri" on public.pocket_members
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "keluar dari kantong" on public.pocket_members
  for delete to authenticated using (user_id = auth.uid());

-- Anggota hanya boleh mengubah kolom nama tampilan, bukan peran.
revoke update on public.pocket_members from authenticated;
grant  update (display_name) on public.pocket_members to authenticated;

-- Pengeluaran
drop policy if exists "anggota melihat pengeluaran" on public.expenses;
drop policy if exists "anggota mencatat pengeluaran" on public.expenses;
drop policy if exists "ubah pengeluaran sendiri"    on public.expenses;
drop policy if exists "hapus pengeluaran"           on public.expenses;

create policy "anggota melihat pengeluaran" on public.expenses
  for select to authenticated using (public.is_member(pocket_id));
create policy "anggota mencatat pengeluaran" on public.expenses
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(pocket_id));
create policy "ubah pengeluaran sendiri" on public.expenses
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member(pocket_id));
-- Hapus: pencatatnya sendiri, atau pemilik kantong.
create policy "hapus pengeluaran" on public.expenses
  for delete to authenticated
  using (public.is_member(pocket_id) and (user_id = auth.uid() or public.is_owner(pocket_id)));

-- ============================================================
-- 5. Pembaruan langsung (realtime) untuk pengeluaran
-- ============================================================

do $$
begin
  alter publication supabase_realtime add table public.expenses;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
