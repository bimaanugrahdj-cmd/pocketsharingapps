// Semua percakapan dengan Supabase ada di file ini.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Hanya ambil bagian alamat dasarnya (https://xxxx.supabase.co), buang garis miring
// atau sisa jalur seperti /rest/v1/ yang kadang ikut tersalin.
function baseUrl(raw) {
  try { return new URL(String(raw).trim()).origin; } catch (e) { return ''; }
}
const URL_CLEAN = baseUrl(SUPABASE_URL);

export const configured =
  /^https:\/\//.test(URL_CLEAN) && !SUPABASE_URL.includes('GANTI') &&
  SUPABASE_ANON_KEY.trim().length > 20 && !SUPABASE_ANON_KEY.includes('GANTI');

const sb = configured
  ? createClient(URL_CLEAN, SUPABASE_ANON_KEY.trim(), {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

function check({ data, error }) {
  if (error) throw error;
  return data;
}

// Bentuk baris database -> bentuk yang dipakai aplikasi.
function norm(row) {
  return {
    id: row.id,
    by: row.user_id,
    amount: Number(row.amount),
    category: row.category,
    note: row.note || '',
    date: row.spent_on,
    createdAt: row.created_at ? Date.parse(row.created_at) : 0,
  };
}

/* ---------- akun ---------- */
export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
export function onAuth(cb) {
  return sb.auth.onAuthStateChange((evt, session) => cb(evt, session));
}
export async function signUp(email, password, name) {
  return check(await sb.auth.signUp({ email, password, options: { data: { name } } }));
}
export async function signIn(email, password) {
  return check(await sb.auth.signInWithPassword({ email, password }));
}
export async function signOut() {
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

/* ---------- kantong ---------- */
export async function myPockets(userId) {
  const rows = check(await sb
    .from('pocket_members')
    .select('role, display_name, joined_at, pockets(id, name, invite_code, opening_balance, balance_from)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true }));
  return rows
    .filter((r) => r.pockets)
    .map((r) => ({
      id: r.pockets.id,
      name: r.pockets.name,
      code: r.pockets.invite_code,
      role: r.role,
      displayName: r.display_name,
      openingBalance: Number(r.pockets.opening_balance || 0),
      balanceFrom: r.pockets.balance_from || '',
    }));
}
function pocketFromJson(j, role, displayName) {
  return { id: j.id, name: j.name, code: j.invite_code, role, displayName, openingBalance: 0, balanceFrom: '' };
}
// Hanya pemilik yang lolos aturan keamanan; selain pemilik, tidak ada baris yang berubah.
export async function setBalance(pocketId, amount, from) {
  const { data, error } = await sb
    .from('pockets')
    .update({ opening_balance: amount, balance_from: from })
    .eq('id', pocketId)
    .select('id, opening_balance, balance_from');
  if (error) throw error;
  if (!data || !data.length) throw new Error('BUKAN_PEMILIK');
  return { openingBalance: Number(data[0].opening_balance), balanceFrom: data[0].balance_from };
}
export async function createPocket(name, displayName) {
  const j = check(await sb.rpc('create_pocket', { p_name: name, p_display: displayName }));
  return pocketFromJson(j, 'owner', displayName);
}
export async function joinPocket(code, displayName) {
  const j = check(await sb.rpc('join_pocket', { p_code: code, p_display: displayName }));
  // Kalau sudah anggota sebelumnya, peran asli dibaca ulang lewat myPockets().
  return pocketFromJson(j, 'member', displayName);
}
export async function members(pocketId) {
  const rows = check(await sb
    .from('pocket_members')
    .select('user_id, display_name, role')
    .eq('pocket_id', pocketId));
  return rows.map((r) => ({ id: r.user_id, name: r.display_name, role: r.role }));
}

/* ---------- pengeluaran ---------- */
const COLS = 'id, user_id, amount, category, note, spent_on, created_at';

export async function listExpenses(pocketId) {
  const size = 1000;
  let all = [];
  for (let from = 0; ; from += size) {
    const rows = check(await sb
      .from('expenses')
      .select(COLS)
      .eq('pocket_id', pocketId)
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + size - 1));
    all = all.concat(rows.map(norm));
    if (rows.length < size) break;
  }
  return all;
}
export async function addExpense({ pocketId, amount, category, note, date }) {
  const row = check(await sb
    .from('expenses')
    .insert({ pocket_id: pocketId, amount, category, note: note || null, spent_on: date })
    .select(COLS)
    .single());
  return norm(row);
}
export async function deleteExpense(id) {
  const { error } = await sb.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

// Pembaruan langsung dari anggota lain. Mengembalikan fungsi untuk berhenti.
export function subscribe(pocketId, { onInsert, onDelete, onStatus }) {
  const ch = sb
    .channel('expenses-' + pocketId)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'expenses', filter: 'pocket_id=eq.' + pocketId },
      (p) => onInsert(norm(p.new)))
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'expenses' },
      (p) => { if (p.old && p.old.id) onDelete(p.old.id); })
    .subscribe((status) => { if (onStatus) onStatus(status); });
  return () => { sb.removeChannel(ch); };
}
