// Pembuat grafik SVG (donat per kategori, batang per hari). Mengembalikan string HTML.
import { CAT, esc, rp, rpc, pct, cf, ymd, today, niceMax } from './util.js';

export function donutHTML(r) {
  const C = 2 * Math.PI * 70;
  const items = Object.keys(r.byCat)
    .map((id) => ({ c: CAT[id], v: r.byCat[id] }))
    .sort((a, b) => b.v - a.v);

  let svg = '<svg viewBox="0 0 200 200" class="donutsvg" role="img" aria-label="Pengeluaran per kategori">' +
    '<circle class="ring' + (r.total ? '' : ' empty') + '" cx="100" cy="100" r="70"/>';
  let off = 0;
  items.forEach((it) => {
    const len = (it.v / r.total) * C;
    const gap = items.length > 1 ? Math.min(2, len * 0.3) : 0;
    svg += '<circle class="seg" style="--h:' + it.c.h + '" cx="100" cy="100" r="70" transform="rotate(-90 100 100)"' +
      ' stroke-dasharray="' + (len - gap).toFixed(2) + ' ' + (C - len + gap).toFixed(2) + '"' +
      ' stroke-dashoffset="' + (-off).toFixed(2) + '"/>';
    off += len;
  });
  svg += '<text class="dn" x="100" y="102">' + rpc(r.total) + '</text>' +
    '<text class="dl" x="100" y="118">total</text></svg>';

  let legend;
  if (!items.length) {
    legend = '<div class="empty"><strong>Belum ada pengeluaran</strong>' +
      '<p class="msg">Isi form untuk mencatat yang pertama di periode ini.</p></div>';
  } else {
    legend = '<ul class="clean legend">' + items.map((it) =>
      '<li><i class="dot" style="--h:' + it.c.h + '"></i><span class="ln">' + esc(it.c.label) +
      '<span class="tag">' + (it.c.type === 'primer' ? 'Primer' : 'Sekunder') + '</span></span>' +
      '<span class="lv">' + rp(it.v) + '</span><span class="lp">' + pct(it.v, r.total) + '</span></li>'
    ).join('') + '</ul>';
  }
  return '<div class="donutwrap">' + svg + legend + '</div>';
}

export function barsSVG(days, byDay) {
  const W = 640, H = 230, L = 46, R = 6, T = 10, B = 26;
  const pw = W - L - R, ph = H - T - B;
  let mx = 0;
  days.forEach((d) => { const v = byDay[ymd(d)]; if (v) mx = Math.max(mx, v.p + v.s); });
  const top = niceMax(mx), n = days.length, bw = pw / n, w = Math.min(bw * 0.7, 40);
  const yb = T + ph, t0 = ymd(today());

  let out = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="barsvg" role="img" aria-label="Pengeluaran per hari, primer dan sekunder">';
  [0, 0.5, 1].forEach((f) => {
    const y = yb - ph * f;
    out += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/>' +
      '<text class="tx" x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + cf.format(top * f) + '</text>';
  });
  days.forEach((d, i) => {
    const key = ymd(d), v = byDay[key] || { p: 0, s: 0 };
    const x = L + bw * i + (bw - w) / 2;
    const hp = (ph * v.p) / top, hs = (ph * v.s) / top;
    const tip = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }) +
      ': primer ' + rp(v.p) + ', sekunder ' + rp(v.s);
    out += '<g><title>' + esc(tip) + '</title><rect class="hit" x="' + (L + bw * i) + '" y="' + T +
      '" width="' + bw + '" height="' + ph + '"/>';
    if (hp > 0) out += '<rect class="bp" x="' + x + '" y="' + (yb - hp) + '" width="' + w + '" height="' + hp + '"/>';
    if (hs > 0) out += '<rect class="bs" x="' + x + '" y="' + (yb - hp - hs) + '" width="' + w + '" height="' + hs + '"/>';
    out += '</g>';
    let show, text;
    if (n <= 7) {
      show = true;
      text = d.toLocaleDateString('id-ID', { weekday: 'short' }) + ' ' + d.getDate();
    } else {
      show = d.getDate() === 1 || d.getDate() % 5 === 0;
      text = String(d.getDate());
    }
    if (show) {
      out += '<text class="tx' + (key === t0 ? ' today' : '') + '" x="' + (L + bw * i + bw / 2) +
        '" y="' + (H - 8) + '" text-anchor="middle">' + text + '</text>';
    }
  });
  return out + '</svg>';
}
