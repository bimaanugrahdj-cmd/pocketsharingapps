// Fungsi murni: kategori, tanggal, format rupiah, ringkasan. Tidak menyentuh DOM atau jaringan.

export const CATS = [
  { id: 'makanan',    label: 'Makanan & minuman',        type: 'primer',   h: 168 },
  { id: 'transport',  label: 'Transportasi',             type: 'primer',   h: 196 },
  { id: 'tagihan',    label: 'Listrik, air & internet',  type: 'primer',   h: 222 },
  { id: 'rumah',      label: 'Sewa & rumah tangga',      type: 'primer',   h: 146 },
  { id: 'kesehatan',  label: 'Kesehatan',                type: 'primer',   h: 240 },
  { id: 'pendidikan', label: 'Pendidikan',               type: 'primer',   h: 254 },
  { id: 'hiburan',    label: 'Hiburan',                  type: 'sekunder', h: 318 },
  { id: 'belanja',    label: 'Belanja pakaian & gadget', type: 'sekunder', h: 342 },
  { id: 'kafe',       label: 'Nongkrong & kafe',         type: 'sekunder', h: 12 },
  { id: 'langganan',  label: 'Langganan digital',        type: 'sekunder', h: 34 },
  { id: 'hobi',       label: 'Hobi',                     type: 'sekunder', h: 296 },
  { id: 'lain',       label: 'Lainnya',                  type: 'sekunder', h: 54 },
];
export const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
export const TYPE_LABEL = { primer: 'Kebutuhan primer', sekunder: 'Kebutuhan sekunder' };

export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const parse = (s) => { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const nf = new Intl.NumberFormat('id-ID');
export const cf = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
export const rp = (n) => 'Rp ' + nf.format(Math.round(n));
export const rpc = (n) => 'Rp ' + cf.format(n);
export const pct = (v, t) => {
  if (!t) return '0%';
  const p = (v / t) * 100;
  return p > 0 && p < 1 ? '<1%' : Math.round(p) + '%';
};

// Periode: 'hari' | 'minggu' (Senin sampai Minggu) | 'bulan'
export function bounds(mode, a) {
  if (mode === 'hari') return [a, a];
  if (mode === 'minggu') {
    const s = addDays(a, -((a.getDay() + 6) % 7));
    return [s, addDays(s, 6)];
  }
  return [new Date(a.getFullYear(), a.getMonth(), 1), new Date(a.getFullYear(), a.getMonth() + 1, 0)];
}
export function shift(mode, a, dir) {
  if (mode === 'hari') return addDays(a, dir);
  if (mode === 'minggu') return addDays(a, 7 * dir);
  return new Date(a.getFullYear(), a.getMonth() + dir, 1);
}
export function periodLabel(mode, b) {
  const s = b[0], e = b[1];
  if (mode === 'hari') return s.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (mode === 'bulan') return s.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const ms = s.toLocaleDateString('id-ID', { month: 'short' });
  const me = e.toLocaleDateString('id-ID', { month: 'short' });
  if (s.getMonth() === e.getMonth()) return s.getDate() + '–' + e.getDate() + ' ' + me + ' ' + e.getFullYear();
  return s.getDate() + ' ' + ms + ' – ' + e.getDate() + ' ' + me + ' ' + e.getFullYear();
}

// entries: [{id, by, amount:number, category, note, date:'YYYY-MM-DD', createdAt:number}]
export function summarize(entries, b) {
  const s = ymd(b[0]), e = ymd(b[1]);
  const r = { p: 0, s: 0, total: 0, count: 0, byCat: {}, byDay: {}, list: [] };
  entries.forEach((x) => {
    if (typeof x.amount !== 'number' || typeof x.date !== 'string' || x.date < s || x.date > e) return;
    const c = CAT[x.category] || CAT.lain;
    r.total += x.amount;
    r.count++;
    if (c.type === 'primer') r.p += x.amount; else r.s += x.amount;
    r.byCat[c.id] = (r.byCat[c.id] || 0) + x.amount;
    const d = r.byDay[x.date] || (r.byDay[x.date] = { p: 0, s: 0 });
    d[c.type === 'primer' ? 'p' : 's'] += x.amount;
    r.list.push(x);
  });
  return r;
}

// Jumlah hari yang sudah berjalan di periode (untuk rata-rata per hari).
export function elapsedDays(b) {
  const t = today();
  const end = t < b[1] ? t : b[1];
  return end < b[0] ? 0 : Math.round((end - b[0]) / 864e5) + 1;
}

export function niceMax(m) {
  if (m <= 0) return 100000;
  const pow = Math.pow(10, Math.floor(Math.log10(m)));
  const n = m / pow;
  const k = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return k * pow;
}

// Format rupiah dengan tanda minus di depan "Rp" bila negatif.
export const rps = (n) => (n < 0 ? '-Rp ' + nf.format(Math.round(Math.abs(n))) : rp(n));

// Saldo kantong: saldo awal dikurangi seluruh pengeluaran sejak tanggal `from` ('YYYY-MM-DD').
export function balanceInfo(entries, opening, from) {
  let spent = 0;
  entries.forEach((x) => {
    if (typeof x.amount === 'number' && typeof x.date === 'string' && x.date >= from) spent += x.amount;
  });
  return { opening, spent, left: opening - spent, ratio: opening > 0 ? Math.min(spent / opening, 1) : 0 };
}

// Total pengeluaran per pencatat dalam satu periode: { userId: {total, count} }
export function byUser(entries, b) {
  const s = ymd(b[0]), e = ymd(b[1]), m = {};
  entries.forEach((x) => {
    if (typeof x.amount !== 'number' || typeof x.date !== 'string' || x.date < s || x.date > e) return;
    const u = m[x.by] || (m[x.by] = { total: 0, count: 0 });
    u.total += x.amount;
    u.count++;
  });
  return m;
}
