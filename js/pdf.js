// Pembuat PDF rekap bulanan. Butuh jsPDF (dimuat lewat <script> di index.html).
import {
  CAT, pad, rp, rps, pct, bounds, periodLabel, summarize, elapsedDays, balanceInfo, byUser,
} from './util.js';

const latin = (s) => String(s == null ? '' : s).replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

// entries: daftar pengeluaran, names: {userId: nama}, anchor: tanggal di bulan yang dicetak
export function buildPdf({ jsPDF, entries, names, anchor, pocketName, balance }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const b = bounds('bulan', anchor);
  const r = summarize(entries, b);
  const mlabel = periodLabel('bulan', b);
  const W = 210, M = 16, R = W - M, BOT = 282;
  let y = M;

  const GREEN = [14, 124, 107], PINK = [194, 65, 122], INK = [20, 35, 30];
  const MUTED = [88, 105, 95], LINE = [211, 221, 214], SOFT = [236, 242, 238];

  const txt = (s, x, yy, o) => doc.text(latin(s), x, yy, o);
  const font = (sz, bold, c) => {
    const k = c || INK;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(sz);
    doc.setTextColor(k[0], k[1], k[2]);
  };
  const fit = (s, w) => {
    const l = doc.splitTextToSize(latin(s), w);
    return l.length > 1 ? l[0].slice(0, -2) + '..' : (l[0] || '');
  };
  const rule = (yy) => {
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.2);
    doc.line(M, yy, R, yy);
  };
  const fill = (c) => doc.setFillColor(c[0], c[1], c[2]);

  // Judul
  font(20, true); txt('Rekap Pengeluaran', M, y + 6); y += 13;
  font(13, false, MUTED); txt(mlabel, M, y); y += 6;
  font(9, false, MUTED);
  txt('Pocket`nt - ' + (pocketName || 'Kantong') + ' - dibuat ' +
    new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }), M, y);
  y += 9;

  // Kotak total
  const days = elapsedDays(b);
  fill(SOFT); doc.roundedRect(M, y, R - M, 27, 2, 2, 'F');
  font(9, false, MUTED); txt('Total pengeluaran', M + 5, y + 7);
  font(22, true); txt(rp(r.total), M + 5, y + 19);
  font(9, false, MUTED); txt('Jumlah catatan', R - 5, y + 7, { align: 'right' });
  font(12, true); txt(String(r.count), R - 5, y + 13, { align: 'right' });
  font(9, false, MUTED); txt('Rata-rata per hari', R - 5, y + 19, { align: 'right' });
  font(11, true); txt(days ? rp(r.total / days) : '-', R - 5, y + 25, { align: 'right' });
  y += 36;

  // Saldo kantong (hanya bila pemilik sudah mengisi saldo awal)
  if (balance && balance.opening > 0) {
    const bi = balanceInfo(entries, balance.opening, balance.from || '0000-00-00');
    fill(SOFT); doc.roundedRect(M, y - 6, R - M, 20, 2, 2, 'F');
    font(9, false, MUTED);
    txt('Saldo kantong' + (balance.from ? ' sejak ' + balance.from.split('-').reverse().join('/') : '') + ' (seluruh anggota)', M + 5, y);
    font(10, false); txt('Saldo awal ' + rp(bi.opening) + '  |  Terpakai ' + rp(bi.spent), M + 5, y + 7);
    font(11, true, bi.left < 0 ? [179, 38, 30] : GREEN); txt('Sisa ' + rps(bi.left), R - 5, y + 7, { align: 'right' });
    y += 26;
  }

  // Primer dan sekunder
  font(12, true); txt('Kebutuhan primer dan sekunder', M, y); y += 5;
  const bw = R - M, pw = r.total ? (bw * r.p) / r.total : 0;
  fill(LINE); doc.rect(M, y, bw, 4, 'F');
  if (r.total) { fill(PINK); doc.rect(M, y, bw, 4, 'F'); }
  if (pw > 0) { fill(GREEN); doc.rect(M, y, pw, 4, 'F'); }
  y += 11;
  [['Kebutuhan primer', r.p, GREEN], ['Kebutuhan sekunder', r.s, PINK]].forEach((row) => {
    fill(row[2]); doc.rect(M, y - 3, 3, 3, 'F');
    font(10, false); txt(row[0], M + 6, y);
    font(10, true); txt(rp(row[1]), R - 18, y, { align: 'right' });
    font(10, false, MUTED); txt(pct(row[1], r.total), R, y, { align: 'right' });
    y += 6;
  });
  y += 6;

  // Per kategori
  font(12, true); txt('Per kategori', M, y); y += 6;
  const cats = Object.keys(r.byCat).sort((a, c) => r.byCat[c] - r.byCat[a]);
  if (!cats.length) {
    font(10, false, MUTED); txt('Belum ada pengeluaran di bulan ini.', M, y); y += 8;
  } else {
    font(9, true, MUTED);
    txt('Kategori', M, y); txt('Jenis', 100, y);
    txt('Jumlah', R - 18, y, { align: 'right' }); txt('%', R, y, { align: 'right' });
    y += 2; rule(y); y += 5;
    cats.forEach((id) => {
      if (y > BOT - 10) { doc.addPage(); y = M; }
      const c = CAT[id];
      font(10, false); txt(c.label, M, y);
      font(10, false, MUTED); txt(c.type === 'primer' ? 'Primer' : 'Sekunder', 100, y);
      font(10, true); txt(rp(r.byCat[id]), R - 18, y, { align: 'right' });
      font(10, false, MUTED); txt(pct(r.byCat[id], r.total), R, y, { align: 'right' });
      y += 6;
    });
    y += 4;
  }

  // Per anggota
  const um = byUser(entries, b);
  const uids = Object.keys(um).sort((a, c) => um[c].total - um[a].total);
  if (uids.length) {
    if (y > BOT - 24) { doc.addPage(); y = M; }
    font(12, true); txt('Per anggota', M, y); y += 6;
    font(9, true, MUTED);
    txt('Anggota', M, y); txt('Catatan', 100, y);
    txt('Jumlah', R - 18, y, { align: 'right' }); txt('%', R, y, { align: 'right' });
    y += 2; rule(y); y += 5;
    uids.forEach((id) => {
      if (y > BOT - 10) { doc.addPage(); y = M; }
      font(10, false); txt(fit((names && names[id]) || 'Anggota', 80), M, y);
      font(10, false, MUTED); txt(String(um[id].count), 100, y);
      font(10, true); txt(rp(um[id].total), R - 18, y, { align: 'right' });
      font(10, false, MUTED); txt(pct(um[id].total, r.total), R, y, { align: 'right' });
      y += 6;
    });
    y += 4;
  }

  // Rincian transaksi
  if (r.list.length) {
    if (y > BOT - 30) { doc.addPage(); y = M; }
    font(12, true); txt('Rincian transaksi', M, y); y += 6;
    const head = () => {
      font(9, true, MUTED);
      txt('Tanggal', M, y); txt('Kategori', 40, y); txt('Catatan', 88, y); txt('Oleh', 138, y);
      txt('Jumlah', R, y, { align: 'right' });
      y += 2; rule(y); y += 5;
    };
    head();
    const list = r.list.slice().sort((a, c) =>
      a.date < c.date ? -1 : a.date > c.date ? 1 : (a.createdAt || 0) - (c.createdAt || 0));
    list.forEach((e) => {
      if (y > BOT) { doc.addPage(); y = M; head(); }
      const c = CAT[e.category] || CAT.lain;
      font(9, false);
      txt(e.date.split('-').reverse().join('/'), M, y);
      txt(fit(c.label, 44), 40, y);
      txt(fit(e.note || '-', 46), 88, y);
      txt(fit((names && names[e.by]) || 'Anggota', 24), 138, y);
      font(9, true); txt(rp(e.amount), R, y, { align: 'right' });
      y += 6;
    });
    rule(y - 3); y += 3;
    font(10, true); txt('Total', M, y); txt(rp(r.total), R, y, { align: 'right' });
  }

  // Nomor halaman
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    font(8, false, MUTED);
    txt('Halaman ' + i + ' dari ' + n, W / 2, 292, { align: 'center' });
  }

  return {
    blob: doc.output('blob'),
    name: 'pengeluaran-' + b[0].getFullYear() + '-' + pad(b[0].getMonth() + 1) + '.pdf',
  };
}
