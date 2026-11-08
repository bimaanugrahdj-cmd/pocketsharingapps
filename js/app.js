// Logika tampilan Pocket`nt: masuk, kantong, pencatatan, grafik, riwayat, undangan, PDF.
import * as api from './api.js';
import {
  CATS, CAT, TYPE_LABEL, ymd, today, addDays, esc, nf, rp, rps, pct,
  bounds, shift, periodLabel, summarize, elapsedDays, balanceInfo, byUser,
} from './util.js';
import { donutHTML, barsSVG } from './charts.js';
import { buildPdf } from './pdf.js';

const $ = (id) => document.getElementById(id);

const state = {
  mode: 'bulan', anchor: today(),
  entries: [], names: {}, memberList: [],
  user: null, myName: '', pockets: [], pocket: null,
  loaded: false, pendingDel: null, unsub: null, authMode: 'login', filterUser: '',
};
let delTimer = null, pdfTimer = null, opening = 0;

/* ---------- bantu ---------- */
const VIEWS = ['boot', 'cfg', 'auth', 'setup', 'main'];
function show(v) { VIEWS.forEach((id) => { $(id).hidden = id !== v; }); }

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }

function errMsg(e) {
  const m = String((e && e.message) || e || '');
  if (/Invalid login credentials/i.test(m)) return 'Email atau kata sandi salah.';
  if (/already registered|already been registered/i.test(m)) return 'Email sudah terdaftar. Silakan masuk.';
  if (/Email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Cek kotak masuk emailmu.';
  if (/at least 6|Password should be/i.test(m)) return 'Kata sandi minimal 6 karakter.';
  if (/rate limit|too many/i.test(m)) return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  if (/KODE_TIDAK_VALID/.test(m)) return 'Kode undangan tidak ditemukan. Periksa lagi penulisannya.';
  if (/BUKAN_PEMILIK/.test(m)) return 'Hanya pemilik kantong yang bisa mengubah saldo awal.';
  if (/opening_balance|balance_from/i.test(m)) return 'Database belum diperbarui. Jalankan supabase/migrasi-saldo.sql di SQL Editor Supabase.';
  if (/TIDAK_LOGIN|JWT|not authenticated/i.test(m)) return 'Sesi berakhir. Silakan masuk lagi.';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return 'Tidak bisa terhubung. Periksa koneksi internetmu.';
  if (/row-level security|permission denied/i.test(m)) return 'Kamu tidak punya izin untuk tindakan ini.';
  if (/violates check constraint/i.test(m)) return 'Isian tidak valid. Periksa jumlah dan kategorinya.';
  if (/signups? (are )?(not allowed|disabled)/i.test(m)) return 'Pendaftaran akun baru dimatikan di pengaturan Supabase (Authentication).';
  if (/email address .*invalid|invalid email|unable to validate email/i.test(m)) return 'Alamat email ditolak. Pakai email asli yang valid.';
  if (/invalid api ?key|apikey|No API key/i.test(m)) return 'Kunci Supabase di js/config.js ditolak. Periksa lagi isinya.';
  if (/over_email_send_rate_limit|email rate limit/i.test(m)) return 'Batas pengiriman email Supabase tercapai. Tunggu sekitar satu jam, atau matikan konfirmasi email.';
  const detail = m.replace(/\s+/g, ' ').slice(0, 160);
  return 'Terjadi masalah' + (detail ? ' (' + detail + ')' : '') + '. Coba lagi.';
}
function setMsg(id, text, kind) {
  const el = $(id);
  el.textContent = text || '';
  el.className = 'fmsg' + (kind ? ' ' + kind : '');
}
function showNotice(text) {
  const n = $('notice');
  n.textContent = text || '';
  n.hidden = !text;
}
function setSync(s) {
  const txt = { loading: 'Memuat…', ok: 'Tersinkron', error: 'Tidak terhubung' }[s] || '';
  $('sync').setAttribute('data-s', s === 'ok' ? 'ok' : s === 'error' ? 'error' : 'loading');
  $('synctxt').textContent = txt;
}
const who = (id) => (state.user && id === state.user.id ? 'Kamu' : state.names[id] || 'Anggota');
const canDelete = (e) => !!state.user && (e.by === state.user.id || (state.pocket && state.pocket.role === 'owner'));

/* ---------- ringkasan ---------- */
function renderSummary(r, prev, b) {
  const days = elapsedDays(b);
  const avg = days ? r.total / days : 0;
  const prevName = { hari: 'kemarin', minggu: 'minggu lalu', bulan: 'bulan lalu' }[state.mode];
  let cmp = '—';
  if (prev.total > 0) {
    const d = Math.round(((r.total - prev.total) / prev.total) * 100);
    cmp = (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '') + Math.abs(d) + '%';
  } else if (r.total > 0) {
    cmp = 'Belum ada pembanding';
  }
  let second;
  if (state.mode === 'hari') {
    const top = Object.keys(r.byCat).sort((a, c) => r.byCat[c] - r.byCat[a])[0];
    second = '<div class="stat"><div class="k">Terbesar</div><div class="v">' + (top ? esc(CAT[top].label) : '—') + '</div></div>';
  } else {
    second = '<div class="stat"><div class="k">Rata-rata per hari</div><div class="v">' + (days ? rp(avg) : '—') + '</div></div>';
  }
  const pp = r.total ? (r.p / r.total) * 100 : 0;
  const ps = r.total ? (r.s / r.total) * 100 : 0;
  $('sum').innerHTML =
    '<div class="eyebrow">Total pengeluaran' + (state.filterUser ? ' · ' + esc(who(state.filterUser)) : '') + '</div>' +
    '<div class="total">' + rp(r.total) + '</div>' +
    '<div class="split" role="img" aria-label="Primer ' + pct(r.p, r.total) + ', sekunder ' + pct(r.s, r.total) + '">' +
      '<span class="sp-p" style="width:' + pp + '%"></span><span class="sp-s" style="width:' + ps + '%"></span></div>' +
    '<div class="split-legend">' +
      '<div><i class="sw p"></i>Kebutuhan primer <b>' + rp(r.p) + '</b><span class="pc">' + pct(r.p, r.total) + '</span></div>' +
      '<div><i class="sw s"></i>Kebutuhan sekunder <b>' + rp(r.s) + '</b><span class="pc">' + pct(r.s, r.total) + '</span></div>' +
    '</div>' +
    '<div class="stats">' +
      '<div class="stat"><div class="k">Jumlah catatan</div><div class="v">' + r.count + '</div></div>' +
      second +
      '<div class="stat"><div class="k">Dibanding ' + prevName + '</div><div class="v">' + esc(cmp) + '</div></div>' +
    '</div>';
}

function renderCharts(r, b) {
  let html = '<div class="card"><h2>Per kategori</h2>' + donutHTML(r) + '</div>';
  if (state.mode !== 'hari') {
    const days = [];
    for (let d = b[0]; d <= b[1]; d = addDays(d, 1)) days.push(d);
    html += '<div class="card"><h2>Per hari</h2>' +
      '<div class="barkey"><span><i class="sw p"></i>Primer</span><span><i class="sw s"></i>Sekunder</span></div>' +
      '<div class="scroll">' + barsSVG(days, r.byDay) + '</div></div>';
  }
  $('charts').innerHTML = html;
}

function dayLabel(s) {
  const p = s.split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
}

function renderList(r) {
  const el = $('list');
  if (!r.list.length) {
    el.innerHTML = '<div class="empty"><strong>Belum ada catatan</strong>' +
      '<p class="msg">Pengeluaran yang dicatat siapa saja di kantong ini muncul di sini, dikelompokkan per tanggal.</p></div>';
    return;
  }
  r.list.sort((a, c) => (a.date < c.date ? 1 : a.date > c.date ? -1 : (c.createdAt || 0) - (a.createdAt || 0)));
  let html = '<h2>Riwayat</h2>', cur = '';
  r.list.forEach((e) => {
    if (e.date !== cur) {
      if (cur) html += '</ul>';
      cur = e.date;
      const dd = r.byDay[cur];
      html += '<div class="dayhead"><span>' + esc(dayLabel(cur)) + '</span><span>' + rp(dd.p + dd.s) + '</span></div><ul class="clean rows">';
    }
    const c = CAT[e.category] || CAT.lain, sure = state.pendingDel === e.id;
    html += '<li><i class="dot" style="--h:' + c.h + '"></i><div><div class="rt">' + esc(e.note || c.label) + '</div>' +
      '<div class="rs">' + esc(c.label) + ' · ' + (c.type === 'primer' ? 'Primer' : 'Sekunder') + ' · ' + esc(who(e.by)) + '</div></div>' +
      '<div class="ra">' + rp(e.amount) + '</div>' +
      (canDelete(e)
        ? '<button type="button" class="del' + (sure ? ' sure' : '') + '" data-del="' + esc(e.id) + '">' + (sure ? 'Yakin hapus?' : 'Hapus') + '</button>'
        : '<span></span>') +
      '</li>';
  });
  el.innerHTML = html + '</ul>';
  if (state.pendingDel) {
    const f = el.querySelector('[data-del="' + state.pendingDel + '"]');
    if (f) f.focus();
  }
}

/* ---------- saldo kantong ---------- */
function renderBalance() {
  const p = state.pocket, el = $('baldisplay');
  const isOwner = p.role === 'owner';
  const opening = p.openingBalance || 0;
  if (!opening) {
    el.innerHTML = '<div class="eyebrow">Saldo kantong</div>' +
      '<div class="balempty"><strong>Saldo awal belum diisi</strong>' +
      '<p class="msg">' + (isOwner
        ? 'Isi saldo awal supaya setiap pengeluaran mengurangi sisa saldo kantong ini.'
        : 'Pemilik kantong belum mengisi saldo awal.') + '</p>' +
      (isOwner ? '<button type="button" class="ghost" data-act="editbal">Atur saldo awal</button>' : '') + '</div>';
    return;
  }
  const from = p.balanceFrom || '0000-00-00';
  const bi = balanceInfo(state.entries, opening, from);
  const cls = bi.left < 0 ? 'over' : bi.left < opening * 0.2 ? 'low' : '';
  const sejak = p.balanceFrom ? ' sejak ' + dayLabel(p.balanceFrom) + ' ' + p.balanceFrom.slice(0, 4) : '';
  let warn = '';
  if (bi.left < 0) warn = '<p class="balwarn over">Pengeluaran melebihi saldo awal sebesar ' + rp(-bi.left) + '.</p>';
  else if (bi.left === 0) warn = '<p class="balwarn over">Saldo sudah habis.</p>';
  else if (cls === 'low') warn = '<p class="balwarn">Sisa saldo kurang dari 20%.</p>';
  el.innerHTML =
    '<div class="baltop"><div><div class="eyebrow">Sisa saldo</div>' +
      '<div class="balnum ' + cls + '">' + rps(bi.left) + '</div></div>' +
      (isOwner ? '<button type="button" class="ghost" data-act="editbal">Ubah</button>' : '') + '</div>' +
    '<div class="balbar ' + cls + '" role="img" aria-label="Terpakai ' + pct(bi.spent, opening) + ' dari saldo awal">' +
      '<i style="width:' + (bi.ratio * 100) + '%"></i></div>' +
    '<div class="balmeta">Terpakai ' + rp(bi.spent) + ' dari saldo awal ' + rp(opening) +
      ' (' + pct(bi.spent, opening) + ')' + sejak + '. Dihitung untuk seluruh anggota.</div>' + warn;
}

/* ---------- per anggota ---------- */
function personName(id) {
  if (state.user && id === state.user.id) return (state.names[id] || state.myName || 'Kamu') + ' (kamu)';
  return who(id);
}
function renderWho(b) {
  const m = byUser(state.entries, b);
  const ids = state.memberList.map((x) => x.id);
  Object.keys(m).forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); });
  const rows = ids.map((id) => ({ id, t: m[id] ? m[id].total : 0, n: m[id] ? m[id].count : 0 }))
    .sort((a, c) => c.t - a.t);
  const total = rows.reduce((s, x) => s + x.t, 0);
  let html = '<h2>Per anggota</h2>';
  if (!rows.length) {
    $('who').innerHTML = html + '<p class="msg">Belum ada anggota.</p>';
    return;
  }
  html += '<div class="whohead"><span class="msg">Ketuk nama untuk melihat pengeluaran orang itu saja.</span>' +
    (state.filterUser ? '<button type="button" class="ghost" data-user="">Tampilkan semua</button>' : '') + '</div>' +
    '<ul class="clean who">';
  rows.forEach((x) => {
    const sel = state.filterUser === x.id;
    html += '<li><button type="button" class="whorow" data-user="' + esc(x.id) + '" aria-pressed="' + (sel ? 'true' : 'false') + '">' +
      '<span class="wn">' + esc(personName(x.id)) + '</span><span class="wv">' + rp(x.t) + '</span>' +
      '<span class="wbar"><i style="width:' + (total ? (x.t / total) * 100 : 0) + '%"></i></span>' +
      '<span class="wc">' + x.n + ' catatan · ' + pct(x.t, total) + '</span></button></li>';
  });
  $('who').innerHTML = html + '</ul>';
}

function renderAll() {
  if (!state.pocket) return;
  const b = bounds(state.mode, state.anchor);
  const shown = state.filterUser ? state.entries.filter((e) => e.by === state.filterUser) : state.entries;
  const r = summarize(shown, b);
  const prev = summarize(shown, bounds(state.mode, shift(state.mode, state.anchor, -1)));
  renderBalance();
  renderWho(b);
  $('plabel').textContent = periodLabel(state.mode, b);
  $('pdf').textContent = 'Unduh PDF ' + periodLabel('bulan', bounds('bulan', state.anchor));
  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.getAttribute('data-mode') === state.mode ? 'true' : 'false');
  });
  renderSummary(r, prev, b);
  renderCharts(r, b);
  renderList(r);
}

/* ---------- kantong ---------- */
function renderHeader() {
  const sel = $('pocketsel');
  if (state.pockets.length > 1) {
    sel.hidden = false;
    $('pname').hidden = true;
    sel.innerHTML = state.pockets.map((p) =>
      '<option value="' + esc(p.id) + '"' + (p.id === state.pocket.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
  } else {
    sel.hidden = true;
    $('pname').hidden = false;
    $('pname').textContent = state.pocket.name;
  }
}
function renderInvite() {
  $('invcode').textContent = state.pocket.code;
  $('sharecode').hidden = !navigator.share;
  $('memberlist').textContent = state.memberList.length
    ? 'Anggota: ' + state.memberList.map((m) => m.name + (m.role === 'owner' ? ' (pemilik)' : '')).join(', ')
    : '';
}
async function refreshMembers() {
  if (!state.pocket) return;
  try {
    const id = state.pocket.id;
    const mem = await api.members(id);
    if (!state.pocket || state.pocket.id !== id) return;
    state.memberList = mem;
    mem.forEach((m) => { state.names[m.id] = m.name; });
    renderInvite();
    renderAll();
  } catch (e) { /* nama lama tetap dipakai */ }
}

async function openPocket(id) {
  const token = ++opening;
  if (state.unsub) { state.unsub(); state.unsub = null; }
  const p = state.pockets.find((x) => x.id === id) || state.pockets[0];
  state.pocket = p;
  lsSet('pocketnt:pocket', p.id);
  state.entries = []; state.names = {}; state.memberList = [];
  state.loaded = false; state.pendingDel = null; state.filterUser = '';
  $('balform').hidden = true;
  show('main');
  $('invitebox').hidden = true;
  showNotice('');
  renderHeader();
  setSync('loading');
  renderAll();
  try {
    const [entries, mem] = await Promise.all([api.listExpenses(p.id), api.members(p.id)]);
    if (token !== opening) return;
    state.entries = entries;
    state.memberList = mem;
    mem.forEach((m) => { state.names[m.id] = m.name; });
    state.loaded = true;
    setSync('ok');
    renderInvite();
    renderAll();
    state.unsub = api.subscribe(p.id, {
      onInsert: (e) => {
        if (state.entries.some((x) => x.id === e.id)) return;
        state.entries = state.entries.concat([e]);
        if (!state.names[e.by]) refreshMembers();
        renderAll();
      },
      onDelete: (rid) => {
        if (!state.entries.some((x) => x.id === rid)) return;
        state.entries = state.entries.filter((x) => x.id !== rid);
        renderAll();
      },
      onStatus: (s) => {
        if (s === 'SUBSCRIBED') setSync('ok');
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setSync('error');
      },
    });
  } catch (e) {
    if (token !== opening) return;
    setSync('error');
    showNotice(errMsg(e));
  }
}

async function refresh() {
  if (!state.pocket || !state.loaded || !navigator.onLine) return;
  try {
    const id = state.pocket.id;
    const [entries, ps] = await Promise.all([api.listExpenses(id), api.myPockets(state.user.id)]);
    if (!state.pocket || state.pocket.id !== id) return;
    const fresh = ps.find((x) => x.id === id);
    if (fresh) { state.pocket.openingBalance = fresh.openingBalance; state.pocket.balanceFrom = fresh.balanceFrom; }
    state.entries = entries;
    setSync('ok');
    renderAll();
  } catch (e) { /* coba lagi pada kesempatan berikutnya */ }
}

/* ---------- akun ---------- */
function setAuthMode(m) {
  state.authMode = m;
  document.querySelectorAll('[data-auth]').forEach((b) => {
    b.setAttribute('aria-pressed', b.getAttribute('data-auth') === m ? 'true' : 'false');
  });
  $('namerow').hidden = m !== 'signup';
  $('authbtn').textContent = m === 'signup' ? 'Buat akun' : 'Masuk';
  $('apass').setAttribute('autocomplete', m === 'signup' ? 'new-password' : 'current-password');
  setMsg('authmsg', '');
}

async function afterLogin(user) {
  state.user = user;
  state.myName = (user.user_metadata && user.user_metadata.name) || (user.email || '').split('@')[0] || 'Aku';
  $('cdisp').value = state.myName;
  $('jdisp').value = state.myName;
  state.pockets = await api.myPockets(user.id);
  if (!state.pockets.length) {
    $('setupback').hidden = true;
    show('setup');
    return;
  }
  const last = lsGet('pocketnt:pocket');
  await openPocket(state.pockets.some((p) => p.id === last) ? last : state.pockets[0].id);
}

function resetSession() {
  if (state.unsub) { state.unsub(); state.unsub = null; }
  opening++;
  state.user = null; state.pockets = []; state.pocket = null;
  state.entries = []; state.names = {}; state.memberList = []; state.loaded = false;
  $('aemail').value = ''; $('apass').value = '';
  setAuthMode('login');
  show('auth');
}
async function logout() {
  try { await api.signOut(); } catch (e) { /* tetap keluar di sisi aplikasi */ }
  resetSession();
}

document.querySelectorAll('[data-auth]').forEach((b) => {
  b.addEventListener('click', () => setAuthMode(b.getAttribute('data-auth')));
});

$('authf').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = $('aemail').value.trim(), pass = $('apass').value, name = $('aname').value.trim();
  if (!email || !pass) { setMsg('authmsg', 'Isi email dan kata sandi.', 'err'); return; }
  if (state.authMode === 'signup' && !name) { setMsg('authmsg', 'Isi nama panggilan.', 'err'); return; }
  if (pass.length < 6) { setMsg('authmsg', 'Kata sandi minimal 6 karakter.', 'err'); return; }
  $('authbtn').disabled = true;
  setMsg('authmsg', '');
  try {
    if (state.authMode === 'signup') {
      const d = await api.signUp(email, pass, name);
      if (!d.session) {
        setAuthMode('login');
        setMsg('authmsg', 'Akun dibuat. Cek emailmu untuk konfirmasi, lalu masuk.', 'ok');
        return;
      }
      await afterLogin(d.user);
    } else {
      const d = await api.signIn(email, pass);
      await afterLogin(d.user);
    }
    $('apass').value = '';
  } catch (e) {
    setMsg('authmsg', errMsg(e), 'err');
  } finally {
    $('authbtn').disabled = false;
  }
});
$('logout').addEventListener('click', logout);
$('logout2').addEventListener('click', logout);

/* ---------- buat / gabung kantong ---------- */
$('createf').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const name = $('cname').value.trim(), disp = $('cdisp').value.trim();
  if (!name) { setMsg('cmsg', 'Beri nama kantong.', 'err'); return; }
  if (!disp) { setMsg('cmsg', 'Isi namamu.', 'err'); return; }
  const btn = $('createf').querySelector('button[type="submit"]');
  btn.disabled = true;
  setMsg('cmsg', '');
  try {
    const p = await api.createPocket(name, disp);
    state.pockets = await api.myPockets(state.user.id);
    $('cname').value = '';
    await openPocket(p.id);
  } catch (e) {
    setMsg('cmsg', errMsg(e), 'err');
  } finally {
    btn.disabled = false;
  }
});

$('joinf').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const code = $('jcode').value.trim().toUpperCase(), disp = $('jdisp').value.trim();
  if (!code) { setMsg('jmsg', 'Isi kode undangan.', 'err'); return; }
  if (!disp) { setMsg('jmsg', 'Isi namamu.', 'err'); return; }
  const btn = $('joinf').querySelector('button[type="submit"]');
  btn.disabled = true;
  setMsg('jmsg', '');
  try {
    const p = await api.joinPocket(code, disp);
    state.pockets = await api.myPockets(state.user.id); // baca ulang agar peran akurat
    $('jcode').value = '';
    await openPocket(p.id);
  } catch (e) {
    setMsg('jmsg', errMsg(e), 'err');
  } finally {
    btn.disabled = false;
  }
});

$('addpocket').addEventListener('click', () => {
  setMsg('cmsg', ''); setMsg('jmsg', '');
  $('setupback').hidden = !state.pocket;
  show('setup');
});
$('setupback').addEventListener('click', () => show('main'));
$('pocketsel').addEventListener('change', function () { openPocket(this.value); });

/* ---------- undangan ---------- */
function invMsg(t) { $('invmsg').textContent = t || ''; }
$('invbtn').addEventListener('click', () => {
  const box = $('invitebox');
  box.hidden = !box.hidden;
  invMsg('');
  if (!box.hidden) renderInvite();
});
$('copycode').addEventListener('click', async () => {
  const code = state.pocket.code;
  try { await navigator.clipboard.writeText(code); invMsg('Kode disalin.'); }
  catch (e) { invMsg('Salin manual: ' + code); }
});
$('sharecode').addEventListener('click', async () => {
  try {
    await navigator.share({
      title: 'Pocket`nt',
      text: 'Gabung ke kantong "' + state.pocket.name + '" di Pocket`nt. Kode undangan: ' + state.pocket.code,
      url: location.href.split('#')[0],
    });
  } catch (e) { /* dibatalkan */ }
});

/* ---------- periode ---------- */
document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => { state.mode = btn.getAttribute('data-mode'); state.pendingDel = null; renderAll(); });
});
$('prev').addEventListener('click', () => { state.anchor = shift(state.mode, state.anchor, -1); state.pendingDel = null; renderAll(); });
$('next').addEventListener('click', () => { state.anchor = shift(state.mode, state.anchor, 1); state.pendingDel = null; renderAll(); });
$('now').addEventListener('click', () => { state.anchor = today(); state.pendingDel = null; renderAll(); });

/* ---------- catat & hapus ---------- */
function fillCats() {
  const sel = $('cat');
  let html = '';
  ['primer', 'sekunder'].forEach((t) => {
    html += '<optgroup label="' + TYPE_LABEL[t] + '">' + CATS.filter((c) => c.type === t)
      .map((c) => '<option value="' + c.id + '">' + esc(c.label) + '</option>').join('') + '</optgroup>';
  });
  sel.innerHTML = html;
  const hint = () => { $('ctype').textContent = TYPE_LABEL[CAT[sel.value].type]; };
  sel.addEventListener('change', hint);
  hint();
}
/* ---------- saldo awal & filter anggota ---------- */
$('balamt').addEventListener('input', function () {
  const d = this.value.replace(/\D/g, '').slice(0, 11);
  this.value = d ? nf.format(parseInt(d, 10)) : '';
});
$('bal').addEventListener('click', (ev) => {
  if (!ev.target.closest('[data-act="editbal"]')) return;
  if (!state.pocket || state.pocket.role !== 'owner') return;
  $('balamt').value = state.pocket.openingBalance ? nf.format(state.pocket.openingBalance) : '';
  $('baldate').value = state.pocket.balanceFrom || ymd(today());
  setMsg('balmsg', '');
  $('balform').hidden = false;
  $('balamt').focus();
});
$('balcancel').addEventListener('click', () => { $('balform').hidden = true; });
$('balform').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!state.pocket || state.pocket.role !== 'owner') return;
  const raw = $('balamt').value.replace(/\D/g, '');
  const amt = raw ? parseInt(raw, 10) : 0;
  const from = $('baldate').value;
  if (!from) { setMsg('balmsg', 'Pilih tanggal mulai.', 'err'); $('baldate').focus(); return; }
  $('balsave').disabled = true;
  try {
    const upd = await api.setBalance(state.pocket.id, amt, from);
    state.pocket.openingBalance = upd.openingBalance;
    state.pocket.balanceFrom = upd.balanceFrom;
    $('balform').hidden = true;
    renderAll();
  } catch (e) {
    setMsg('balmsg', errMsg(e), 'err');
  } finally {
    $('balsave').disabled = false;
  }
});
$('who').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-user]');
  if (!b) return;
  const id = b.getAttribute('data-user');
  state.filterUser = id && state.filterUser !== id ? id : '';
  state.pendingDel = null;
  renderAll();
});

$('amount').addEventListener('input', function () {
  const d = this.value.replace(/\D/g, '').slice(0, 12);
  this.value = d ? nf.format(parseInt(d, 10)) : '';
});

$('f').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!state.pocket) return;
  const amt = parseInt($('amount').value.replace(/\D/g, ''), 10);
  const date = $('date').value;
  if (!amt || amt <= 0) { setMsg('fmsg', 'Isi jumlah pengeluaran.', 'err'); $('amount').focus(); return; }
  if (!date) { setMsg('fmsg', 'Pilih tanggal.', 'err'); $('date').focus(); return; }
  $('save').disabled = true;
  try {
    const e = await api.addExpense({
      pocketId: state.pocket.id, amount: amt, category: $('cat').value,
      note: $('note').value.trim().slice(0, 80), date,
    });
    if (!state.entries.some((x) => x.id === e.id)) state.entries = state.entries.concat([e]);
    const b = bounds(state.mode, state.anchor);
    const inRange = date >= ymd(b[0]) && date <= ymd(b[1]);
    $('amount').value = ''; $('note').value = '';
    setMsg('fmsg', inRange ? 'Tersimpan.' : 'Tersimpan. Tanggalnya di luar periode yang sedang ditampilkan.', 'ok');
    renderAll();
  } catch (err) {
    setMsg('fmsg', errMsg(err), 'err');
  } finally {
    $('save').disabled = false;
  }
});

$('list').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-del]');
  if (!b) return;
  const id = b.getAttribute('data-del');
  if (state.pendingDel !== id) {
    state.pendingDel = id;
    renderAll();
    clearTimeout(delTimer);
    delTimer = setTimeout(() => { state.pendingDel = null; renderAll(); }, 4000);
    return;
  }
  clearTimeout(delTimer);
  state.pendingDel = null;
  try {
    await api.deleteExpense(id);
    state.entries = state.entries.filter((e) => e.id !== id);
  } catch (e) {
    setMsg('fmsg', errMsg(e), 'err');
  }
  renderAll();
});

/* ---------- PDF ---------- */
function pdfMsg(t) {
  const m = $('pdfmsg');
  m.textContent = t || '';
  m.hidden = !t;
  clearTimeout(pdfTimer);
  if (t) pdfTimer = setTimeout(() => { m.hidden = true; }, 7000);
}
// Di ponsel: lembar bagikan (bisa "Simpan ke Berkas"). Di komputer: unduhan biasa.
async function savePdf(blob, name) {
  const file = new File([blob], name, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancel';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'download';
}
$('pdf').addEventListener('click', async function () {
  if (!state.pocket) return;
  if (!window.jspdf || !window.jspdf.jsPDF) {
    pdfMsg('Pembuat PDF belum termuat. Periksa koneksi lalu muat ulang halaman.');
    return;
  }
  const btn = this;
  btn.disabled = true;
  try {
    const f = buildPdf({
      jsPDF: window.jspdf.jsPDF, entries: state.entries, names: state.names,
      anchor: state.anchor, pocketName: state.pocket.name,
      balance: { opening: state.pocket.openingBalance || 0, from: state.pocket.balanceFrom || '' },
    });
    const how = await savePdf(f.blob, f.name);
    pdfMsg(how === 'cancel' ? 'Dibatalkan.' : how === 'shared' ? 'PDF siap disimpan atau dibagikan.' : 'PDF rekap diunduh.');
  } catch (e) {
    pdfMsg('PDF belum bisa dibuat. Coba lagi.');
  } finally {
    btn.disabled = false;
  }
});

/* ---------- koneksi & mulai ---------- */
window.addEventListener('offline', () => showNotice('Kamu sedang offline. Catatan baru belum bisa disimpan sampai tersambung lagi.'));
window.addEventListener('online', () => { showNotice(''); refresh(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

async function start() {
  fillCats();
  $('date').value = ymd(today());
  setAuthMode('login');
  if (!api.configured) { show('cfg'); return; }
  api.onAuth((evt) => { if (evt === 'SIGNED_OUT' && state.user) resetSession(); });
  try {
    const session = await api.getSession();
    if (!session) { show('auth'); return; }
    await afterLogin(session.user);
  } catch (e) {
    show('auth');
    setMsg('authmsg', errMsg(e), 'err');
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
start();
