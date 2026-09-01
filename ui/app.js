/* ═══════════════════════════════════════════════════════════════
   پنل مدیریت — منطق سمت کلاینت
   آیکون: Font Awesome 6  •  فونت: Vazirmatn + JetBrains Mono
   ═══════════════════════════════════════════════════════════════ */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const S = { token: sessionStorage.getItem('sg_t') || '', d: null, view: 'dash', tab: {}, sel: null, fmt: 'base64', range: 'd', q: '' };
  /* انتخاب‌های «تست واقعی ترافیک» — بین رفرش‌ها حفظ می‌شوند */
  const TT = { uuid: '', mb: 1, last: null };
  /* ═══ گزارش تست ترافیک تا وقتی تستِ تازه‌ای گرفته نشود باقی می‌ماند ═══
     نتیجه در localStorage هم ذخیره می‌شود تا با رفرش یا جابه‌جایی بین
     بخش‌های پنل پاک نشود؛ فقط اجرای یک تستِ جدید آن را جایگزین می‌کند. */
  const TT_KEY = 'sg_tt_last';
  try {
    const raw = localStorage.getItem(TT_KEY);
    if (raw) { const p = JSON.parse(raw); if (p && typeof p === 'object') TT.last = p; }
  } catch (e) { TT.last = null; }
  const ttSave = (r) => {
    TT.last = r;
    try { localStorage.setItem(TT_KEY, JSON.stringify(r)); } catch (e) {}
  };

  /* ═══ گزارشِ «بررسی سلامت شمارش مصرف» هم تا بررسیِ بعدی باقی می‌ماند ═══
     همان الگوی تست ترافیک: نتیجه در state و localStorage نگه داشته می‌شود و
     در هر بار بازسازیِ صفحه دوباره رندر می‌شود؛ نه رفرش خودکار و نه جابه‌جایی
     بین بخش‌ها آن را پاک نمی‌کند — فقط یک «بررسی سلامت» تازه جایگزینش می‌کند. */
  const UH = { last: null, ts: 0 };
  const UH_KEY = 'sg_uh_last';
  try {
    const rawUH = localStorage.getItem(UH_KEY);
    if (rawUH) { const p = JSON.parse(rawUH); if (p && typeof p === 'object') { UH.last = p; UH.ts = p.__ts || 0; } }
  } catch (e) { UH.last = null; }
  const uhSave = (r) => {
    const rec = Object.assign({}, r, { __ts: Date.now() });
    UH.last = rec; UH.ts = rec.__ts;
    try { localStorage.setItem(UH_KEY, JSON.stringify(rec)); } catch (e) {}
  };
  const uhShow = () => { const o = $('#usageHealthOut'); if (o) o.innerHTML = uhHtml(UH.last); };

  /* ═══════ بخش «اتصال‌های زنده» ═══════
     داده در state نگه داشته می‌شود، نه در DOM: به‌روزرسانیِ دوره‌ای و
     جابه‌جایی بین بخش‌ها جدول را خالی نمی‌کند — فقط یک بارخوانیِ موفق
     جای داده‌ی قبلی را می‌گیرد (خطا یا قطعیِ لحظه‌ای چیزی را پاک نمی‌کند). */
  const CN = { data: null, ts: 0, err: '' };
  const cnShow = () => {
    const o = $('#connOut'); if (o) o.innerHTML = cnHtml(CN.data);
    /* خلاصه و نشانگرِ وضعیت هم همان لحظه به‌روز می‌شوند — وگرنه عددهای
       بالای صفحه روی همان صفرِ رندرِ اول می‌ماندند */
    const st = $('#connStats'); if (st) st.innerHTML = cnStatsHtml();
    const bg = $('#connBadge'); if (bg) bg.innerHTML = cnBadgeHtml();
  };

  /* ═══════════════════════════════════════════════════════════════
     مرحله‌ی ۴ — وضعیتِ بخش‌های تازه
     هر سه از همان الگویِ «داده در state» پیروی می‌کنند: نتیجه در حافظه‌ی
     پنل نگه داشته می‌شود و در هر بار بازسازیِ صفحه دوباره رندر می‌شود،
     پس رفرش و جابه‌جایی بین بخش‌ها آن را پاک نمی‌کند — فقط یک بارخوانیِ
     تازه (یا دکمه‌ی پاک‌کردن) جای آن را می‌گیرد.
     ═══════════════════════════════════════════════════════════════ */
  /* سرورهای خروجی VLESS — پاسخِ GET /api/exits؛ form هم فرمِ افزودن/ویرایش است */
  const EX = { data: null, err: '', testing: '', test: null, form: null };
  const exShow = () => { const o = $('#exitsOut'); if (o) o.innerHTML = exitsHtml(EX.data); };
  /* تغییر رمز عبور —locked یعنی رمز از MASTER_KEY بایند شده و فیلدها بسته می‌شوند */
  const PW = { msg: '', kind: '', locked: false };
  const pwShow = () => {
    const o = $('#pwOut'); if (o) o.innerHTML = pwOutHtml();
    ['#pwCur', '#pwNew', '#pwNew2'].forEach((s) => { const e = $(s); if (e) e.disabled = PW.locked; });
    const b = $('[data-act="pw-save"]'); if (b) b.disabled = PW.locked;
  };
  /* پشتیبان و بازیابی — خروجیِ GET /api/backup و فایلی که رها شده */
  const BK = { data: null, file: null, err: '', errors: [], mode: 'merge' };
  const bkShow = () => {
    const o = $('#bkOut'); if (o) o.innerHTML = bkOutHtml(BK.data);
    const i = $('#bkInfo'); if (i) i.innerHTML = bkInfoHtml();
    const e = $('#bkErr'); if (e) e.innerHTML = bkErrHtml();
  };
  /* نام‌گذاریِ گروهی — الگو و انتخابِ کانفیگ‌ها بین بازسازی‌ها حفظ می‌شوند
     (تا ذخیره‌ی تنظیمات پیش‌نمایش را نپراند). init یعنی «انتخاب‌ها دست
     خورده‌اند»؛ تا وقتی دست‌نخورده باشند، همه‌ی کانفیگ‌ها پیش‌فرضاً
     انتخاب‌اند تا پیش‌نمایش از همان ابتدا چیزی نشان بدهد. */
  const NM = { pat: '', sel: {}, init: false };
  const nmShow = () => { const o = $('#nmPreview'); if (o) o.innerHTML = nmPreviewHtml(); };

  /* ═══════ رندرِ گزارشِ «بررسی سلامت شمارش مصرف» ═══════
     این تابع در هر بار بازسازیِ صفحه صدا زده می‌شود (نه فقط هنگام کلیک)،
     برای همین رفرش خودکار و جابه‌جایی بین بخش‌ها گزارش را پاک نمی‌کند. */
  function uhHtml(r) {
    if (!r || (!r.checks && !r.users && !r.limiter)) {
      return '<div class="empty">با یک کلیک، جدول مصرف، جریان ثبت (last_seen)، آخرین نوشتن D1 و مصرف ذخیره‌شده‌ی هر کاربر بررسی می‌شود.</div>';
    }
    const lim = r.limiter || 'mem';
    const limBadge = lim === 'do'
      ? '<span class="badge ok">' + icon('fa-server') + ' مرجع محدودیت: Durable Object — سراسری و دقیق ✓</span>'
      : lim === 'd1'
        ? '<span class="badge ok">' + icon('fa-database') + ' مرجع محدودیت: D1 — سراسری و دقیق ✓</span>'
        : lim === 'kv'
          ? '<span class="badge warn">' + icon('fa-database') + ' مرجع محدودیت: KV — مشترک اما تقریبی</span>'
          : '<span class="badge bad">' + icon('fa-triangle-exclamation') + ' مرجع محدودیت: حافظه — فقط همین isolate؛ بین isolateها تضمین نمی‌شود</span>';
    const d = r.diag || null;
    const diagHtml = d
      ? '<div class="hint" style="margin-bottom:10px">بایندینگ‌ها: D1 ' + (d.bound && d.bound.DB ? '✓' : '✗') +
        ' • KV ' + (d.bound && d.bound.KV ? '✓' : '✗') +
        ' • Durable Object ' + (d.bound && d.bound.LIMITER ? '✓' : '✗') +
        ' • آی‌پیِ شما: <span class="mono">' + esc(d.callerIp || '—') + '</span>' +
        ' • سقف سراسری: <span class="mono">' + fa(d.defaultLimit || 0) + '</span>' +
        ' • پذیرش/رد: <span class="mono">' + fa(d.acquires || 0) + '/' + fa(d.denies || 0) + '</span>' +
        (d.connErr ? '<br>آخرین خطای محدودیت: <span class="mono">' + esc(String(d.connErr)) + '</span>' : '') +
        '</div>'
      : '';
    const stamp = r.__ts ? new Date(r.__ts).toLocaleString('fa-IR', { hour12: false }) : '';
    const head = '<div class="hint" style="margin-bottom:8px">آخرین بررسی: <b>' + (stamp ? fa(stamp) : '—') + '</b>' +
      ' • <span class="hint">این گزارش تا وقتی دوباره «بررسی سلامت» را نزنید باقی می‌ماند.</span>' +
      '<button class="btn sm ghost" data-act="usage-health-clear" style="margin-inline-start:8px">' + icon('fa-eraser') + ' پاک‌کردن گزارش</button></div>';
    return head +
      '<div style="margin-bottom:10px">' + limBadge + '</div>' +
      diagHtml +
      (lim !== 'do' && lim !== 'd1'
        ? '<div class="hint" style="margin-bottom:10px">هیچ مرجعِ مشترکی بین isolateها ندارید: هر isolate شمارنده‌ی خودش را دارد و محدودیت عملاً اعمال نمی‌شود. در Settings → Variables یک پایگاه D1 با نام <span class="mono">DB</span> ببندید (در داشبورد کلاودفلر هم می‌توان ساخت).</div>'
        : '') +
      (r.checks || []).map((c) => '<div class="kv"><span>' + icon(c.ok ? 'fa-circle-check' : 'fa-circle-xmark') + ' ' + esc(c.name) + '</span><b class="mono" style="color:' + (c.ok ? 'var(--ok)' : 'var(--bad)') + '">' + esc(c.note || '') + '</b></div>').join('') +
      /* ═══ اتصال‌های زنده — اگر چیزی گیر کرده باشد اینجا دیده می‌شود ═══ */
      '<div class="hint" style="margin-top:12px"><b>اتصال‌های زنده (مبنای محدودیت آی‌پی):</b> ' +
      'آزادسازی آی‌پی: آنی هنگام قطع شدن؛ حداکثر ' + esc(fa(((r.diag || {}).releaseSec || 3))) +
      ' ثانیه برای قطعیِ ناگهانی (' +
      esc(fa(((r.diag || {}).evicts || 0))) + ' مورد تاکنون) • مرجع: ' +
      esc({ do: 'شیءِ ماندگار (LIMITER)', d1: 'جدول conns در D1', kv: 'KV', mem: 'حافظهٔ این isolate' }[(r.diag || {}).liveSource] || ((r.diag || {}).liveSource || '—')) +
      (((r.live || {}).oldestSec) ? ' • قدیمی‌ترین ردیف: ' + esc(fa((r.live || {}).oldestSec)) + ' ثانیه' : '') + '</div>' +
      (((r.live || {}).stale)
        ? '<div class="hint" style="margin-top:6px;color:var(--bad)">' + esc(fa((r.live || {}).stale)) + ' ردیف زمانِ معتبر ندارد و در اولین پاک‌سازی حذف می‌شود.</div>'
        : '') +
      ((r.liveRows && r.liveRows.length)
        ? '<div style="margin-top:8px;max-height:220px;overflow:auto" class="tbl-wrap"><table>' +
          '<thead><tr><th>کاربر</th><th>آی‌پی</th><th>سن</th><th>وضعیت</th></tr></thead><tbody>' +
          r.liveRows.map((x) => '<tr><td class="cell-main">' + esc(x.name || x.uuid) + '</td><td class="mono">' + esc(x.ip) + '</td>' +
            '<td class="mono">' + (x.stale || x.ageSec === null ? 'نامعتبر' : fa(x.ageSec) + ' ثانیه') + '</td>' +
            '<td><span class="badge ' + (x.stale ? 'bad' : (x.idle ? 'warn' : 'ok')) + '">' +
            (x.stale ? 'خراب — پاک می‌شود' : (x.idle ? 'بدون فعالیت — با اولین آی‌پیِ جدید جایگزین می‌شود' : 'زنده')) +
            '</span></td></tr>').join('') +
          '</tbody></table></div>'
        : '<div class="hint" style="margin-top:6px">هیچ اتصالِ زنده‌ای ثبت نشده — هیچ آی‌پی‌ای قفل نیست.</div>') +
      '<div class="hint" style="margin-top:12px"><b>مصرف ذخیره‌شده‌ی هر کاربر:</b></div>' +
      '<div style="margin-top:8px;max-height:260px;overflow:auto" class="tbl-wrap"><table>' +
      '<thead><tr><th>کاربر</th><th>آپلود</th><th>دانلود</th><th>درخواست</th><th>آخرین ثبت</th><th>وضعیت</th></tr></thead><tbody>' +
      (r.users || []).map((x) => '<tr><td class="cell-main">' + esc(x.name) + '</td><td class="mono">' + bytes(x.up || 0) + '</td><td class="mono">' + bytes(x.down || 0) + '</td><td class="mono">' + fa(x.reqs || 0) + '</td><td class="hint">' + ago(x.lastSeen) + '</td>' +
        '<td><span class="badge ' + (x.recording ? 'ok' : 'warn') + '">' + (x.recording ? 'در حال ثبت ✓' : 'مصرفی ثبت نشده') + '</span></td></tr>').join('') +
      '</tbody></table></div>' +
      '<div class="hint" style="margin-top:10px">اگر «در حال ثبت ✓» می‌بینید یعنی افزایش مصرف برای آن کاربر جریان دارد. «مصرفی ثبت نشده» فقط برای کاربرانی که وصل نبوده‌اند طبیعی است.</div>';
  }

  /* ─────────── ابزارها ─────────── */
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fa = (v) => String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const n = (v) => (v == null || isNaN(v) ? '—' : fa(Number(v).toLocaleString('en-US')));
  const bytes = (b) => { if (!b || b < 0) return '۰ بایت'; const u = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت']; const i = Math.min(4, Math.floor(Math.log(b) / Math.log(1024))); return fa((b / 1024 ** i).toFixed(i ? 1 : 0)) + ' ' + u[i]; };
  const ago = (t) => { if (!t) return '—'; const s = (Date.now() - t) / 1000; if (s < 60) return 'همین حالا'; if (s < 3600) return fa(Math.floor(s / 60)) + ' دقیقه پیش'; if (s < 86400) return fa(Math.floor(s / 3600)) + ' ساعت پیش'; return fa(Math.floor(s / 86400)) + ' روز پیش'; };
  /* مدتِ اتصال به فارسی — برای ستون‌های «مدت اتصال» و «زمان باقی‌مانده» */
  const durFa = (sec) => {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    if (s < 60) return fa(s) + ' ثانیه';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    if (h) return fa(h) + ' ساعت' + (m ? ' و ' + fa(m) + ' دقیقه' : '');
    return fa(m) + ' دقیقه' + (r ? ' و ' + fa(r) + ' ثانیه' : '');
  };
  /* ═══════════ آیکون‌های SVG داخلی — بدون هیچ وابستگی به CDN یا فونت ═══════════
     مقاوم‌ترین روش: هر آیکون یک SVG کامل داخل صفحه است.
     نام‌های Font Awesome به معادل SVG نگاشت می‌شوند. */
  const P = {
    gauge: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.44.63.82.75.37.12.78.09 1.13-.1"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    network: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>',
    chart: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    chartline: '<path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/>',
    chartbar: '<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>',
    chartarea: '<path d="M3 3v18h18"/><path d="M7 15l3-5 4 4 5-7"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
    cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
    refresh: '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    rotate: '<path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.44.63.82.75H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
    warn: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM19 14h2M14 19h2M19 19h2v2"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    checkcircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
    xcircle: '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
    eyeoff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/>',
    mobile: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><path d="M12 18h.01"/>',
    shuffle: '<path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>',
    stethoscope: '<path d="M3 3v18h18"/><path d="M7 12h4v5a3 3 0 0 0 6 0v-8"/>',
    vial: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    rank: '<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>',
    radio: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/>',
    harddrive: '<path d="M22 12H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01M10 16h.01"/>',
    updots: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    broom: '<path d="M3 3v18h18"/><path d="M7 16l4-4M7 19l8-8"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    paperplane: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
    spinner: '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
    compass: '<circle cx="12" cy="12" r="10"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
    branch: '<path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    server: '<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><path d="M6 6h.01M6 18h.01"/>',
    route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    package: '<path d="M16.5 9.4l-9-5.19"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    terminal: '<path d="M4 17l6-6-6-6"/><path d="M12 19h8"/>',
    bolt: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    telegram: '<path d="M21.9 4.3l-3.1 14.6c-.2 1-.8 1.2-1.7.8l-4.6-3.4-2.2 2.1c-.2.2-.5.4-.9.4l.3-4.7L18.4 6c.4-.3-.1-.5-.6-.2L7.3 12.2 2.8 10.8c-1-.3-1-1 .2-1.4l17.3-6.7c.8-.3 1.5.2 1.2 1.2z"/>',
  };
  /* نگاشت نام‌های Font Awesome → کلیدهای SVG بالا */
  const ICON_MAP = {
    'fa-gauge-high': 'gauge', 'fa-users': 'users', 'fa-user': 'user', 'fa-link': 'link',
    'fa-shield-halved': 'shield', 'fa-network-wired': 'network', 'fa-chart-line': 'chartline',
    'fa-chart-area': 'chartarea', 'fa-chart-column': 'chartbar', 'fa-chart-pie': 'chart',
    'fa-cloud': 'cloud', 'fa-rotate': 'refresh', 'fa-rotate-left': 'rotate', 'fa-lock': 'lock',
    'fa-list-check': 'list', 'fa-gear': 'gear', 'fa-bars': 'menu', 'fa-magnifying-glass': 'search',
    'fa-moon': 'moon', 'fa-sun': 'sun', 'fa-triangle-exclamation': 'warn', 'fa-right-from-bracket': 'logout',
    'fa-right-to-bracket': 'login', 'fa-xmark': 'close', 'fa-plus': 'plus', 'fa-pen': 'edit',
    'fa-qrcode': 'qr', 'fa-ban': 'ban', 'fa-check': 'check', 'fa-circle-check': 'checkcircle',
    'fa-circle-xmark': 'xcircle', 'fa-trash-can': 'trash', 'fa-clipboard': 'clipboard',
    'fa-arrow-up-right-from-square': 'external', 'fa-eye': 'eye', 'fa-eye-slash': 'eyeoff',
    'fa-copy': 'copy', 'fa-floppy-disk': 'save', 'fa-scissors': 'scissors', 'fa-globe': 'globe',
    'fa-key': 'key', 'fa-mask': 'eyeoff', 'fa-mobile-screen': 'mobile', 'fa-shuffle': 'shuffle',
    'fa-stethoscope': 'stethoscope', 'fa-vial': 'vial', 'fa-ranking-star': 'rank',
    'fa-tower-broadcast': 'radio', 'fa-hard-drive': 'harddrive', 'fa-arrow-up-right-dots': 'updots',
    'fa-heart-pulse': 'heart', 'fa-broom': 'broom', 'fa-circle-info': 'info',
    'fa-paper-plane': 'paperplane', 'fa-download': 'download', 'fa-upload': 'upload',
    'fa-spinner': 'spinner', 'fa-compass': 'compass', 'fa-database': 'database',
    'fa-code-branch': 'branch', 'fa-bolt': 'bolt', 'fa-server': 'server', 'fa-route': 'route',
    'fa-box-open': 'package', 'fa-activity': 'activity', 'fa-terminal': 'terminal',
  };
  const icon = (c, cls = '') => {
    const names = String(c || '').split(/\s+/).filter(Boolean);
    for (const n of names) {
      const key = ICON_MAP[n] || (P[n] ? n : null);
      if (key && P[key]) {
        return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[key] + '</svg>';
      }
    }
    /* fallback: آیکون پیش‌فرض */
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>';
  };
  const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setP = (o, p, v) => { const a = p.split('.'); let c = o; for (let i = 0; i < a.length - 1; i++) { c[a[i]] = c[a[i]] || {}; c = c[a[i]]; } c[a[a.length - 1]] = v; };

  async function api(method, path, body) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(path, {
        method,
        headers: { authorization: 'Bearer ' + S.token, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      clearTimeout(to);
      const j = await r.json().catch(() => ({ error: 'bad json' }));
      /* کدِ وضعیت همراهِ پاسخ برمی‌گردد — بخش‌هایی مثل تغییرِ رمز باید بتوانند
         پاسخِ ۴۰۹ (رمز بایند‌شده به MASTER_KEY) را از یک خطای ساده تشخیص دهند */
      if (j && typeof j === 'object') j.__status = r.status;
      if (r.status === 401 && S.token) { S.token = ''; sessionStorage.removeItem('sg_t'); S.d = null; render(); }
      return j;
    } catch (e) {
      return { error: e.name === 'AbortError' ? 'سرور پاسخ نداد' : 'خطای شبکه' };
    }
  }
  const toast = (msg, kind = 'ok') => { const d = document.createElement('div'); d.className = 'toast ' + kind; const ic = kind === 'err' ? 'fa-circle-xmark' : kind === 'info' ? 'fa-circle-info' : 'fa-circle-check'; d.innerHTML = icon(ic) + '<span>' + esc(msg) + '</span>'; $('#toastRoot').appendChild(d); setTimeout(() => d.remove(), 3400); };
  const copy = (t) => { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('در کلیپ‌بورد کپی شد')).catch(() => toast('کپی نشد', 'err')); };
  const modal = (html, wide) => { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = '<div class="box' + (wide ? ' wide' : '') + '" id="mbox">' + html + '</div>'; m.onmousedown = (e) => { if (e.target === m) m.remove(); }; $('#modalRoot').appendChild(m); return m; };
  const closeM = () => { $('#modalRoot').innerHTML = ''; };
  const busy = (el, label) => { if (el) { el.disabled = true; el.dataset.old = el.innerHTML; el.innerHTML = icon('fa-spinner fa-spin') + ' ' + label; } };
  const free = (el) => { if (el && el.dataset.old) { el.disabled = false; el.innerHTML = el.dataset.old; delete el.dataset.old; } };

  /* ─────────── نمودار سطحی (SVG دقیق با تولتیپ) ───────────
     ⚠️ viewBox با preserveAspectRatio="none" کشیده می‌شود؛ هر متنی یا
     دایره‌ای داخل SVG کج و به‌شکل بیضی رندر می‌شد. برچسب‌های محور و نقطه‌ی
     هاور عمداً HTML هستند تا با کشِ نمودار distort نشوند. */
  function area(data, opt = {}) {
    const W = 600, H = 180, pad = { t: 12, r: 8, b: 20, l: 8 };
    const d = (data && data.length ? data : [0]).map((x) => Number(x) || 0);
    const mx = Math.max(...d, 0.001);
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const X = (i) => pad.l + (i / Math.max(1, d.length - 1)) * iw;   // چپ→راست (طبیعی)
    const Y = (v) => pad.t + ih - (v / mx) * ih;
    const pts = d.map((v, i) => [X(i), Y(v)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ');
    const areaD = line + ' L' + X(d.length - 1).toFixed(2) + ',' + (pad.t + ih) + ' L' + X(0).toFixed(2) + ',' + (pad.t + ih) + ' Z';
    const c = opt.color || 'var(--ac)', c2 = opt.color2 || 'var(--ac2)';
    const id = 'g' + Math.random().toString(36).slice(2, 7);
    const grid = [0, .25, .5, .75, 1].map((g) => '<line class="gl" x1="' + pad.l + '" y1="' + (pad.t + ih * g) + '" x2="' + (W - pad.r) + '" y2="' + (pad.t + ih * g) + '"/>').join('');
    const labels = [1, .5, 0].map((g) => '<span class="chart-y" style="top:' + (((pad.t + ih * (1 - g)) / H) * 100).toFixed(2) + '%">' + fa((mx * g).toFixed(mx < 10 ? 1 : 0)) + '</span>').join('');
    const svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="f' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c + '" stop-opacity=".34"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="s' + id + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + c2 + '"/><stop offset="1" stop-color="' + c + '"/></linearGradient></defs>' +
      grid +
      '<path class="ar" d="' + areaD + '" fill="url(#f' + id + ')"/>' +
      '<path class="ln" d="' + line + '" stroke="url(#s' + id + ')"/>' +
      '<line class="hv" x1="0" y1="0" x2="0" y2="0" style="display:none"/></svg>';
    return '<div class="chart-wrap" data-unit="' + esc(opt.unit || '') + '">' + svg + labels +
      '<div class="chart-dot" style="display:none"></div>' +
      '<div class="chart-tip" style="display:none"></div></div>';
  }
  /* اتصال تولتیپ به همه‌ی نمودارها */
  function bindCharts(root, series) {
    $$('.chart', root).forEach((svg) => {
      const d = (series && series.length ? series : []).map((x) => Number(x) || 0);
      if (!d.length) return;
      const wrap = svg.parentElement, tip = wrap.querySelector('.chart-tip'), dot = wrap.querySelector('.chart-dot');
      const hv = svg.querySelector('.hv');
      const unit = wrap.getAttribute('data-unit') || '';
      const W = 600, H = 180, pad = { t: 12, r: 8, b: 20, l: 8 };
      const mx = Math.max(...d, 0.001), iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
      const on = (e) => {
        const r = svg.getBoundingClientRect();
        /* اندیس از مختصات واقعیِ نمودار — با احتساب padding، وگرنه نقطه‌ی
           انتخاب‌شده نسبت به نشانگر جابه‌جا می‌افتاد */
        const vx = ((e.clientX - r.left) / r.width) * W;
        const i = Math.max(0, Math.min(d.length - 1, Math.round(((vx - pad.l) / iw) * (d.length - 1))));
        const x = pad.l + (i / Math.max(1, d.length - 1)) * iw;
        const y = pad.t + ih - (d[i] / mx) * ih;
        /* موقعیت پیکسلی واقعی — ارتفاعِ CSS (۱۷۰px) با viewBox (۱۸۰) یکی نیست */
        const px = (x / W) * r.width, py = (y / H) * r.height;
        dot.style.display = 'block'; dot.style.left = px + 'px'; dot.style.top = py + 'px';
        hv.setAttribute('x1', x); hv.setAttribute('x2', x); hv.setAttribute('y1', pad.t); hv.setAttribute('y2', H - pad.b); hv.style.display = '';
        tip.style.display = 'block';
        tip.style.left = px + 'px';
        tip.style.top = py + 'px';
        tip.textContent = 'نقطه ' + fa(i + 1) + ' • ' + fa(d[i].toFixed(2)) + unit;
      };
      svg.addEventListener('mousemove', on);
      svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; dot.style.display = 'none'; hv.style.display = 'none'; });
    });
  }
  const bars = (data, unit) => { const d = data.length ? data : [0]; const mx = Math.max(...d, 0.001); return '<div class="bars">' + d.map((v, i) => '<div data-tip="' + fa(Number(v).toFixed(2)) + (unit || '') + ' • ' + fa(i + 1) + '" style="height:' + Math.max(3, (Number(v) / mx) * 92) + 'px"></div>').join('') + '</div>'; };
  const ring = (p, l, c) => { const r = 40, cc = 2 * Math.PI * r, v = Math.max(0, Math.min(100, p)); return '<div class="ring"><svg width="100" height="100"><circle cx="50" cy="50" r="' + r + '" fill="none" stroke="var(--bs)" stroke-width="9"/><circle cx="50" cy="50" r="' + r + '" fill="none" stroke="' + (c || 'var(--ac)') + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + cc + '" stroke-dashoffset="' + (cc - (v / 100) * cc) + '" style="transition:.7s"/></svg><div class="c">' + fa(v.toFixed(0)) + '٪<span>' + esc(l) + '</span></div></div>'; };
  /* با یک نقطه (یا داده‌ی خالی) تقسیم بر صفر مسیر «MNaN» می‌ساخت و اسپارک خاموش می‌شد */
  const spark = (d) => { if (!d || d.length < 2) return ''; const w = 70, h = 20, dd = d.map(Number), m = Math.max(...dd, .001); const p = dd.map((v, i) => (i ? 'L' : 'M') + ((i / (dd.length - 1)) * w).toFixed(2) + ',' + (h - (v / m) * (h - 2) - 1).toFixed(2)).join(' '); return '<svg width="' + w + '" height="' + h + '"><path d="' + p + '" fill="none" stroke="var(--ac)" stroke-width="1.5"/></svg>'; };

  /* ─────────── فرم‌ساز ─────────── */
  function field(f, val) {
    const p = esc(f.p);
    let inner;
    if (f.t === 'sw') inner = '<div class="sw ' + (f.bad ? 'bad ' : '') + (val ? 'on' : '') + '" data-sw="' + p + '"><i></i></div><input type="checkbox" class="hide" data-p="' + p + '" data-t="bool"' + (val ? ' checked' : '') + '>';
    else if (f.t === 'sel') inner = '<select data-p="' + p + '">' + f.o.map((o) => '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') + '>' + esc((f.lbls && f.lbls[o]) || o) + '</option>').join('') + '</select>';
    else if (f.t === 'num') inner = '<input type="number" data-p="' + p + '" data-t="num" value="' + esc(val ?? 0) + '">';
    else if (f.t === 'pw') inner = '<input type="password" data-p="' + p + '" value="' + esc(val ?? '') + '" class="mono">';
    else if (f.t === 'area') inner = '<textarea rows="4" data-p="' + p + '" data-t="' + (f.dt || 'lines') + '">' + esc(Array.isArray(val) ? val.join('\n') : (val ?? '')) + '</textarea>';
    else if (f.t === 'rng') inner = '<div class="range"><input type="range" data-p="' + p + '" data-t="num" min="' + f.min + '" max="' + f.max + '" step="' + (f.step || 1) + '" value="' + esc(val ?? f.min) + '"><b>' + esc(val ?? f.min) + esc(f.u || '') + '</b></div>';
    else inner = '<input data-p="' + p + '" value="' + esc(val ?? '') + '"' + (f.mono ? ' class="mono"' : '') + '>';
    /* نکته: برای سوییچ از div استفاده می‌شود، نه label — label باعث می‌شد کلیک،
       مقدار را دو بار تغییر دهد (یک‌بار توسط ما، یک‌بار توسط رفتار پیش‌فرض label) */
    const tag = f.t === 'sw' ? 'div' : 'label';
    return '<' + tag + ' class="f"><span>' + esc(f.l) + (f.req ? ' <b style="color:var(--bad)">*</b>' : '') + '</span>' + inner + (f.h ? '<div class="hint" style="margin-top:5px">' + f.h + '</div>' : '') + '</' + tag + '>';
  }
  /* ═══ آکاردئون — جایگزین کارت‌های تودرتو و toggle های پراکنده ═══ */
  const acc = (title, icn, fields, s, cols) => {
    const html = fields.map((f) => field(f, getP(s, f.p))).join('');
    return '<div class="acc open"><div class="acc-h" data-acc>' + icon(icn) + '<span>' + title + '</span>' +
      '<svg class="ic chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></div>' +
      '<div class="acc-b"><div class="um-grid ' + (cols || 'two') + '">' + html + '</div></div></div>';
  };

  /* گروه کلاسیک (فقط برای بخش‌های کوچک) */
  const group = (g, s) => '<div class="card"><header><span class="ic">' + icon(g.icon || 'fa-gear') + '</span><div><h3>' + esc(g.t) + '</h3>' + (g.d ? '<p>' + g.d + '</p>' : '') + '</div></header><div class="bd">' +
    g.f.map((f) => field(f, getP(s, f.p))).join('') + '</div></div>';
  function collect(root) { const o = {}; if (!root) return o; $$('[data-p]', root).forEach((el) => { const t = el.dataset.t; let v = el.type === 'checkbox' ? el.checked : el.value; if (t === 'num') v = Number(v) || 0; if (t === 'bool') v = !!v; if (t === 'lines') v = String(v).split('\n').map((x) => x.trim()).filter(Boolean);
    /* انتخابگرِ پورت: مقدارِ فیلدِ پنهان «443,2053» است که باید آرایه‌ای از عدد شود */
    if (t === 'ports') v = String(v).split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((x) => x > 0 && x < 65536);
    setP(o, el.dataset.p, v); }); return o; }
  const saveBtn = (act, lbl) => '<button class="btn p" data-act="' + act + '">' + icon('fa-floppy-disk') + ' ' + (lbl || 'ذخیره') + '</button>';

  /* ═══════════════════════════════════════════════════════════════
     مرحله‌ی ۴ — انتخابگرِ پورت (غیرنوشتاری)
     فقط پورت‌هایی پیشنهاد می‌شوند که کلاودفلر روی لبه پشتیبانی می‌کند.
     ۴۴۳ و ۸۰ «ضروری»اند: ترافیکِ عادیِ https/httpِ ورکر از همین دو مسیر
     می‌آید، برای همین همیشه فعال‌اند و غیرفعال‌کردن‌شان بی‌معنی است.
     ═══════════════════════════════════════════════════════════════ */
  const PORT_ESSENTIAL = [443, 80];
  const PORT_RECOMMENDED = [8443, 2053, 2083, 2087, 2096, 8880];
  const PORT_OPTIONAL = [2052, 2082, 2086, 8080];
  const PORTS_ALL = PORT_ESSENTIAL.concat(PORT_RECOMMENDED, PORT_OPTIONAL);
  const PORTS_DEFAULT = PORT_ESSENTIAL.concat(PORT_RECOMMENDED);
  /* مقدار ممکن است آرایه (تنظیماتِ تازه) یا رشته (تنظیماتِ قدیمی) باشد */
  const portList = (v) => (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,\s]+/))
    .map((x) => parseInt(x, 10)).filter((x) => x > 0 && x < 65536);
  const portKind = (p) => (PORT_ESSENTIAL.indexOf(p) >= 0 ? 'ضروری' : PORT_RECOMMENDED.indexOf(p) >= 0 ? 'پیشنهادی' : 'انتخابی');
  const portChip = (p, on) => {
    const k = portKind(p), lock = k === 'ضروری';
    const st = on
      ? (lock ? 'background:var(--ac);border-color:var(--ac);color:#fff' : 'border-color:var(--ac2);background:color-mix(in oklab,var(--ac2) 16%,transparent)')
      : 'opacity:.45';
    return '<button type="button" class="chip" data-port="' + p + '"' + (lock ? ' data-lock="1"' : '') +
      ' title="' + (lock ? 'ضروری — غیرقابل غیرفعال‌کردن' : k) + '" style="' + st + '">' +
      (lock ? icon('fa-lock') : '') + '<span class="mono">' + fa(p) + '</span>' +
      '<span style="font-size:9px;opacity:.85">' + k + '</span></button>';
  };
  const portSumHtml = (cur) => '<b>' + fa(cur.length) + ' پورت فعال:</b> ' +
    (cur.length ? cur.slice().sort((a, b) => a - b).map(fa).join(' • ') : 'هیچ — دست‌کم یکی را انتخاب کنید');
  /* بازنویسیِ چیپ‌ها + فیلدِ پنهان + خلاصه — در هر تغییر یک‌جا صدا زده می‌شود */
  const portSet = (list) => {
    const cur = portList(list);
    const c = $('#portChips'); if (c) c.innerHTML = PORTS_ALL.map((p) => portChip(p, cur.indexOf(p) >= 0)).join('');
    const h = $('#portsVal'); if (h) h.value = cur.join(',');
    const s = $('#portSum'); if (s) s.innerHTML = portSumHtml(cur);
    return cur;
  };

  /* ═══════════════════════════════════════════════════════════════
     مرحله‌ی ۴ — نام‌گذاریِ کانفیگ‌ها
     الگو کاملاً دلخواه است: نه محدودیتِ الگو دارد و نه سقفِ طول.
     ═══════════════════════════════════════════════════════════════ */
  const NAME_TOKENS = [
    { k: 'prefix', l: 'پیشوند' }, { k: 'user', l: 'کاربر' }, { k: 'proto', l: 'پروتکل' },
    { k: 'port', l: 'پورت' }, { k: 'ip', l: 'آی‌پی نود' }, { k: 'node', l: 'نام نود (شهر)' },
    { k: 'index', l: 'شماره‌ی کانفیگ' }, { k: 'mark', l: 'نشان' },
  ];
  const NAME_TPL = [
    { l: 'شهر-شماره', p: '{node}-{index}' },
    { l: 'کاربر-شماره', p: '{user}-{index}' },
    { l: 'پروتکل-کشور-شماره', p: '{proto}-{node}-{index}' },
    { l: 'کوتاه', p: '{node}:{port}' },
    { l: 'فقط آی‌پی', p: '{ip}' },
    { l: 'پیش‌فرضِ پنل', p: '{prefix} | {node} | :{port} | {mark}' },
    { l: 'تصادفی', rnd: 1 },
  ];
  /* همان منطقِ رندرِ الگو در ورکر (renderName در worker.js): توکنِ خالی همراهِ
     جداکننده‌اش حذف می‌شود تا «{prefix} | {node}» با پیشوندِ خالی به
     « | فرانکفورت» تبدیل نشود.
     ⚠️ کلاسِ جداکننده‌ها باید دقیقاً با ورکر یکی باشد وگرنه پیش‌نمایشِ اینجا
     با نامی که ورکر واقعاً می‌سازد فرق می‌کند: فاصله، | خط تیره، · نقطه‌ی
     میانی، – خط تیره‌ی کوتاه و — خط تیره‌ی بلند — همه با کدبندیِ درستِ utf-8. */
  const NM_SEP = '[\\s|·\\-–—]';
  const nmRender = (pattern, vars) => {
    let out = String(pattern == null ? '' : pattern);
    out = out.replace(new RegExp('(' + NM_SEP + '*)\\{(\\w+)\\}(' + NM_SEP + '*)', 'g'), (m, pre, k, post) => {
      const v = vars[k];
      if (v === undefined || v === null || v === '') return (pre && post) ? ' ' : (pre || post);
      return pre + String(v) + post;
    });
    out = out.replace(/\{(\w+)\}/g, '');                       /* توکنِ ناشناس */
    out = out.replace(/[ \t]*\|[ \t]*(\|[ \t]*)+/g, ' | ');     /* جداکننده‌ی تکراری → یکی */
    out = out.replace(/[ \t]{2,}/g, ' ');                       /* فاصله‌ی تکراری → یکی */
    out = out.replace(new RegExp('^' + NM_SEP + '+'), '');
    out = out.replace(new RegExp(NM_SEP + '+$'), '');
    return out.trim();
  };
  /* نودِ نمونه برای پیش‌نمایش — نخستین آی‌پی پاکِ همان کاربر (وگرنه تنظیمات) */
  const nmUserEntries = (u) => {
    const Sd = (S.d && S.d.settings) || {};
    const raw = ((u && u.cleanIPs && u.cleanIPs.length) ? u.cleanIPs : (Sd.cleanIPs || []));
    const ips = raw.map((l) => { const p = String(l).split('#'); return { ip: p[0] || '', name: p[1] || p[0] || '' }; })
      .filter((x) => x.ip);
    if (!ips.length) ips.push({ ip: '104.17.1.1', name: 'فرانکفورت' });
    const ports = portList((u && u.ports && u.ports.length) ? u.ports : Sd.ports);
    if (!ports.length) ports.push(443);
    return { ips, ports };
  };
  const nmVars = (u, index) => {
    const { ips, ports } = nmUserEntries(u);
    return {
      prefix: (S.d && getP(S.d.settings, 'sub.namePrefix')) || '',
      user: (u && u.name) || '', proto: 'VLESS',
      port: String(ports[0] || 443), ip: ips[0].ip, node: ips[0].name,
      index: (index === '' || index === undefined) ? '' : String(index), mark: '',
    };
  };
  /* چند نامِ نمونه با همان منطقِ ورکر (هر ورودی × همه‌ی پورت‌ها) تا
     پیش‌نمایش با خروجیِ واقعیِ ساب یکی باشد. شماره هم همان شمارنده‌ای است
     که ورکر در label() می‌گذارد: یکمین کانفیگِ ساب شماره‌ی ۱ را می‌گیرد. */
  const nmSamples = (u, pattern) => {
    const { ips, ports } = nmUserEntries(u);
    const out = [];
    let n = 0;
    for (const e of ips) {
      for (const port of ports) {
        n++;
        const v = nmVars(u, n);
        v.port = String(port); v.ip = e.ip; v.node = e.name;
        const nm = nmRender(pattern, v);
        if (nm && out.indexOf(nm) < 0) out.push(nm);
        if (out.length >= 4) return out;
      }
    }
    return out;
  };
  const nmPat = () => {
    const e = $('#nmPat');
    if (e) return String(e.value == null ? '' : e.value);
    return String((S.d && getP(S.d.settings, 'sub.namePattern')) || NM.pat || '');
  };
  /* انتخاب‌شده‌ها — تا وقتی کاربر دستی چیزی را برنگزیده، همه انتخاب‌اند */
  const nmSelUsers = () => {
    const users = (S.d && S.d.users) || [];
    if (!NM.init) { users.forEach((u) => { NM.sel[u.id] = true; }); NM.init = true; }
    return users.filter((u) => NM.sel[u.id]);
  };
  /**
   * برنامه‌ی اعمالِ الگو. پیش‌نمایش و اعمالِ واقعی هر دو از همین تابع
   * می‌خوانند، پس آنچه دیده می‌شود دقیقاً همان است که ذخیره می‌شود.
   *
   * ⚠️ {index} در الگوی ذخیره‌شده دست‌نخورده می‌ماند: شماره را ورکر در
   * لحظه‌ی ساختِ ساب می‌گذارد (۱، ۲، ۳ … برای کانفیگ‌های همان کاربر). قبلاً
   * اینجا شماره‌ی ترتیبِ کاربر در الگو حک می‌شد و در نتیجه همه‌ی کانفیگ‌های
   * یک کاربر یک شماره می‌گرفتند و نام‌هایشان تکراری می‌شد.
   */
  const nmPlan = () => {
    const sel = nmSelUsers();
    if (!sel.length) return [];
    const pat = nmPat();
    return sel.map((u) => ({
      id: u.id, user: u.name, pattern: pat,
      /* نامِ نخستین کانفیگِ سابِ این کاربر */
      name: nmRender(pat, nmVars(u, 1)),
    }));
  };
  const nmPreviewHtml = () => {
    const users = (S.d && S.d.users) || [];
    if (!users.length) return '<div class="empty">هنوز کانفیگی ساخته نشده است</div>';
    const sel = nmSelUsers();
    const chips = '<div class="hint" style="margin-bottom:6px">کانفیگ‌هایی که الگو روی آن‌ها اعمال می‌شود:</div>' +
      '<div class="chips" style="margin-bottom:10px">' + users.map((u) =>
        '<button type="button" class="chip" data-nm-user="' + esc(u.id) + '" style="' +
        (NM.sel[u.id] ? 'background:var(--ac);border-color:var(--ac);color:#fff' : 'opacity:.5') + '">' +
        esc(u.name) + '</button>').join('') + '</div>';
    if (!sel.length) return chips + '<div class="empty">هیچ کانفیگی انتخاب نشده — روی نامِ کانفیگ‌ها در بالا کلیک کنید</div>';
    const pat = nmPat();
    return chips + '<div class="list">' + sel.map((u) => {
      const samples = nmSamples(u, pat);
      return '<div class="row-item">' + icon('fa-pen') +
      '<div class="grow"><b>' + esc(u.name) + '</b>' +
      '<div class="mono cell-sub">الگو: ' + esc(pat) + '</div>' +
      (samples.length ? '<div class="hint" style="margin-top:3px">نامِ کانفیگ‌ها در ساب: ' +
        samples.map((x) => '<span class="mono">' + esc(x) + '</span>').join(' • ') + '</div>' : '') +
      '</div></div>';
    }).join('') + '</div>';
  };
  /* نوشتنِ الگو در فیلد و به‌روزرسانیِ پیش‌نمایش — بدون رندرِ دوباره‌ی صفحه */
  const nmSetPattern = (p) => {
    const el = $('#nmPat');
    if (el) { el.value = p; el.focus(); try { el.setSelectionRange(p.length, p.length); } catch (e) {} }
    NM.pat = p;
    nmShow();
  };
  /* درجِ توکن در محلِ کرسر، نه در انتهای الگو */
  const nmInsert = (txt) => {
    const el = $('#nmPat');
    if (!el) return;
    const st = el.selectionStart == null ? el.value.length : el.selectionStart;
    const en = el.selectionEnd == null ? el.value.length : el.selectionEnd;
    el.value = el.value.slice(0, st) + txt + el.value.slice(en);
    NM.pat = el.value;
    nmShow();
    el.focus();
    const p = st + txt.length;
    try { el.setSelectionRange(p, p); } catch (e) {}
  };

  /* ═══════════════════════════════════════════════════════════════
     مرحله‌ی ۴ — سرورهای خروجی VLESS
     ═══════════════════════════════════════════════════════════════ */
  /* ═══════ فرمِ تک‌فیلدی ═══════
     افزودن/ویرایشِ سرور خروجی فقط با یک لینکِ vless:// انجام می‌شود: کاربر
     لینک را می‌چسباند و ورکر خودش آدرس، پورت، یو‌یو‌آی‌دی، امنیت، انتقال،
     مسیر، SNI و بقیه را از آن می‌خواند. هر کلیدِ ناشناس هم در params می‌نشیند
     تا چیزی از لینک گم نشود. */
  /* سریال‌سازیِ معکوس: سرورِ ذخیره‌شده → لینکِ vless://
     ترتیب و نامِ کلیدها با VLESS_QUERY_MAP در ورکر یکی است، پس لینکی که اینجا
     ساخته می‌شود همان سروری را می‌سازد که کاربر روی «ویرایش» کلیک کرده بود. */
  const exitToLink = (s) => {
    const v = (s && typeof s === 'object') ? s : {};
    const params = (v.params && typeof v.params === 'object') ? v.params : {};
    const q = new URLSearchParams();
    /* encryption جزو فیلدهای خودِ سرور نیست و در params نشسته؛ سر جایش برمی‌گردد */
    const put = (k, val) => { if (val !== undefined && val !== null && String(val) !== '') q.set(k, String(val)); };
    put('encryption', params.encryption);
    put('security', v.security || 'tls');
    put('sni', v.sni);
    put('type', v.transport || 'ws');
    put('host', v.host);
    put('path', v.path);
    put('serviceName', v.serviceName);
    put('flow', v.flow);
    /* هر پارامترِ ناشناخته‌ای که ورکر نگه داشته (alpn، fp، …) دست‌نخورده برمی‌گردد */
    Object.keys(params).forEach((k) => { if (k !== 'encryption') put(k, params[k]); });
    const name = String(v.name || '').trim();
    return 'vless://' + encodeURIComponent(String(v.uuid || '')) + '@' + String(v.address || '') +
      ':' + (Number(v.port) || 443) + '?' + q.toString() + (name ? '#' + encodeURIComponent(name) : '');
  };
  const exitBlank = () => ({ id: '', link: '' });
  /* سروری که id دارد از روی خودش لینک می‌شود؛ فرمِ «تازه» همان لینکِ خالی است */
  const exitRead = (s) => ({ id: (s && s.id) || '', link: (s && s.id) ? exitToLink(s) : ((s && s.link) || '') });
  /* فرم از روی idهای خودش خوانده می‌شود، نه data-p — وگرنه collect() در هنگامِ
     ذخیره‌ی تنظیمات این فیلدها را هم به /api/settings می‌فرستاد. */
  const xf = (k) => { const e = $('#ex_' + k); return e ? String(e.value == null ? '' : e.value).trim() : ''; };
  /* قراردادِ ارسال با ورکر: { op:'add', link } یا { op:'update', id, link } — و بس */
  const exitFormRead = () => ({ id: xf('id'), link: xf('link') });
  const exitFormHtml = (x) => {
    const v = exitRead(x);
    return '<div class="um-sec" style="margin-top:10px">' +
      '<div class="um-sec-h">' + icon(v.id ? 'fa-pen' : 'fa-plus') + '<span>' + (v.id ? 'ویرایشِ سرور خروجی' : 'سرور خروجیِ تازه') + '</span></div>' +
      '<div style="padding:10px 0 0">' +
      '<label class="f"><span>لینکِ vless://</span><textarea id="ex_link" rows="3" class="mono"' +
      ' style="direction:ltr;text-align:left"' +
      ' placeholder="vless://7e2c8d71-0000-4000-8000-000000000000@de1.example.com:443?encryption=none&amp;security=tls&amp;type=ws&amp;path=%2F#آلمان">' +
      esc(v.link) + '</textarea>' +
      '<div class="hint" style="margin-top:5px">فقط لینک را اینجا بچسبانید — چیزِ دیگری لازم نیست. ' +
      'نام از بخشِ بعد از <span class="mono">#</span> خوانده می‌شود و بقیه (آدرس، پورت، یو‌یو‌آی‌دی، امنیت، ' +
      'انتقال، مسیر، SNI و…) از خودِ لینک.</div></label>' +
      '</div>' +
      '<input type="hidden" id="ex_id" value="' + esc(v.id) + '">' +
      '<div class="btn-row" style="margin-top:10px;gap:6px">' +
      '<button class="btn p" data-act="exit-save">' + icon('fa-floppy-disk') + ' ' + (v.id ? 'ذخیره‌ی تغییرات' : 'افزودن سرور') + '</button>' +
      '<button class="btn ghost" data-act="exit-cancel">' + icon('fa-xmark') + ' انصراف</button></div>' +
      '</div>';
  };
  const exTestHtml = () => {
    if (EX.testing) return '<div class="hint" style="margin-top:8px">در حال تستِ اتصال…</div>';
    const r = EX.test;
    if (!r || !r.name) return '';
    const good = !!r.reachable;
    return '<div class="row-item" style="margin-top:8px">' + icon(good ? 'fa-circle-check' : 'fa-circle-xmark') +
      '<div class="grow"><b>' + esc(r.name) + ' — ' + (good ? 'اتصال برقرار شد' : 'اتصال برقرار نشد') + '</b>' +
      '<div class="cell-sub">' + (good ? ('زمان پاسخ: ' + fa(Number(r.ms) || 0) + ' میلی‌ثانیه') : ('علت: ' + esc(r.error || 'نامشخص'))) +
      (r.transport ? ' • ' + esc(r.transport) : '') + (r.security ? ' • ' + esc(r.security) : '') + '</div></div>' +
      '<span class="badge ' + (good ? 'ok' : 'bad') + '">' + (good ? fa(Number(r.ms) || 0) + ' ms' : 'ناموفق') + '</span></div>';
  };
  const exitsHtml = (d) => {
    if (EX.err) {
      return '<div class="badge bad">' + icon('fa-triangle-exclamation') + ' ' + esc(EX.err) + '</div>' +
        '<div class="hint" style="margin-top:6px">دکمه‌ی «بارخوانی» را بزنید تا دوباره تلاش شود.</div>';
    }
    if (!d || !d.servers) return '<div class="empty">در حال دریافتِ فهرستِ سرورهای خروجی…</div>';
    const servers = d.servers || [];
    /* پیش‌فرضِ سراسری */
    const defSel = '<div class="row-item" style="margin-bottom:10px">' + icon('fa-route') +
      '<div class="grow"><b>پیش‌فرضِ سراسری</b><div class="cell-sub">کانفیگ‌هایی که روی «پیروی از پیش‌فرض» هستند از این مسیر می‌روند' +
      '<br>مؤثر در حال حاضر: <b>' + esc(((d.effective || {}).name) || 'مستقیم') + '</b></div></div>' +
      '<select id="exDefault" style="max-width:200px"><option value="">مستقیم (بدون واسطه)</option>' +
      servers.map((s) => '<option value="' + esc(s.id) + '"' + (d.defaultMode === 'exit' && d.defaultExit === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') +
      '</select><button class="btn sm p" data-act="exit-default">' + icon('fa-floppy-disk') + ' ذخیره</button></div>';
    /* فهرستِ سرورها */
    const list = servers.length
      ? '<div class="list">' + servers.map((s) => '<div class="row-item">' +
          '<span class="dot ' + (s.enabled ? 'on' : 'bad') + '"></span>' +
          '<div class="grow"><b>' + esc(s.name) + '</b> ' +
          '<span class="badge ' + (s.enabled ? 'ok' : 'bad') + '">' + (s.enabled ? 'فعال' : 'غیرفعال') + '</span>' +
          '<div class="mono cell-sub">' + esc(s.address) + ':' + fa(s.port) + ' • ' + esc(s.security) + '/' + esc(s.transport) + '</div></div>' +
          '<button class="btn sm s" data-act="exit-test" data-id="' + esc(s.id) + '" title="تست اتصال">' + icon('fa-stethoscope') + '</button>' +
          '<button class="btn sm" data-act="exit-edit" data-id="' + esc(s.id) + '" title="ویرایش">' + icon('fa-pen') + '</button>' +
          '<button class="btn sm d" data-act="exit-del" data-id="' + esc(s.id) + '" title="حذف">' + icon('fa-trash-can') + '</button>' +
          '</div>').join('') + '</div>'
      : '<div class="empty">هنوز سرور خروجی‌ای تعریف نشده است</div>';
    /* انتخابِ هر کانفیگ */
    const per = (d.perConfig || []).length
      ? '<div class="hint" style="margin:12px 0 6px"><b>انتخاب برای هر کانفیگ</b> — بر پیش‌فرضِ سراسری مقدم است:</div>' +
        '<div class="list">' + d.perConfig.map((c) => '<div class="row-item">' + icon('fa-user') +
          '<div class="grow"><b>' + esc(c.name) + '</b><div class="cell-sub">مؤثر: ' + esc(c.effectiveId ? ((servers.find((s) => s.id === c.effectiveId) || {}).name || c.effectiveMode) : 'مستقیم') + '</div></div>' +
          '<select id="exSel-' + esc(c.id) + '" style="max-width:200px">' +
          '<option value="inherit"' + (c.mode === 'inherit' ? ' selected' : '') + '>پیروی از پیش‌فرضِ سراسری</option>' +
          '<option value="direct"' + (c.mode === 'direct' ? ' selected' : '') + '>مستقیم (بدون واسطه)</option>' +
          servers.map((s) => '<option value="' + esc(s.id) + '"' + (c.mode === 'exit' && c.exitId === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') +
          '</select></div>').join('') + '</div>'
      : '';
    return defSel + list + exTestHtml() +
      (EX.form ? exitFormHtml(EX.form) : '') + per;
  };
  async function exLoad() {
    const r = await api('GET', '/api/exits');
    if (r && !r.error && Array.isArray(r.servers)) { EX.data = r; EX.err = ''; }
    else EX.err = (r && r.error) ? String(r.error) : 'دریافتِ فهرستِ سرورهای خروجی انجام نشد';
    exShow();
  }

  /* ═══════════════════════════════════════════════════════════════
     مرحله‌ی ۴ — پشتیبان و بازیابی با کشیدن و رها کردن
     ═══════════════════════════════════════════════════════════════ */
  const bkName = (d) => 'panel-backup-' + new Date((d && d.exportedAt) || Date.now()).toISOString().slice(0, 10) + '.json';
  const bkOutHtml = (d) => {
    if (!d || !d.kind) return '<div class="empty">هنوز پشتیبانی ساخته نشده — دکمه‌ی «ساخت پشتیبان» را بزنید</div>';
    const txt = JSON.stringify(d);
    return '<div class="row-item" id="bkHandle" draggable="true" style="cursor:grab" title="این کارت را بکشید و در پوشه رها کنید">' +
      icon('fa-box-open') +
      '<div class="grow"><b class="mono">' + esc(bkName(d)) + '</b>' +
      '<div class="cell-sub">' + fa(((d.data || {}).users || []).length) + ' کاربر • ' + bytes(txt.length) + ' • نسخه ' + esc(d.version || '—') + '</div>' +
      '<div class="hint" style="margin-top:4px">برای ذخیره، این کارت را به بیرون بکشید (یا دکمه‌ی دانلود را بزنید)</div></div>' +
      '<button class="btn sm p" data-act="bk-download">' + icon('fa-download') + ' دانلود</button></div>';
  };
  const bkInfoHtml = () => {
    const f = BK.file;
    if (!f || !f.data) return '';
    const d = f.data;
    return '<div style="margin-top:10px">' +
      '<div class="kv"><span>' + icon('fa-box-open') + ' نسخه</span><b class="mono">' + esc(f.version || '—') + '</b></div>' +
      '<div class="kv"><span>تاریخ پشتیبان</span><b>' + (f.exportedAt ? new Date(f.exportedAt).toLocaleString('fa-IR') : '—') + '</b></div>' +
      '<div class="kv"><span>تعداد کاربر</span><b>' + fa((d.users || []).length) + '</b></div>' +
      '<div class="kv"><span>مخزن</span><b class="mono">' + esc(f.storage || '—') + '</b></div>' +
      '<div class="hint" style="margin-top:8px">روشِ بازیابی:</div>' +
      '<div class="seg" style="margin-top:5px">' +
      [['merge', 'ادغام با تنظیماتِ فعلی'], ['replace', 'جایگزینی کامل']].map(([k, l]) =>
        '<button data-act="bk-mode" data-v="' + k + '" class="' + (BK.mode === k ? 'on' : '') + '">' + l + '</button>').join('') +
      '</div>' +
      '<div class="btn-row" style="margin-top:8px;gap:6px">' +
      '<button class="btn p" data-act="bk-restore">' + icon('fa-rotate-left') + ' بازیابی</button>' +
      '<button class="btn ghost" data-act="bk-cancel">' + icon('fa-xmark') + ' انصراف</button></div>' +
      '</div>';
  };
  const bkErrHtml = () => {
    if (!BK.err && !(BK.errors || []).length) return '';
    return '<div style="margin-top:10px"><div class="badge bad">' + icon('fa-triangle-exclamation') + ' ' +
      esc(BK.err || 'فایل پشتیبان نامعتبر است و هیچ تغییری اعمال نشد') + '</div>' +
      ((BK.errors || []).length ? '<div class="list" style="margin-top:6px">' + BK.errors.map((e) =>
        '<div class="row-item">' + icon('fa-circle-xmark') + '<div class="grow">' + esc(e) + '</div></div>').join('') + '</div>' : '') +
      '</div>';
  };
  async function bkReadFile(f) {
    BK.err = ''; BK.errors = []; BK.file = null;
    let txt = '';
    try { txt = await f.text(); } catch (e) { BK.err = 'خواندنِ فایل انجام نشد'; bkShow(); toast(BK.err, 'err'); return; }
    let j = null;
    try { j = JSON.parse(txt); } catch (e) { BK.err = 'این فایل یک JSON معتبر نیست'; bkShow(); toast(BK.err, 'err'); return; }
    if (!j || typeof j !== 'object') { BK.err = 'ساختارِ فایل پشتیبان شناخته نشد'; bkShow(); toast(BK.err, 'err'); return; }
    /* هم «{kind,version,data:{…}}» پذیرفته می‌شود و هم خودِ داده‌ی خام */
    const d = (j.data && typeof j.data === 'object') ? j.data : j;
    BK.file = { kind: j.kind || '', version: j.version || '', build: j.build || '',
      exportedAt: j.exportedAt || 0, storage: j.storage || '', source: j.source || '', data: d };
    bkShow();
    toast('فایل پشتیبان خوانده شد — ' + fa((d.users || []).length) + ' کاربر • حالا روشِ بازیابی را انتخاب کنید', 'info');
  }
  /* ظاهرِ ناحیه هنگامی که فایلی روی آن کشیده می‌شود */
  const bkZone = (e) => (e && e.target && e.target.closest ? e.target.closest('#bkDrop') : null);
  const bkZoneOn = (z, on) => {
    if (!z) return;
    z.classList.toggle('on', on);
    z.style.borderColor = on ? 'var(--ac)' : '';
    z.style.background = on ? 'color-mix(in oklab, var(--ac) 12%, transparent)' : '';
  };

  /* ═══════════════════════════════════════════════════════════════
     مرحله‌ی ۴ — تغییرِ رمز عبور
     ═══════════════════════════════════════════════════════════════ */
  const pwOutHtml = () => {
    if (PW.locked) {
      return '<div class="badge bad">' + icon('fa-lock') + ' رمز عبور از متغیر محیطی MASTER_KEY خوانده می‌شود</div>' +
        '<div class="hint" style="margin-top:6px">برای همین از این صفحه قابل تغییر نیست؛ مقدار را در تنظیماتِ ورکر (Variables and Secrets) عوض کنید. ' +
        'هر زمان تغییرش دادید این صفحه را بارگیریِ دوباره کنید.</div>';
    }
    if (!PW.msg) return '';
    const k = PW.kind || 'info';
    return '<div class="badge ' + (k === 'ok' ? 'ok' : k === 'err' ? 'bad' : 'b2') + '">' +
      icon(k === 'ok' ? 'fa-circle-check' : k === 'err' ? 'fa-circle-xmark' : 'fa-circle-info') + ' ' + esc(PW.msg) + '</div>';
  };

  /* ─────────── ناوبری و اسکیمای تنظیمات ─────────── */
  /* ناوبری — تمیز، بدون تکرار */
  const NAV = [
    { g: 'اصلی', items: [['dash', 'نمای کلی', 'fa-gauge-high'], ['users', 'کاربران', 'fa-users']] },
    { g: 'شبکه', items: [['conns', 'اتصال‌های زنده', 'fa-activity'], ['monitor', 'آمار مصرف', 'fa-chart-line']] },
    { g: 'پیکربندی', items: [['config', 'پیکربندی', 'fa-gear'], ['sub', 'لینک ساب', 'fa-link'], ['security', 'امنیت', 'fa-shield-halved']] },
    { g: 'سیستم', items: [['logs', 'لاگ', 'fa-list-check'], ['settings', 'پشتیبان', 'fa-database']] },
  ];

  /* ═══ اسکیمای تنظیمات ═══
     فقط گروهی که واقعاً رندر می‌شود اینجا مانده. گروه‌های proto / network /
     telegram / cloud / update پیش از این تعریف شده بودند ولی هیچ مسیری به
     آن‌ها نداشتند (schemaView مرده بود و همه‌ی viewهای قدیمی به configView
     می‌رسیدند)، برای همین فیلدهایشان در هیچ صفحه‌ای دیده نمی‌شد. تنظیماتی
     که کاربر واقعاً لازم دارد در خودِ configView هستند. */
  const SCHEMA = {
    security: [
      { t: 'احراز هویت', icon: 'fa-key', d: 'توکن ۲۴ ساعته + 2FA + rate limit', two: 1, f: [
        { p: 'auth.totp', l: '2FA (TOTP / Google Authenticator)', t: 'sw' },
        { p: 'auth.sessionMin', l: 'انقضای نشست (دقیقه)', t: 'rng', min: 5, max: 1440, step: 5, u: ' دقیقه' },
        { p: 'auth.loginRate', l: 'محدودیت ورود', t: 'text', mono: 1, h: '۵ تلاش در ۱۰ دقیقه' },
        { p: 'auth.recoveryTg', l: 'بازیابی از تلگرام', t: 'sw' },
        { p: 'auth.recoveryCf', l: 'بازیابی با توکن کلودفلر', t: 'sw' },
      ] },
      { t: 'مسیر ورود و سایت پوششی', icon: 'fa-mask', d: 'پنل روی مسیر مخفی؛ ریشه‌ی دامنه یک سایت واقعی نشان می‌دهد', two: 1, f: [
        { p: 'auth.path', l: 'مسیر ورود پنل', t: 'text', mono: 1, h: 'پنل روی /این‌مسیر سرو می‌شود. ریشه (/) سایت پوششی واقعی نشان می‌دهد' },
        { p: 'auth.disguise', l: 'Disguise mode', t: 'sw', h: 'روشن = ریشه و هر مسیر ناشناخته سایت پوششی را نشان می‌دهد. خاموش = ریشه هم پنل را نشان می‌دهد' },
        /* ⚠️ گزینه‌ها باید دقیقاً با کلیدهای DECOY_SITES/DECOY_PAGES در ورکر یکی باشند؛
           قبلاً wiki/wp/maintenance اینجا بودند ولی در ورکر وجود نداشتند، برای همین
           انتخابِ کاربر بی‌اثر می‌شد و همه چیز به nginx برمی‌گشت. */
        { p: 'auth.maintenanceHost', l: 'سایت پوششی واقعی', t: 'sel', o: ['nginx', 'ubuntu', 'docker', 'cloudflare', 'python', 'node'], lbls: { nginx: 'nginx.org — صفحه‌ی خوش‌آمدگویی', ubuntu: 'Ubuntu Server — مستندات', docker: 'Docker Docs — مستندات', cloudflare: 'Cloudflare Workers — مستندات', python: 'Python Docs — مستندات', node: 'Node.js Docs — مستندات' } },
        { p: 'auth.decoyUrl', l: 'آدرس سایت پوششی دلخواه', t: 'text', mono: 1, h: 'خالی = یکی از سایت‌های بالا. هر آدرس واقعی دیگری هم می‌شود (واکشیِ زنده؛ اگر در دسترس نباشد صفحه‌ی داخلی جایگزین می‌شود)' },
        { p: 'auth.pathRotate', l: 'چرخش خودکار مسیر', t: 'sw' },
        { p: 'auth.panic', l: 'Panic mode', t: 'sw', bad: 1, h: 'پنل و لینک ساب (صفحه‌ی کاربر) هم پشتِ سایت پوششی پنهان می‌شوند. /health و /api باز می‌مانند تا بتوانید آن را دوباره خاموش کنید' },
        { p: 'sec.killSwitch', l: 'Kill Switch', t: 'sw', bad: 1 },
        { p: 'sec.ipConnLimit', l: 'سقف IP همزمان هر کاربر (پیش‌فرض سراسری)', t: 'num', h: '۰ = نامحدود • بیشینه‌ی تعداد IPهایی که همزمان می‌توانند با یک حساب وصل شوند (مدل Nova-Proxy). مقدار هر کاربر بر این اولویت دارد' },
        { p: 'sec.speedTestUrl', l: 'نشانی فایل تست ترافیک', t: 'text', h: 'پیش‌فرض: speed.cloudflare.com/__down • باید یک نشانی «خارجی» باشد (ورکر نمی‌تواند خودش را صدا بزند)' },
        { p: 'sec.cors', l: 'هدرهای CORS', t: 'sw' },
        { p: 'sec.csp', l: 'Security headers (CSP/XFO/nosniff)', t: 'sw' },
      ] },
    ],
  };
  const SCHEMA_SUB = [
    { t: 'تنظیمات لینک ساب', icon: 'fa-link', two: 1, f: [
      { p: 'sub.path', l: 'مسیر ساب', t: 'text', mono: 1, h: 'هم لینک ساب (داشبورد کاربر) و هم خروجی کلاینت روی همین مسیر است' },
      { p: 'sub.userAgent', l: 'فیلتر User-Agent', t: 'text', mono: 1 },
      { p: 'sub.fakeConfigs', l: 'کانفیگ‌های فیک فعال', t: 'sw', h: 'کانفیگ‌های اطلاعاتی در ابتدای لیست ساب کلاینت نمایش داده می‌شوند' },
      { p: 'sub.nodeLimit', l: 'Node limit', t: 'num' },
      { p: 'sub.converter', l: 'Converter API', t: 'text', mono: 1 },
      { p: 'sub.telegramChannel', l: 'خط کانال تلگرام', t: 'text', mono: 1, h: 'قابل غیرفعال‌سازی نیست' },
      { p: 'sub.countryGroups', l: 'گروه‌بندی خودکار کشورها', t: 'sw' },
      { p: 'sub.namePrefix', l: 'پیشوند نام کانفیگ', t: 'text' },
    ] },
    { t: 'قواعد روتینگ', icon: 'fa-route', d: 'DOMAIN / IP-CIDR / GEOIP / GEOSITE', two: 1, f: [
      { p: 'sub.rules', l: 'قواعد (هر خط یک قاعده)', t: 'area', dt: 'lines', h: 'GEOIP,IR,DIRECT\nGEOSITE,category-ads-all,REJECT' },
      { p: 'sub.blockAdult', l: 'بلاک محتوای بزرگسال', t: 'sw' },
      { p: 'sub.blockAds', l: 'بلاک تبلیغات و ردیاب', t: 'sw' },
      { p: 'sub.blockQuic', l: 'مسدودسازی QUIC', t: 'sw' },
      { p: 'sub.bypassIR', l: 'عبور مستقیم ترافیک ایران', t: 'sw' },
      { p: 'sub.doh', l: 'DNS رمزنگاری‌شده برای کلاینت', t: 'text', mono: 1 },
    ] },
  ];

  const UF = [
    { p: 'name', l: 'نام کاربر', t: 'text', req: 1 },
    { p: 'note', l: 'یادداشت', t: 'text' },
    { p: 'uuid', l: 'UUID (VLESS/VMess)', t: 'text', mono: 1 },
    { p: 'secret', l: 'رمز Trojan / SS', t: 'text', mono: 1 },
    { p: 'quotaGB', l: 'سهمیه کل (GB) — ۰ = نامحدود', t: 'num' },
    { p: 'dailyQuotaMB', l: 'سهمیه روزانه (MB)', t: 'num' },
    { p: 'expiryDays', l: 'انقضا (روز از امروز) — ۰ = نامحدود', t: 'num' },
    /* ⚠️ محدودیت دستگاهی (deviceLimit) کاملاً حذف شد — فقط IP واقعی کلاینت */
    { p: 'ipLimit', l: 'سقف IP همزمان', t: 'num', h: '۰ = پیش‌فرض سراسری • بیشینه‌ی تعداد IPهای همزمان این کاربر (اتصال‌های بیشتر از همان IP مجاز است)' },
    { p: 'maxConfigs', l: 'سقف کانفیگ', t: 'num' },
    { p: 'speedLimit', l: 'Speed limit (Mbps)', t: 'num' },
    { p: 'mode', l: 'حالت اختصاصی', t: 'sel', o: ['inherit', 'alpha', 'beta', 'both'], lbls: { inherit: 'از تنظیمات عمومی', alpha: 'Alpha — VLESS', beta: 'Beta — Trojan', both: 'Both' } },
    { p: 'ports', l: 'پورت‌های اختصاصی', t: 'text', mono: 1 },
    { p: 'cleanIPs', l: 'Clean IPs اختصاصی (هر خط یکی)', t: 'area', dt: 'lines' },
    { p: 'proxyIPs', l: 'Proxy IPs اختصاصی', t: 'area', dt: 'lines' },
    { p: 'nodes', l: 'Nodes اختصاصی', t: 'area', dt: 'lines' },
    { p: 'nat64', l: 'NAT64 اختصاصی', t: 'text', mono: 1 },
    { p: 'panelUrl', l: 'Panel URL اختصاصی', t: 'text', mono: 1 },
    { p: 'blockAdult', l: 'بلاک محتوای بزرگسال', t: 'sw' },
    { p: 'blockAds', l: 'بلاک تبلیغات', t: 'sw' },
    { p: 'enabled', l: 'کاربر فعال باشد', t: 'sw' },
  ];

  /* ─────────── نماها ─────────── */
  function loginView() {
    const nm = (S.d && S.d.settings && S.d.settings.panel && S.d.settings.panel.name) || 'پنل مدیریت';
    const totp = S.d && S.d.settings && S.d.settings.auth && S.d.settings.auth.totp;
    return '<div class="login"><div class="box">' +
      '<header><span class="ic">' + icon('fa-lock') + '</span><div><h3>' + esc(nm) + '</h3><p>ورود مدیر' + (totp ? ' • 2FA فعال' : '') + '</p></div></header>' +
      '<div class="bd">' +
      '<label class="f"><span>رمز عبور</span><input type="password" id="lgPw" autocomplete="current-password" placeholder="••••••••"></label>' +
      (totp ? '<label class="f"><span>کد دو مرحله‌ای (TOTP)</span><input id="lgTp" class="mono" inputmode="numeric" maxlength="6" placeholder="——————"></label>' : '') +
      '<button class="btn p lg" style="width:100%" data-act="login">' + icon('fa-right-to-bracket') + ' ورود به پنل</button>' +
      '<p class="hint" style="margin-top:12px">محدودیت: ۵ تلاش در ۱۰ دقیقه. رمز پیش‌فرض: <span class="mono">simorgh</span></p>' +
      '</div></div></div>';
  }

  function dashView() {
    const d = S.d, us = d.users, s = d.settings;
    const used = us.reduce((a, u) => a + (u.up || 0) + (u.down || 0), 0);
    const quota = us.reduce((a, u) => a + (u.quotaGB || 0) * 1073741824, 0);
    const on = us.filter((u) => u.enabled).length, exp = us.filter((u) => u.expiryAt && u.expiryAt < Date.now()).length;
    const top = [...us].sort((a, b) => (b.up + b.down) - (a.up + a.down)).slice(0, 6);
    const ser = (d.stats && d.stats.trafficSeries) || Array(24).fill(.2);
    const p = (s.auth && s.auth.path) || 'panel';
    return '<div class="page-head"><div><h1>نمای کلی</h1><p>' + esc(s.panel.name) + ' • ' + esc(location.hostname) + ' • نسخه ' + esc(d.version) + '</p></div>' +
      '<div class="btn-row">' +
      '<span class="badge ' + (d.storage === 'd1' ? 'ok' : 'warn') + '">' + icon(d.storage === 'd1' ? 'fa-database' : 'fa-triangle-exclamation') + ' ' + (d.storage === 'd1' ? 'D1 پایدار' : 'ذخیره‌سازی موقت') + '</span>' +
      '<span class="badge ac">' + esc(s.mode === 'both' ? 'Alpha + Beta' : s.mode) + '</span>' +
      (s.fragment.enabled ? '<span class="badge ac">' + icon('fa-scissors') + ' Fragment</span>' : '') +
      (s.ech.enabled ? '<span class="badge b2">' + icon('fa-shield-halved') + ' ECH</span>' : '') +
      '<span class="badge b2">' + icon('fa-link') + ' /' + esc(s.sub.path) + '</span>' +
      '<span class="badge">' + icon('fa-mask') + ' /' + esc(p) + '</span>' +
      '</div></div>' +
      '<div class="grid g4">' +
      '<div class="stat"><div class="lbl">' + icon('fa-users') + ' کل کاربران</div><div class="val">' + fa(us.length) + '</div><div class="sub">' + fa(on) + ' فعال • ' + fa(exp) + ' منقضی</div></div>' +
      '<div class="stat"><div class="lbl">' + icon('fa-hard-drive') + ' مصرف کل</div><div class="val">' + bytes(used) + '</div><div class="sub">' + (quota ? fa((used / quota * 100).toFixed(0)) + '٪ از سهمیه' : 'بدون سقف') + '</div><div class="bar" style="margin-top:8px"><i style="width:' + (quota ? used / quota * 100 : 0) + '%"></i></div></div>' +
      '<div class="stat"><div class="lbl">' + icon('fa-arrow-up-right-dots') + ' درخواست‌ها</div><div class="val">' + n((d.stats && d.stats.requests) || 0) + '</div><div class="sub">از Cloudflare API</div>' + spark(((d.stats && d.stats.reqSeries) || [.2, .5, .3, .6, .4])) + '</div>' +
      '<div class="stat"><div class="lbl">' + icon('fa-tower-broadcast') + ' گره‌ها</div><div class="val">' + fa(s.cleanIPs.length) + '</div><div class="sub">' + fa(s.ports.length) + ' پورت • ' + fa(s.proxyIPs.length) + ' پروکسی</div></div>' +
      '</div>' +
      '<div class="grid g2" style="margin-top:12px">' +
      '<div class="card"><header><span class="ic">' + icon('fa-chart-line') + '</span><div><h3>جریان ترافیک</h3><p>۲۴ روز اخیر (گیگابایت) — موس را روی نمودار ببرید</p></div></header><div class="bd" id="chartWrap">' + area(ser, { unit: ' GB' }) + '</div></div>' +
      '<div class="card"><header><span class="ic b2">' + icon('fa-ranking-star') + '</span><div><h3>بیشترین مصرف‌کنندگان</h3><p>۶ کاربر اول</p></div></header><div class="bd">' +
      (top.map((u) => { const q = (u.quotaGB || 0) * 1073741824, pc = q ? (u.up + u.down) / q * 100 : 0; return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
        '<span class="dot ' + (u.enabled ? 'on' : 'bad') + '"></span>' +
        '<div style="min-width:0;flex:1"><div class="cell-main">' + esc(u.name) + '</div><div class="cell-sub mono">' + esc(String(u.uuid).slice(0, 14)) + '…</div></div>' +
        '<div class="bar ' + (pc > 90 ? 'bad' : pc > 70 ? 'warn' : '') + '" style="max-width:120px"><i style="width:' + pc + '%"></i></div>' +
        '<b class="mono" style="font-size:11px">' + bytes(u.up + u.down) + '</b></div>'; }).join('') || '<div class="empty">کاربری وجود ندارد</div>') +
      '</div></div></div>' +
      '<div class="grid g3">' +
      '<div class="card"><header><span class="ic">' + icon('fa-shield-halved') + '</span><div><h3>پروتکل‌ها</h3></div></header><div class="bd">' +
      Object.entries(s.protocols).map(([k, v]) => '<div class="kv"><span>' + k.toUpperCase() + '</span><span class="badge ' + (v ? 'ok' : '') + '">' + (v ? 'فعال' : 'خاموش') + '</span></div>').join('') +
      '<div class="kv"><span>ترنسپورت</span><b>' + esc(s.transport) + '</b></div>' +
      '<div class="kv"><span>fingerprint</span><b class="mono">' + esc(s.fingerprint) + '</b></div>' +
      '<div class="kv"><span>Trojan hash</span><b class="mono">' + esc(s.trojanHash) + '</b></div>' +
      '<div class="kv"><span>مسیر تونل</span><b class="mono">' + esc(s.path) + '</b></div></div></div>' +
      '<div class="card"><header><span class="ic b2">' + icon('fa-gauge-high') + '</span><div><h3>سهمیه‌ی مصرف</h3></div></header><div class="bd" style="display:flex;justify-content:space-around;gap:12px;flex-wrap:wrap">' +
      ring(quota ? used / quota * 100 : 0, 'سهمیه') + ring(quota ? 100 - used / quota * 100 : 100, 'باقیمانده', 'var(--ac2)') +
      '</div></div>' +
      '</div></div>';
  }

  function usersView() {
    const us = S.d.users;
    const searchHits = (u) => {
      const q = (S.q || '').trim().toLowerCase();
      if (!q) return 1;
      return [u.name, u.uuid, u.note, u.secret].join(' ').toLowerCase().includes(q) ? 1 : 0;
    };
    return '<div class="page-head"><div><h1>مدیریت کاربران</h1><p>' + fa(us.length) + ' کاربر • ' + fa(us.filter((u) => u.enabled).length) + ' فعال • تنظیمات اختصاصی برای هر کاربر</p></div>' +
      '<div class="btn-row"><div class="search" style="width:190px" id="uSearchBox"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><input id="uSearch" placeholder="جستجوی نام، UUID، یادداشت…" value="' + esc(S.q || '') + '"></div>' +
      '<button class="btn p" data-act="user-new">' + icon('fa-plus') + ' کاربر جدید</button></div></div>' +
      '<div class="card"><div class="bd" style="padding:0"><div class="tbl-wrap"><table>' +
      '<thead><tr><th>کاربر</th><th>UUID</th><th>مصرف</th><th>سهمیه</th><th>انقضا</th><th>حالت</th><th>اختصاصی</th><th>آخرین فعالیت</th><th>عملیات</th></tr></thead><tbody>' +
      (us.map((u) => {
        const q2 = (u.quotaGB || 0) * 1073741824, pc = q2 ? (u.up + u.down) / q2 * 100 : 0;
        const dl = u.expiryAt ? Math.ceil((u.expiryAt - Date.now()) / 86400000) : null;
        const own = [(u.mode && u.mode !== 'inherit') ? 'mode' : '', u.ports ? 'ports' : '', (u.cleanIPs || []).length ? 'ips' : '', u.panelUrl ? 'url' : '', u.speedLimit ? 'speed' : ''].filter(Boolean);
        return '<tr data-hit="' + searchHits(u) + '" data-uid="' + esc(u.id) + '"><td><div style="display:flex;align-items:center;gap:8px"><span class="dot ' + (u.enabled ? 'on' : 'bad') + '"></span><span class="cell-main">' + esc(u.name) + '</span></div><div class="cell-sub">' + esc(u.note || '—') + '</div></td>' +
          '<td><div class="mono" style="font-size:10.5px">' + esc(String(u.uuid).slice(0, 13)) + '…</div><button class="btn sm ghost" data-act="copy" data-v="' + esc(u.uuid) + '">' + icon('fa-copy') + ' کپی</button></td>' +
          '<td><b class="mono" style="font-size:11px">' + bytes(u.up + u.down) + '</b><div class="bar ' + (pc > 90 ? 'bad' : pc > 70 ? 'warn' : '') + '" style="margin-top:5px"><i style="width:' + pc + '%"></i></div><div class="cell-sub">↓' + bytes(u.down) + ' ↑' + bytes(u.up) + '</div></td>' +
          '<td class="mono">' + (u.quotaGB ? fa(u.quotaGB) + ' GB' : '∞') + '<div class="cell-sub">' + (u.dailyQuotaMB ? fa(u.dailyQuotaMB) + ' MB/روز' : '—') + '</div></td>' +
          '<td>' + (dl === null ? '<span class="badge ok">نامحدود</span>' : dl < 0 ? '<span class="badge bad">منقضی</span>' : '<span class="badge' + (dl <= 7 ? ' warn' : '') + '">' + fa(dl) + ' روز</span>') + '</td>' +
          '<td><span class="badge ' + (u.mode === 'both' ? 'ac' : 'b2') + '">' + esc(u.mode || 'inherit') + '</span></td>' +
          '<td>' + (own.length ? own.map((o) => '<span class="badge ac">' + esc(o) + '</span>').join(' ') : '<span class="cell-sub">—</span>') + '</td>' +
          '<td class="cell-sub">' + ago(u.lastSeen) +
            (u.activeConns ? '<div>' + icon('fa-globe') + ' ' + fa(u.activeConns) + ' اتصال / ' + fa(u.activeIPCount || 0) + ' IP</div>' : '') +
            '<div>' + fa(u.totalReq || 0) + ' req</div></td>' +
          '<td><div class="row-btns">' +
          '<button class="btn sm" data-act="user-edit" data-id="' + u.id + '" title="ویرایش">' + icon('fa-pen') + '</button>' +
          '<button class="btn sm" data-act="user-copy-page" data-id="' + u.id + '" title="کپی لینک ساب">' + icon('fa-clipboard') + '</button>' +
          '<button class="btn sm" data-act="user-reset" data-id="' + u.id + '" title="ریست مصرف">' + icon('fa-rotate-left') + '</button>' +
          '<button class="btn sm ' + (u.enabled ? 'd' : 's') + '" data-act="user-toggle" data-id="' + u.id + '" title="' + (u.enabled ? 'قطع دسترسی' : 'فعال‌سازی') + '">' + icon(u.enabled ? 'fa-ban' : 'fa-circle-check') + '</button>' +
          '<button class="btn sm d" data-act="user-del" data-id="' + u.id + '" title="حذف">' + icon('fa-trash-can') + '</button>' +
          '</div></td></tr>';
      }).join('')) +
      '</tbody></table></div></div></div>';
  }

  /* ═══════════════════════════════════════════════════════════════
     نمای لینک ساب — بازطراحی‌شده
     یک لینک، دو کار: داشبورد کاربر در مرورگر + کانفیگ در کلاینت
     ═══════════════════════════════════════════════════════════════ */
  function subView() {
    const s = S.d.settings, us = S.d.users;
    const u = us.find((x) => x.id === S.sel) || us[0];
    if (!u) return '<div class="page-head"><div><h1>لینک ساب</h1><p>ابتدا یک کاربر بسازید</p></div></div>' +
      '<div class="card"><div class="bd"><div class="empty">هیچ کاربری وجود ندارد — از بخش «کاربران» یکی بسازید</div></div></div>';

    const page = location.origin + '/' + s.sub.path + '/' + u.uuid;
    const q = (u.quotaGB || 0) * 1073741824;
    const used = (u.up || 0) + (u.down || 0);
    const pct = q ? Math.min(100, (used / q) * 100) : 0;
    const dl = u.expiryAt ? Math.ceil((u.expiryAt - Date.now()) / 86400000) : null;

    /* ── کارت اصلی: لینک + آواتار کاربر + وضعیت ── */
    const heroCard = () =>
      '<div class="card sub-hero"><div class="bd">' +
      '<div class="sub-hero-top">' +
        /* آواتار و نام */
        '<div class="sub-user">' +
          '<span class="sub-ava">' + esc(String(u.name || '?').charAt(0)) + '</span>' +
          '<div><b>' + esc(u.name) + '</b>' +
          '<span class="cell-sub mono">' + esc(String(u.uuid).slice(0, 18)) + '…</span></div>' +
        '</div>' +
        /* انتخاب کاربر */
        '<select data-act="sel-user" style="width:auto;min-width:130px">' +
          us.map((x) => '<option value="' + x.id + '"' + (x.id === u.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') +
        '</select>' +
      '</div>' +

      /* لینک بزرگ + دکمه‌ها */
      '<div class="sub-link-box">' +
        '<div class="sub-link-url mono">' + esc(page) + '</div>' +
        '<button class="btn p" data-act="copy" data-v="' + esc(page) + '">' + icon('fa-clipboard') + ' کپی</button>' +
        '<button class="btn" data-act="open" data-v="' + esc(page) + '">' + icon('fa-arrow-up-right-from-square') + '</button>' +
        '<button class="btn" data-act="qr" data-v="' + esc(page) + '">' + icon('fa-qrcode') + '</button>' +
      '</div>' +

      '<div class="hint">در <b>مرورگر</b> داشبورد کاربر را نشان می‌دهد، در <b>کلاینت</b> کانفیگ‌ها را می‌گیرد</div>' +
      '</div></div>';

    /* ── کارت وضعیت: مصرف + انقضا ── */
    const statusCard = () =>
      '<div class="card"><header><span class="ic">' + icon('fa-database') + '</span><div><h3>وضعیت</h3></div></header>' +
      '<div class="bd">' +
      '<div class="sub-stats">' +
        '<div class="sub-stat"><span>مصرف</span><b>' + bytes(used) + '</b><i>از ' + (q ? fa(u.quotaGB) + ' GB' : 'نامحدود') + '</i></div>' +
        '<div class="sub-stat"><span>باقیمانده</span><b>' + (q ? bytes(Math.max(0, q - used)) : '∞') + '</b><i>' + (q ? fa(pct.toFixed(0)) + '٪ مصرف شده' : 'بدون سقف') + '</i></div>' +
        '<div class="sub-stat"><span>انقضا</span><b>' + (dl === null ? 'نامحدود' : dl < 0 ? 'منقضی' : fa(dl) + ' روز') + '</b><i>' + (dl === null ? '—' : dl < 0 ? 'غیرفعال' : 'تا ' + new Date(u.expiryAt).toLocaleDateString('fa-IR')) + '</i></div>' +
        '<div class="sub-stat"><span>وضعیت</span><b>' + (u.enabled ? 'فعال' : 'غیرفعال') + '</b><i>' + fa(u.totalReq || 0) + ' اتصال</i></div>' +
      '</div>' +
      (q ? '<div class="bar' + (pct > 90 ? ' bad' : pct > 70 ? ' warn' : '') + '" style="margin-top:10px"><i style="width:' + pct + '%"></i></div>' : '') +
      '</div></div>';

    /* ── کارت خروجی کلاینت ── */
    const outputCard = () =>
      '<div class="card"><header><span class="ic b2">' + icon('fa-download') + '</span>' +
      '<div><h3>خروجی کلاینت</h3><p>فرمت را انتخاب و پیش‌نمایش بگیرید</p></div>' +
      '<div class="acts"><div class="seg">' +
        ['base64', 'raw', 'clash', 'singbox', 'v2ray'].map((x) =>
          '<button data-act="fmt" data-v="' + x + '" class="' + (S.fmt === x ? 'on' : '') + '">' + x + '</button>').join('') +
      '</div></div></header>' +
      '<div class="bd">' +
      '<div class="btn-row" style="margin-bottom:10px">' +
        '<button class="btn s" data-act="sub-load" data-id="' + u.id + '">' + icon('fa-eye') + ' پیش‌نمایش</button>' +
        '<button class="btn" data-act="copy" data-v="' + esc(page + '?format=' + S.fmt) + '">' + icon('fa-copy') + ' کپی لینک ' + esc(S.fmt) + '</button>' +
      '</div>' +
      '<div id="subOut"><div class="empty">برای دیدن خروجی، «پیش‌نمایش» را بزنید</div></div>' +
      '</div></div>';

    return '<div class="page-head"><div><h1>لینک ساب</h1><p>یک لینک برای همه‌ی کلاینت‌ها</p></div></div>' +
      heroCard() + statusCard() + outputCard() + fakeConfigsCard();
  }

  /* ═══════════ رندرِ گزارشِ «تست واقعی ترافیک» ═══════════
     هر بار که پنل بازسازی می‌شود (رفرش، تغییر بخش، ذخیره‌ی تنظیمات)
     این تابع گزارشِ آخرین تست را دوباره می‌نویسد — پس گزارش هیچ‌وقت
     به‌طور خودکار پاک نمی‌شود؛ فقط تستِ جدید جایگزینش می‌کند. */
  function ttHtml(r) {
    if (!r) return '<div class="empty">هنوز تستی اجرا نشده است.</div>';
    const mb = (x) => fa(((x || 0) / 1048576).toFixed(2)) + ' مگابایت';
    const kb = (x) => fa(Math.round((x || 0) / 1024 * 10) / 10) + ' کیلوبایت';
    const stamp = r.ts ? new Date(r.ts).toLocaleString('fa-IR', { hour12: false }) : '';
    const head = '<div class="hint" style="margin-bottom:8px">آخرین تست: <b>' + (stamp ? fa(stamp) : '—') + '</b>' +
      ' • <span class="hint">این گزارش تا وقتی تستِ تازه‌ای نگیرید باقی می‌ماند.</span></div>';
    if (r.failed) {
      return head +
        '<div class="kv"><span>' + icon('fa-circle-xmark') + ' نتیجه‌ی تست</span>' +
        '<b class="mono" style="color:var(--bad)">✗ ناموفق</b></div>' +
        '<div class="kv" style="flex-direction:column;align-items:flex-start"><span>علت</span>' +
        '<b style="font-weight:400;line-height:1.9;color:var(--bad)">' + esc(r.error || 'تست انجام نشد') + '</b></div>';
    }
    return head +
      '<div class="kv"><span>' + icon(r.ok ? 'fa-circle-check' : 'fa-circle-xmark') + ' نتیجه‌ی تست</span>' +
      '<b class="mono" style="color:' + (r.ok ? 'var(--ok)' : 'var(--bad)') + '">' + (r.ok ? '✓ موفق' : '✗ ناموفق') + '</b></div>' +
      '<div class="kv"><span>درخواست از مرورگر</span><b class="mono">' + mb(r.expected || r.want) + ' (' + fa(r.expected || r.want) + ' بایت)</b></div>' +
      '<div class="kv"><span>پاسخِ سرور (دریافت‌شده)</span><b class="mono">' + mb(r.received) + ' (' + fa(r.received) + ' بایت)</b></div>' +
      '<div class="kv"><span>ثبت‌شده برای کاربر</span><b class="mono" style="color:' + (r.ok ? 'var(--ok)' : 'var(--bad)') + '">' + mb(r.measured) + ' (' + fa(r.measured) + ' بایت)</b></div>' +
      '<div class="kv"><span>اختلاف</span><b class="mono">' + (r.diff >= 0 ? '+' : '−') + kb(Math.abs(r.diff)) + '</b></div>' +
      '<div class="kv"><span>تلورانس مجاز</span><b class="mono">±' + kb(r.tolerance) + '</b></div>' +
      '<div class="hint" style="margin-top:8px;font-weight:700;color:' + (r.ok ? 'var(--ok)' : 'var(--bad)') + '">انتظار: ' + mb(r.expected || r.want) + ' / ثبت‌شده: ' + mb(r.measured) + ' ' + (r.ok ? '✓' : '✗') + '</div>' +
      '<div class="hint" style="margin-top:8px">کاربر: ' + esc(r.user || '—') + ' • ⬆ ' + fa(r.up || 0) + ' / ⬇ ' + fa(r.down || 0) +
      ' • ذخیره‌سازی: ' + esc(r.storage || '—') + (r.waitedMs ? ' • انتظار برای ثبت: ' + fa(r.waitedMs) + ' ms' : '') + '</div>' +
      '<div class="hint" style="margin-top:8px">چند کیلوبایت اختلاف به‌خاطر هدرهای HTTP طبیعی است. دانلود توسط مرورگرِ شما انجام شد و حجم آن برای کانفیگِ همین کاربر ثبت گردید.</div>';
  }
  const ttShow = () => { const o = $('#trafficTestOut'); if (o) o.innerHTML = ttHtml(TT.last); };

  /* ═══════════════════════════════════════════════════════════════
     نمای «اتصال‌های زنده»
     همان ردیف‌هایی که محدودساز روی آن‌ها تصمیم می‌گیرد — پس عددِ این
     جدول با عددی که باعث رد شدنِ اتصال می‌شود یکی است.
     ═══════════════════════════════════════════════════════════════ */

  /* کارت‌های خلاصه — از CN.data رندر می‌شوند (نه از DOM)، برای همین
     هر بارخوانی عددها را هم به‌روز می‌کند و فقط جدول نیست که تکان می‌خورد */
  function cnStatsHtml() {
    const d = CN.data || {};
    const sum = d.summary || { users: 0, ips: 0, connections: 0 };
    /* کارتِ «مرجع فعال» حذف شده — سه کارتِ باقی‌مانده در g3 می‌نشینند */
    return '<div class="grid g3">' +
      '<div class="stat"><div class="lbl">کاربران متصل</div><div class="val">' + fa(sum.users || 0) + '</div>' +
      '<div class="sub">از ' + fa(((S.d && S.d.users) || []).length) + ' کاربرِ تعریف‌شده</div></div>' +
      '<div class="stat"><div class="lbl">آی‌پی‌های متمایز</div><div class="val">' + fa(sum.ips || 0) + '</div>' +
      '<div class="sub">همان شمارنده‌ای که سقف روی آن بسته می‌شود</div></div>' +
      '<div class="stat"><div class="lbl">تعداد اتصال‌ها</div><div class="val">' + fa(sum.connections || 0) + '</div>' +
      '<div class="sub">نشستِ در جریان روی این مرجع</div></div>' +
      '</div>';
  }

  /* نشانگرِ کنارِ دکمه‌ی بارخوانی */
  function cnBadgeHtml() {
    if (!CN.data) return '<span class="badge">' + icon('fa-spinner fa-spin') + ' در حال بارگیری…</span>';
    const n = (CN.data.summary || {}).connections || 0;
    return '<span class="badge ' + (n ? 'ok' : '') + '">' + icon('fa-tower-broadcast') + ' به‌روزرسانی خودکار • ' + fa(n) + ' اتصال</span>';
  }

  /* ═══ گروه‌بندیِ نشست‌ها بر پایه‌ی آی‌پی ═══
     جدول یک ردیف به‌ازای هر آی‌پی‌ی متصل نشان می‌دهد: چند نشست روی آن باز
     است، از کدام کانفیگ‌ها آمده و مجموعِ ترافیکِ آن‌ها چقدر است.
     ترتیب: نزولی بر پایه‌ی تعداد اتصال، سپس مجموعِ ترافیک. */
  function cnIps(r) {
    const map = new Map();
    ((r && r.sessions) || []).forEach((s) => {
      if (!s || !s.ip) return;
      let g = map.get(s.ip);
      if (!g) {
        g = { ip: s.ip, cc: s.cc || '', n: 0, users: [], up: 0, down: 0,
              startedAt: s.startedAt || 0, idleSec: null, idle: false, transports: [] };
        map.set(s.ip, g);
      }
      g.n += 1;
      const nm = s.user || (s.known === false ? 'کانفیگ حذف‌شده' : '—');
      if (g.users.indexOf(nm) < 0) g.users.push(nm);
      g.up += s.up || 0;
      g.down += s.down || 0;
      if (s.cc) g.cc = s.cc;
      if (s.transport && g.transports.indexOf(s.transport) < 0) g.transports.push(s.transport);
      /* قدیمی‌ترین شروع = آغازِ حضورِ این آی‌پی */
      if (s.startedAt && (!g.startedAt || s.startedAt < g.startedAt)) g.startedAt = s.startedAt;
      /* کمترین زمانِ بی‌فعالیتی = تازه‌ترین فعالیتِ این آی‌پی */
      if (s.idleSec !== null && s.idleSec !== undefined &&
          (g.idleSec === null || s.idleSec < g.idleSec)) g.idleSec = s.idleSec;
      /* وضعیت: اگر هر نشستی روی این آی‌پی فعال باشد، خودِ آی‌پی فعال است */
      if (g.n === 1) g.idle = !!s.idle;
      else if (!s.idle) g.idle = false;
    });
    return Array.from(map.values()).sort((a, b) =>
      (b.n - a.n) || ((b.up + b.down) - (a.up + a.down)));
  }

  /* جدولِ «آی‌پی‌های متصل» — در هر بار بازسازیِ صفحه از CN.data رندر می‌شود
     (جست‌وجو از این بخش حذف شده است) */
  function cnHtml(r) {
    if (!r || !r.sessions) {
      return '<div class="empty">در حال بارگیریِ اتصال‌های زنده…</div>';
    }
    if (!r.sessions.length) {
      return '<div class="empty">هیچ آی‌پی‌ی متصلی ثبت نشده است — هیچ آی‌پی‌ای قفل نیست.</div>';
    }
    const ips = cnIps(r);
    const stamp = CN.ts ? new Date(CN.ts).toLocaleString('fa-IR', { hour12: false }) : '';
    return '<div class="hint" style="margin-bottom:8px">آخرین بارخوانی: <b>' + (stamp ? fa(stamp) : '—') + '</b>' +
      (CN.err ? ' • <span style="color:var(--bad)">' + esc(CN.err) + '</span>' : '') +
      ' • <span class="hint">جدول هر ۱۰ ثانیه به‌روز می‌شود؛ داده‌ی قبلی تا رسیدنِ پاسخِ تازه سر جایش می‌ماند.</span></div>' +
      '<div style="max-height:460px;overflow:auto" class="tbl-wrap"><table>' +
      '<thead><tr><th>آی‌پی</th><th>کشور</th><th>اتصال‌ها</th><th>کانفیگ‌ها (یوزر)</th><th>ارسال</th>' +
      '<th>دریافت</th><th>انتقال</th><th>شروع</th><th>آخرین فعالیت</th><th>وضعیت</th></tr></thead><tbody>' +
      ips.map((g) => {
        const started = g.startedAt ? new Date(g.startedAt).toLocaleTimeString('fa-IR', { hour12: false }) : '—';
        return '<tr>' +
          '<td class="mono"><b>' + esc(g.ip) + '</b></td>' +
          '<td>' + (g.cc ? '<span class="badge">' + esc(g.cc) + '</span>' : '<span class="cell-sub">—</span>') + '</td>' +
          '<td class="mono">' + fa(g.n) + '</td>' +
          '<td>' + (g.users.length
            ? '<div class="cell-main">' + esc(g.users.join('، ')) + '</div>' +
              '<div class="cell-sub">' + fa(g.users.length) + ' کانفیگ</div>'
            : '<span class="cell-sub">—</span>') + '</td>' +
          '<td class="mono">' + bytes(g.up) + '</td>' +
          '<td class="mono">' + bytes(g.down) + '</td>' +
          '<td>' + (g.transports.length
            ? g.transports.map((t) => '<span class="badge b2">' + esc(t) + '</span>').join(' ')
            : '<span class="cell-sub">—</span>') + '</td>' +
          '<td class="mono">' + esc(started) + '</td>' +
          '<td class="mono">' + (g.idleSec === null ? '—' : durFa(g.idleSec) + ' پیش') + '</td>' +
          '<td>' + (g.idle
            ? '<span class="badge warn">' + icon('fa-triangle-exclamation') + ' بی‌فعالیت</span>'
            : '<span class="badge ok">' + icon('fa-circle-check') + ' فعال</span>') + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  /* ═══ بارخوانیِ اتصال‌ها ═══
     فقط پاسخِ سالم جای داده‌ی قبلی را می‌گیرد: اگر سرور لحظه‌ای پاسخ ندهد،
     جدول همان داده‌ی قبلی را نشان می‌دهد تا نپرد. */
  async function cnLoad() {
    const a = await api('GET', '/api/connections');
    if (a && !a.error && a.sessions) { CN.data = a; CN.ts = Date.now(); CN.err = ''; }
    else if (a && a.error) CN.err = String(a.error);
    cnShow();
  }

  function connsView() {
    return '<div class="page-head"><div><h1>اتصال‌های زنده</h1>' +
      '<p>آی‌پی‌هایی که همین حالا روی همان مرجعی که سقفِ آی‌پی روی آن حساب می‌شود، متصل‌اند — فقط نمایشی</p></div>' +
      '<div class="btn-row">' +
      '<span id="connBadge" style="display:inline-flex">' + cnBadgeHtml() + '</span>' +
      '<button class="btn sm" data-act="conn-load">' + icon('fa-rotate') + ' بارخوانی</button>' +
      '</div></div>' +
      '<div id="connStats">' + cnStatsHtml() + '</div>' +
      '<div class="card" style="margin-top:12px"><header><span class="ic">' + icon('fa-activity') + '</span>' +
      '<div><h3>آی‌پی‌های متصل</h3><p>هر ردیف یک آی‌پی است؛ نشست‌های همان آی‌پی در آن ادغام شده‌اند — فقط نمایشی</p></div>' +
      '</header>' +
      '<div class="bd"><div id="connOut">' + cnHtml(CN.data) + '</div></div></div>';
  }

  function monitorView() {
    const st = S.d.stats || {}, u = S.d.users, r = S.range;
    const ser = (r === 'm' ? st.monthly : r === 'y' ? st.yearly : st.daily) || st.daily || Array(14).fill(.3);
    return '<div class="page-head"><div><h1>مانیتورینگ و آمار</h1><p>مصرف روزانه/ماهانه/سالانه، اتصال‌های فعال و سلامت سرویس</p></div>' +
      '<div class="seg">' + [['d', 'روزانه'], ['m', 'ماهانه'], ['y', 'سالانه']].map(([k, l]) => '<button data-act="range" data-v="' + k + '" class="' + (r === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div></div>' +
      '<div class="grid g4">' +
      '<div class="stat"><div class="lbl">آپلود کل</div><div class="val">' + bytes(u.reduce((a, x) => a + (x.up || 0), 0)) + '</div><div class="sub">' + fa(u.length) + ' کاربر</div></div>' +
      '<div class="stat"><div class="lbl">دانلود کل</div><div class="val">' + bytes(u.reduce((a, x) => a + (x.down || 0), 0)) + '</div><div class="sub">اتصال فعال: ' + fa(st.connections || 0) + '</div></div>' +
      '<div class="stat"><div class="lbl">درخواست‌ها</div><div class="val">' + n(st.requests || 0) + '</div><div class="sub">uptime ' + fa(Math.floor((Date.now() - S.d.boot) / 60000)) + ' دقیقه</div></div>' +
      '<div class="stat"><div class="lbl">نسخه / بیلد</div><div class="val" style="font-size:15px">' + esc(S.d.version) + '</div><div class="sub">' + esc(S.d.build || '—') + '</div></div>' +
      '</div>' +
      '<div class="grid g2" style="margin-top:12px">' +
      '<div class="card"><header><span class="ic">' + icon('fa-chart-area') + '</span><div><h3>مصرف ' + (r === 'd' ? 'روزانه' : r === 'm' ? 'ماهانه' : 'سالانه') + '</h3><p>گیگابایت در هر بازه</p></div></header><div class="bd" id="chartWrap">' + area(ser, { color: 'var(--ac2)', color2: 'var(--ac)', unit: ' GB' }) + '</div></div>' +
      '<div class="card"><header><span class="ic b2">' + icon('fa-chart-column') + '</span><div><h3>توزیع مصرف کاربران</h3><p>گیگابایت</p></div></header><div class="bd">' + bars(u.slice(0, 14).map((x) => (x.up + x.down) / 1073741824 || .01), 'GB') + '</div></div></div>' +
      '<div class="card"><header><span class="ic">' + icon('fa-users') + '</span><div><h3>مصرف به تفکیک کاربر</h3><p>با درصد پیشرفت</p></div></header><div class="bd" style="padding:0"><div class="tbl-wrap"><table>' +
      '<thead><tr><th>کاربر</th><th>آپلود</th><th>دانلود</th><th>کل</th><th>درصد سهمیه</th><th>درخواست</th></tr></thead><tbody>' +
      u.map((x) => { const q = (x.quotaGB || 0) * 1073741824, p = q ? (x.up + x.down) / q * 100 : 0; return '<tr><td class="cell-main">' + esc(x.name) + '</td><td class="mono">' + bytes(x.up) + '</td><td class="mono">' + bytes(x.down) + '</td><td class="mono"><b>' + bytes(x.up + x.down) + '</b></td>' +
        '<td><div style="display:flex;align-items:center;gap:8px"><div class="bar ' + (p > 90 ? 'bad' : p > 70 ? 'warn' : '') + '" style="max-width:110px"><i style="width:' + p + '%"></i></div><span class="mono" style="font-size:10px">' + (q ? fa(p.toFixed(0)) + '٪' : '∞') + '</span></div></td>' +
        '<td class="mono">' + fa(x.totalReq || 0) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div></div>' +
      '<div class="card" style="margin-top:12px"><header><span class="ic ' + (S.d.storage === 'd1' ? '' : 'bad') + '">' + icon('fa-heart-pulse') + '</span><div><h3>سلامت شمارش مصرف</h3><p>بررسی اینکه شمارنده‌ی حجم (usage) درست کار می‌کند</p></div>' +
      '<div class="acts"><button class="btn sm p" data-act="usage-health">' + icon('fa-stethoscope') + ' بررسی سلامت</button></div></header>' +
      '<div class="bd">' +
      /* گزارشِ آخرین بررسی در هر بار رندر نوشته می‌شود — با رفرش پاک نمی‌شود */
      '<div id="usageHealthOut">' + uhHtml(UH.last) + '</div>' +
      /* ═══ تست واقعی ترافیک — درخواست از مرورگرِ کاربر، پاسخ از سرور ═══ */
      '<div style="border-top:1px solid var(--bs);margin:14px 0 12px"></div>' +
      '<div class="hint" style="margin-bottom:8px"><b>تست واقعی ترافیک</b> — مرورگرِ شما یک فایل با اندازه‌ی معلوم را از سرور درخواست می‌کند؛ سرور با کانفیگِ همان کاربر پاسخ می‌دهد و حجمِ دانلود برای او ثبت می‌شود. سپس افزایش مصرف با اندازه‌ی فایل مقایسه می‌شود (چند کیلوبایت اختلاف طبیعی است).</div>' +
      '<div class="btn-row" style="gap:8px;flex-wrap:wrap">' +
      '<select id="ttUser" style="max-width:210px">' +
      (S.d.users || []).map((x) => '<option value="' + esc(x.uuid) + '"' + (x.uuid === TT.uuid ? ' selected' : '') + '>' + esc(x.name) + (x.enabled ? '' : ' (غیرفعال)') + '</option>').join('') +
      '</select>' +
      '<input id="ttSize" type="number" min="1" max="20" step="1" value="' + esc(TT.mb || 1) + '" style="max-width:78px">' +
      '<span class="hint">مگابایت</span>' +
      '<button class="btn sm p" data-act="traffic-test">' + icon('fa-download') + ' اجرای تست ترافیک</button>' +
      '</div>' +
      '<div id="trafficTestOut" style="margin-top:10px">' + ttHtml(TT.last) + '</div>' +
      '</div></div>';
  }

  function updateView() {
    const d = S.d, s = d.settings;
    return '<div class="page-head"><div><h1>سیستم به‌روزرسانی</h1><p>بررسی نسخه از گیت‌هاب، استقرار و بازگشت به نسخه‌ی قبل</p></div></div>' +
      '<div class="grid g3">' +
      '<div class="card"><header><span class="ic">' + icon('fa-rotate') + '</span><div><h3>نسخه فعلی</h3></div></header><div class="bd">' +
      '<div class="kv"><span>نسخه</span><b class="mono">' + esc(d.version) + '</b></div>' +
      '<div class="kv"><span>بیلد</span><b class="mono">' + esc(d.build || '—') + '</b></div>' +
      '<div class="kv"><span>مخزن</span><b class="mono">' + esc(s.upd.repo) + '</b></div>' +
      '<div class="kv"><span>آخرین بررسی</span><b>' + ago(d.lastCheck) + '</b></div>' +
      '<div class="btn-row" style="margin-top:12px"><button class="btn p" data-act="upd-check">' + icon('fa-magnifying-glass') + ' بررسی</button>' +
      '<button class="btn" data-act="upd-deploy">' + icon('fa-download') + ' نصب</button>' +
      '<button class="btn d" data-act="upd-rollback">' + icon('fa-rotate-left') + ' بازگشت</button></div></div></div>' +
      '<div class="card"><header><span class="ic b2">' + icon('fa-network-wired') + '</span><div><h3>انتشار به نودها</h3></div></header><div class="bd">' +
      ((d.panels || []).map((p) => '<div class="kv"><span>' + esc(p.name) + '</span><span class="badge ' + (p.status === 'online' ? 'ok' : p.status === 'syncing' ? 'warn' : 'bad') + '">' + esc(p.status) + '</span></div>').join('') || '<div class="empty">نودی متصل نیست</div>') +
      '</div></div>' +
      '<div class="card"><header><span class="ic warn">' + icon('fa-list-check') + '</span><div><h3>گزارش آخرین عملیات</h3></div></header><div class="bd">' +
      ((d.updateLog || []).map((l) => '<div class="log"><span class="dot ' + (l.ok ? 'on' : 'bad') + '"></span><div class="l"><b>' + esc(l.step) + '</b><div class="hint">' + esc(l.note) + '</div></div></div>').join('') || '<div class="empty">گزارشی نیست</div>') +
      '</div></div></div>' +
      SCHEMA.update.map((g) => group(g, s)).join('') + saveBtn('save-update');
  }

  function logsView() {
    const logs = S.d.logs || [], lv = S.tab.log || 'all';
    const list = logs.filter((l) => lv === 'all' || l.level === lv);
    return '<div class="page-head"><div><h1>لاگ فعالیت</h1><p>' + fa(logs.length) + ' رویداد • audit trail تغییرات ادمین</p></div>' +
      '<div class="seg">' + [['all', 'همه'], ['success', 'موفق'], ['info', 'اطلاعات'], ['warn', 'هشدار'], ['error', 'خطا']].map(([k, l]) => '<button data-act="loglv" data-v="' + k + '" class="' + (lv === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div></div>' +
      '<div class="card"><div class="bd">' +
      (list.map((l) => '<div class="log"><span class="dot ' + (l.level === 'success' ? 'on' : l.level === 'error' ? 'bad' : 'warn') + '"></span>' +
        '<div class="l"><b>' + esc(l.action) + '</b> <span class="badge">' + esc(l.actor) + '</span> <span class="badge ' + (l.level === 'error' ? 'bad' : l.level === 'success' ? 'ok' : 'b2') + '">' + esc(l.level) + '</span>' +
        '<div class="hint">' + esc(l.detail || '') + '</div></div><span class="hint mono" style="font-size:10px">' + new Date(l.ts).toLocaleString('fa-IR') + '</span></div>').join('') || '<div class="empty">رویدادی ثبت نشده</div>') +
      '</div></div>';
  }

  function settingsView() {
    const d = S.d, s = d.settings;
    return '<div class="page-head"><div><h1>تنظیمات و پشتیبان</h1><p>کلیدهای API، پشتیبان‌گیری و بازنشانی</p></div></div>' +
      '<div class="grid g2">' +
      '<div class="card"><header><span class="ic">' + icon('fa-key') + '</span><div><h3>کلیدهای API</h3><p>حداکثر ۱۰ کلید</p></div><div class="acts"><button class="btn sm s" data-act="key-new">' + icon('fa-plus') + ' کلید جدید</button></div></header>' +
      '<div class="bd"><div class="list">' + ((d.keys || []).map((k) => '<div class="row-item"><div class="grow"><b class="mono" style="font-size:11px">' + esc(k.key) + '</b><div class="cell-sub">' + esc(k.name) + ' • ' + (k.ro ? 'فقط‌خواندنی' : 'دسترسی کامل') + '</div></div>' +
        '<button class="btn sm ghost" data-act="copy" data-v="' + esc(k.key) + '">' + icon('fa-copy') + '</button>' +
        '<button class="btn sm d" data-act="key-del" data-id="' + esc(k.id) + '">' + icon('fa-trash-can') + '</button></div>').join('') || '<div class="empty">کلیدی ساخته نشده</div>') + '</div></div></div>' +
      /* ═══ پشتیبان و بازیابی با کشیدن و رها کردن ═══
         جایگزینِ دو مسیرِ قدیمی شد: دکمه‌ی «دریافت پشتیبان» که فایل را در
         مرورگر از state می‌ساخت (و همیشه با سرور یکی نبود) و inputِ پنهانِ
         بازیابی که از /api/action استفاده می‌کرد. */
      '<div class="card"><header><span class="ic b2">' + icon('fa-database') + '</span><div><h3>پشتیبان و بازیابی</h3>' +
      '<p>فایل را اینجا رها کنید • خروجی را بیرون بکشید</p></div></header><div class="bd">' +
      '<div id="bkOut">' + bkOutHtml(BK.data) + '</div>' +
      '<div class="btn-row" style="margin-top:8px;gap:6px;flex-wrap:wrap">' +
      '<button class="btn sm p" data-act="bk-load">' + icon('fa-download') + ' ساخت پشتیبان</button>' +
      '<button class="btn sm ghost" data-act="bk-clear">' + icon('fa-broom') + ' پاک‌کردن</button>' +
      '</div>' +
      '<div style="border-top:1px solid var(--bs);margin:12px 0"></div>' +
      '<div id="bkDrop" data-act="bk-pick" role="button" tabindex="0" ' +
      'style="border:1.5px dashed var(--bd);border-radius:12px;padding:20px 12px;text-align:center;cursor:pointer" ' +
      'title="کلیک کنید تا فایل انتخاب شود">' +
      '<div style="display:flex;flex-direction:column;align-items:center;gap:6px">' + icon('fa-upload') +
      '<b>فایل پشتیبان (JSON) را اینجا رها کنید</b>' +
      '<span class="hint">یا کلیک کنید تا از روی دیسک انتخاب شود</span></div></div>' +
      '<input type="file" id="bkFile" accept="application/json,.json" class="hide">' +
      '<div id="bkInfo">' + bkInfoHtml() + '</div>' +
      '<div id="bkErr">' + bkErrHtml() + '</div>' +
      '<div class="hint" style="margin-top:10px">پشتیبان شامل تنظیمات، کاربران، کلیدها و قواعد روتینگ است. ' +
      'در حالتِ «ادغام» کاربرانِ فعلی نگه داشته می‌شوند؛ در «جایگزینی کامل» همه چیز با فایل عوض می‌شود.</div>' +
      '</div></div>' +
      '<div class="card"><header><span class="ic">' + icon('fa-circle-info') + '</span><div><h3>مسیرهای سرویس</h3></div></header><div class="bd">' +
      '<div class="kv"><span>ورود پنل</span><b class="mono">/' + esc(s.auth.path) + '</b></div>' +
      '<div class="kv"><span>لینک ساب</span><b class="mono">/' + esc(s.sub.path) + '/&lt;uuid&gt;</b></div>' +
      '<div class="kv"><span>تونل</span><b class="mono">' + esc(s.path) + '</b></div>' +
      '<div class="kv"><span>سلامت</span><b class="mono">/health</b></div>' +
      '<div class="kv"><span>DoH</span><b class="mono">/dns-query</b></div></div></div>' +
      '<div class="card"><header><span class="ic bad">' + icon('fa-trash-can') + '</span><div><h3>بازنشانی</h3><p>عملیات برگشت‌ناپذیر</p></div></header><div class="bd">' +
      '<div class="btn-row"><button class="btn d" data-act="factory">' + icon('fa-rotate-left') + ' ریست کارخانه‌ای</button>' +
      '<button class="btn d" data-act="logs-clear">' + icon('fa-broom') + ' پاک‌سازی لاگ</button></div></div></div></div>';
  }

  /* ⚠️ schemaView از اینجا حذف شد: این تابع تنها مسیری بود که گروه‌های
     proto / network / telegram / cloud / update را رندر می‌کرد، اما هیچ
     viewای آن را صدا نمی‌زد (VIEWS مستقیم به configView می‌رساند) و خودِ
     تابع هم هیچ فراخوانی نداشت — یعنی آن فیلدها در عمل دیده نمی‌شدند.
     تنظیماتِ معادل در configView و securityView رندر می‌شوند. */

  function tgExtra() {
    const cmds = ['/panel', '/users', '/usage', '/sub <uuid>', '/add <name>', '/del <name>', '/reset <name>', '/extend <name> <days>', '/rename <name> <new>', '/note <name> <text>', '/limit <name> <n>', '/search <q>', '/inactive', '/panic', '/kill', '/dns <url>', '/ips <list>', '/relay <url>', '/nodes', '/lang en'];
    return '<div class="card"><header><span class="ic">' + icon('fa-brands fa-telegram') + '</span><div><h3>فرمان‌های ربات</h3><p>پنل تلگرامی با دکمه‌های inline</p></div>' +
      '<div class="acts"><button class="btn sm s" data-act="tg-test">' + icon('fa-paper-plane') + ' پیام تست</button></div></header>' +
      '<div class="bd"><div class="chips">' + cmds.map((c) => '<span class="chip"><span class="mono">' + esc(c) + '</span></span>').join('') + '</div>' +
      '<div class="hint" style="margin-top:10px">مدیریت کاربران، آمار، تنظیمات، Panic/Kill، جستجو، تمدید انقضا، تغییر نام و مدیریت چندپنلی — همه از داخل تلگرام.</div></div></div>';
  }
  function cloudExtra() {
    const d = S.d;
    return '<div class="grid g2">' +
      '<div class="card"><header><span class="ic">' + icon('fa-network-wired') + '</span><div><h3>پنل‌های لینک‌شده</h3><p>کلید اختصاصی هر نود</p></div>' +
      '<div class="acts"><button class="btn sm s" data-act="panel-new">' + icon('fa-plus') + ' افزودن</button></div></header><div class="bd"><div class="list">' +
      ((d.panels || []).map((p) => '<div class="row-item"><span class="dot ' + (p.status === 'online' ? 'on' : p.status === 'syncing' ? 'warn' : 'bad') + '"></span>' +
        '<div class="grow"><b>' + esc(p.name) + '</b> <span class="badge ' + (p.role === 'hub' ? 'ac' : '') + '">' + esc(p.role) + '</span><div class="mono cell-sub">' + esc(p.url) + '</div></div>' +
        '<button class="btn sm" data-act="panel-sync" data-id="' + esc(p.id) + '">' + icon('fa-rotate') + '</button>' +
        '<button class="btn sm d" data-act="panel-del" data-id="' + esc(p.id) + '">' + icon('fa-trash-can') + '</button></div>').join('') || '<div class="empty">پنلی لینک نشده</div>') + '</div></div></div>' +
      '<div class="card"><header><span class="ic b2">' + icon('fa-globe') + '</span><div><h3>دامنه‌ی اختصاصی</h3><p>health check</p></div>' +
      '<div class="acts"><button class="btn sm" data-act="domain-check">' + icon('fa-stethoscope') + ' بررسی سلامت</button></div></header>' +
      '<div class="bd"><div id="domainOut"><div class="empty">برای بررسی دامنه دکمه را بزنید</div></div></div></div></div>';
  }
  /* برچسبِ خوانا برای هر کلیدِ سایت پوششی — باید با DECOY_SITES در ورکر یکی باشد */
  const DECOY_LABEL = {
    nginx: 'nginx.org', ubuntu: 'ubuntu.com/server/docs', docker: 'docs.docker.com',
    cloudflare: 'developers.cloudflare.com/workers', python: 'docs.python.org/3',
    node: 'nodejs.org/docs/latest/api',
  };
  function secExtra() {
    const s = S.d.settings, p = s.auth.path;
    return '<div class="grid g2">' +
      '<div class="card"><header><span class="ic bad">' + icon('fa-stethoscope') + '</span><div><h3>تست تونل و کانفیگ</h3><p>چرا کانفیگ وصل نمی‌شود؟ اینجا تشخیص داده می‌شود</p></div>' +
      '<div class="acts"><button class="btn sm p" data-act="tunnel-test">' + icon('fa-vial') + ' اجرای تست</button></div></header>' +
      '<div class="bd"><div id="tunnelOut"><div class="empty">با یک کلیک، مسیر تونل، SNI، پروتکل‌ها، خروجی سوکت و یک کانفیگ نمونه بررسی می‌شود.</div></div></div></div>' +
      /* ⚠️ کارتِ «تغییر رمز» از اینجا حذف شد: همان کارت با همان عنوان در
         صفحه‌ی امنیت و در صفحه‌ی پیکربندی دو بار رندر می‌شد و هر کدام مسیرِ
         متفاوتی را صدا می‌زدند (قدیمی /api/action در برابر /api/password).
         تنها نسخه‌ی باقی‌مانده کارتِ «تغییر رمز عبور» در صفحه‌ی پیکربندی است. */
      '<div class="card"><header><span class="ic">' + icon('fa-key') + '</span><div><h3>2FA و مسیر ورود</h3>' +
      '<p>تغییرِ رمز عبور در صفحه‌ی «پیکربندی» انجام می‌شود</p></div></header><div class="bd">' +
      '<div class="btn-row"><button class="btn" data-act="2fa-gen">' + icon('fa-mobile-screen') + ' ساخت کلید 2FA</button>' +
      '<button class="btn" data-act="rotate-path">' + icon('fa-shuffle') + ' چرخش مسیر ورود</button></div>' +
      '<div id="totpOut" style="margin-top:12px"></div></div></div>' +
      '<div class="card"><header><span class="ic warn">' + icon('fa-mask') + '</span><div><h3>مسیر ورود و سایت پوششی واقعی</h3><p>ریشه‌ی دامنه یک سایت زنده‌ی واقعی را کامل نشان می‌دهد</p></div>' +
      '<div class="acts"><button class="btn sm s" data-act="decoy-test">' + icon('fa-vial') + ' تست سایت پوششی</button></div></header><div class="bd">' +
      '<div class="kv"><span>' + icon('fa-lock') + ' آدرس پنل</span><b class="mono">' + esc(location.origin + '/' + p) + '</b></div>' +
      '<div class="kv"><span>Disguise</span><b>' + (s.auth.disguise !== false ? 'فعال — ریشه سایت پوششی است' : 'خاموش — ریشه هم پنل است') + '</b></div>' +
      '<div class="kv"><span>سایت پوششی</span><b class="mono">' + esc(s.auth.decoyUrl || (DECOY_LABEL[s.auth.maintenanceHost] || s.auth.maintenanceHost)) + '</b></div>' +
      (s.auth.panic ? '<div class="kv"><span>Panic</span><b style="color:var(--bad)">فعال — پنل و لینک ساب پنهان‌اند؛ فقط /health و /api پاسخ می‌دهند</b></div>' : '') +
      '<div class="kv"><span>' + icon('fa-users') + ' لینک ساب</span><b class="mono">/' + esc(s.sub.path) + '/&lt;uuid&gt;</b></div>' +
      '<div class="kv"><span>CSP / XFO / nosniff</span><b>' + (s.sec.csp ? 'فعال' : 'خاموش') + '</b></div>' +
      '<div id="decoyOut" style="margin-top:10px"></div>' +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn" data-act="open" data-v="' + esc(location.origin + '/' + p) + '">' + icon('fa-arrow-up-right-from-square') + ' باز کردن پنل</button>' +
      '<button class="btn" data-act="open" data-v="' + esc(location.origin + '/?refresh=1') + '">' + icon('fa-eye') + ' پیش‌نمایش سایت پوششی</button>' +
      '<button class="btn ghost" data-act="copy" data-v="' + esc(location.origin + '/' + p) + '">' + icon('fa-copy') + ' کپی آدرس پنل</button></div>' +
      '<div class="hint" style="margin-top:10px">هر مسیر ناشناخته هم همان سایت پوششی را نشان می‌دهد. پس از تغییر مسیر ورود، صفحه را با آدرس جدید باز کنید.</div></div></div></div>';
  }

  /* ═══════════════════════════════════════════════════════════════
     نمای امنیت — محدودیت اتصال (فقط آی‌پی) + تنظیمات امنیتی
     گروه‌های اسکیمای security (از جمله sec.ipConnLimit)
     اینجا بالاخره رندر می‌شوند؛ قبلاً هیچ مسیری به آن‌ها نداشتیم.
     ⚠️ «زمان آزاد شدن آی‌پی» از این بخش حذف شده: آزادسازی آنی است و برای
     قطعیِ ناگهانی سقفِ سختِ ۳ ثانیه در خودِ ورکر ثابت است (قابل تنظیم نیست). */
  function securityView() {
    const s = S.d.settings;
    const store = S.d.storage || 'mem';
    const storeBadge =
      store === 'd1' ? '<span class="badge ok">' + icon('fa-database') + ' مرجع محدودیت: D1 — سراسری و دقیق ✓</span>'
        : store === 'kv' ? '<span class="badge warn">' + icon('fa-database') + ' مرجع محدودیت: KV — مشترک اما تقریبی</span>'
          : store === 'do' ? '<span class="badge ok">' + icon('fa-server') + ' مرجع محدودیت: Durable Object — سراسری و دقیق ✓</span>'
            : '<span class="badge bad">' + icon('fa-triangle-exclamation') + ' مرجع محدودیت: حافظه — فقط همین isolate؛ بین isolateها تضمین نمی‌شود</span>';
    return '<div class="page-head"><div><h1>امنیت و محدودیت اتصال</h1><p>سقف آی‌پی همزمان، آزادسازیِ آنی و تنظیمات امنیتی</p></div></div>' +
      '<div class="card" style="margin-bottom:12px"><header><span class="ic">' + icon('fa-shield-halved') + '</span>' +
      '<div><h3>محدودیت اتصال (فقط بر اساس آی‌پی)</h3><p>مدل Nova-Proxy — سقف برابر تعداد آی‌پی‌های همزمانِ هر کاربر</p></div>' +
      '<div class="acts">' + saveBtn('save-security') + '</div></header><div class="bd">' +
      '<div style="margin-bottom:10px">' + storeBadge + '</div>' +
      '<div class="hint" style="margin-bottom:12px">آزادسازی آی‌پی: <b>آنی</b> هنگام قطع شدن؛ حداکثر <b>۳</b> ثانیه برای قطعیِ ناگهانی • ' +
      'سقف سراسری: <b>' + fa(Number(s.sec.ipConnLimit) || 0) + '</b> (۰ = نامحدود)</div>' +
      SCHEMA.security.map((g) => acc(g.t, g.icon || 'fa-gear', g.f, s, g.two ? 'two' : 'two')).join('') +
      '<div class="hint" style="margin-top:12px">زمانِ آزادسازی دیگر قابل تنظیم نیست: ردیفِ اتصال همان لحظه‌ی قطع شدن (بستن، خطا، ' +
      'انصراف، لغو) پاک می‌شود و اگر قطعی ناگهانی باشد نهایتاً ۳ ثانیه بعد در اولین درخواستِ جدید جایگزین می‌شود. ' +
      'اتصالی که واقعاً ترافیک دارد با هر بایت تمدید می‌شود (حداکثر یک بار در ثانیه)، پس هیچ‌وقت اشتباهاً آزاد نمی‌شود.</div>' +
      '</div></div>' +
      secExtra();
  }

  /* ═══════════════════════════════════════════════════════════════
     نمای پیکربندی — ایده از نهان ولی ساده‌تر
     فقط تنظیماتی که واقعاً لازم است. بقیه پیش‌فرض هوشمند دارند.
     ═══════════════════════════════════════════════════════════════ */
  function configView() {
    const s = S.d.settings;

    /* ═══ حالت اصلی — مثل نهان: یک انتخاب ساده ═══ */
    const modeCard = () => {
      const modes = [
        { v: 'alpha', t: 'Alpha', d: 'VLESS — سبک و سریع', ic: 'gauge' },
        { v: 'beta',  t: 'Beta',  d: 'Trojan — مبهم‌سازی قوی', ic: 'shield' },
        { v: 'both',  t: 'هر دو', d: 'VLESS + Trojan', ic: 'zap' },
      ];
      return '<div class="card"><header><span class="ic">' + icon('fa-shield-halved') + '</span><div><h3>حالت اصلی</h3><p>کدام پروتکل در کانفیگ‌ها استفاده شود</p></div></header>' +
        '<div class="bd"><div class="mode-grid">' +
        modes.map((m) => '<button class="mode-card' + (s.mode === m.v ? ' on' : '') + '" data-mode="' + m.v + '">' +
          icon('fa-' + m.ic) + '<b>' + m.t + '</b><span>' + m.d + '</span></button>').join('') +
        '</div></div></div>';
    };

      /* ═══ کارت‌های سریع — جای toggle های پراکنده ═══ */
      const quickCard = () => {
        const items = [
          { k: 'tls', ic: 'lock',  t: 'TLS', d: 'رمزنگاری ترافیک' },
          { k: 'sub.fakeConfigs', ic: 'chartbar', t: 'اطلاعات مصرف', d: 'نمایش در کلاینت' },
          { k: 'auth.totp', ic: 'mobile', t: 'ورود دومرحله‌ای', d: '2FA' },
          { k: 'tg.enabled', ic: 'send', t: 'ربات تلگرام', d: 'مدیریت راه دور' },
          { k: 'upd.auto', ic: 'rotate', t: 'بروزرسانی خودکار', d: 'از GitHub' },
        ];
      return '<div class="card"><header><span class="ic">' + icon('fa-bolt') + '</span><div><h3>میان‌برها</h3><p>روی هرکدام کلیک کنید تا روشن/خاموش شود</p></div></header>' +
        '<div class="bd"><div class="qgrid">' +
        items.map((it) => {
          const val = !!getP(s, it.k);
          return '<button class="qcard' + (val ? ' on' : '') + '" data-q="' + it.k + '">' +
            icon('fa-' + it.ic) + '<div><b>' + it.t + '</b><span>' + it.d + '</span></div>' +
            '<span class="qdot' + (val ? ' on' : '') + '"></span></button>';
        }).join('') + '</div></div></div>';
    };

    /* ═══ فقط فیلدهای ضروری (مسیر پنل در بخش استتار است) ═══ */
    const essential = () => acc('تنظیمات ضروری', 'fa-gear', [
      { p: 'path', l: 'مسیر تونل', t: 'text', mono: 1, h: 'پیش‌فرض: /sg' },
    ], s);

    /* ═══ انتخابگرِ پورت — چیپ به‌جای فیلدِ متنی ═══ */
    const portsAcc = () => {
      const cur = portList(s.ports);
      return '<div class="acc open"><div class="acc-h" data-acc>' + icon('fa-tower-broadcast') + '<span>پورت‌ها</span>' +
        '<svg class="ic chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></div>' +
        '<div class="acc-b"><div class="bd" style="padding:0 12px 12px">' +
        '<div class="hint" style="margin-bottom:8px">پورت‌هایی که کلاینت از راهِ آن‌ها به ورکر وصل می‌شود — فقط پورت‌های پشتیبانی‌شده‌ی کلاودفلر نشان داده می‌شوند. ' +
        'برای هر پورتِ فعال، یک کانفیگِ جداگانه در اشتراک ساخته می‌شود؛ بعد از تغییر، «ذخیره» را بزنید و ساب را دوباره بگیرید.</div>' +
        '<div class="chips" id="portChips">' + PORTS_ALL.map((p) => portChip(p, cur.indexOf(p) >= 0)).join('') + '</div>' +
        '<input type="hidden" id="portsVal" data-p="ports" data-t="ports" value="' + esc(cur.join(',')) + '">' +
        '<div class="btn-row" style="margin-top:10px;gap:6px;flex-wrap:wrap">' +
        '<button class="btn sm s" data-act="ports-essential">' + icon('fa-lock') + ' فقط ضروری</button>' +
        '<button class="btn sm s" data-act="ports-recommended">' + icon('fa-circle-check') + ' همه‌ی پیشنهادی‌ها</button>' +
        '<button class="btn sm ghost" data-act="ports-all">' + icon('fa-tower-broadcast') + ' همه‌ی پورت‌ها</button>' +
        '</div>' +
        '<div class="hint" id="portSum" style="margin-top:8px">' + portSumHtml(cur) + '</div>' +
        '<div class="hint" style="margin-top:6px">دو پورتِ ۴۴۳ و ۸۰ «ضروری»اند: ترافیکِ عادیِ https/httpِ ورکر روی همین‌هاست، ' +
        'برای همین همیشه فعال‌اند و نمی‌توان آن‌ها را خاموش کرد.</div>' +
        '</div></div></div>';
    };

    /* ═══ تغییر رمز عبور — کارتِ مستقل در صفحه‌ی پیکربندی ═══
       مسیرِ قدیمی (فیلدِ auth.password در تنظیماتِ ضروری) حذف شده: آن فیلد
       مقدارِ ذخیره‌شده را نشان می‌داد ولی وقتی MASTER_KEY بایند شده باشد
       بی‌اثر است — کاربر فکر می‌کرد رمز عوض شده است. */
    const pwCard = () => '<div class="card" id="pwCard"><header><span class="ic">' + icon('fa-key') + '</span>' +
      '<div><h3>تغییر رمز عبور</h3><p>رمزِ ورود به پنل — پس از تغییر، باید دوباره وارد شوید</p></div></header><div class="bd">' +
      '<div class="um-grid two">' +
      '<label class="f"><span>رمز فعلی</span><input type="password" id="pwCur" autocomplete="current-password"></label>' +
      '<label class="f"><span>رمز جدید</span><input type="password" id="pwNew" autocomplete="new-password"></label>' +
      '<label class="f"><span>تکرارِ رمز جدید</span><input type="password" id="pwNew2" autocomplete="new-password"></label>' +
      '</div>' +
      '<div class="hint" style="margin-top:6px">دست‌کم ۵ نویسه • هیچ محدودیتی روی الگو یا طولِ رمز نیست</div>' +
      '<div class="btn-row" style="margin-top:10px"><button class="btn p" data-act="pw-save">' + icon('fa-check') + ' تغییر رمز</button></div>' +
      '<div id="pwOut" style="margin-top:10px">' + pwOutHtml() + '</div>' +
      '</div></div>';

    /* ═══ سرورهای خروجی VLESS ═══ */
    const exitsCard = () => '<div class="card" id="exitsCard"><header><span class="ic">' + icon('fa-server') + '</span>' +
      '<div><h3>سرورهای خروجی VLESS</h3><p>ترافیکِ کانفیگ‌ها می‌تواند از یکی از این سرورها خارج شود</p></div>' +
      '<div class="acts"><button class="btn sm s" data-act="exit-new">' + icon('fa-plus') + ' افزودن</button>' +
      '<button class="btn sm" data-act="exit-reload">' + icon('fa-rotate') + ' بارخوانی</button></div></header>' +
      '<div class="bd"><div id="exitsOut">' + exitsHtml(EX.data) + '</div></div></div>';

    /* ═══ نام‌گذاری کانفیگ‌ها — الگوی کاملاً دلخواه + الگوهای آماده ═══ */
    const naming = () => {
      const pat = getP(s, 'sub.namePattern') || '';
      return '<div class="acc open"><div class="acc-h" data-acc>' + icon('fa-pen') + '<span>نام‌گذاری کانفیگ‌ها</span>' +
        '<svg class="ic chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></div>' +
        '<div class="acc-b"><div class="bd" style="padding:0 12px 12px">' +
        '<div class="um-grid two">' +
        field({ p: 'sub.namePrefix', l: 'پیشوند نام', t: 'text', h: 'در الگو با {prefix} می‌آید' }, getP(s, 'sub.namePrefix')) +
        '<label class="f"><span>الگوی نام (کاملاً دلخواه)</span><input id="nmPat" data-p="sub.namePattern" class="mono" value="' + esc(pat) + '">' +
        '<div class="hint" style="margin-top:5px">هر متنی با هر طولی — نه محدودیتِ الگو دارد و نه سقفِ کاراکتر</div></label>' +
        '</div>' +
        '<div class="hint" style="margin-top:8px">متغیرها (در محلِ کرسر درج می‌شوند):</div>' +
        '<div class="chips" style="margin-top:5px">' + NAME_TOKENS.map((t) =>
          '<button type="button" class="chip" data-nm-var="' + t.k + '"><span class="mono">{' + t.k + '}</span> ' + esc(t.l) + '</button>').join('') + '</div>' +
        '<div class="hint" style="margin-top:10px">الگوهای آماده:</div>' +
        '<div class="chips" style="margin-top:5px">' + NAME_TPL.map((t) =>
          '<button type="button" class="chip" data-nm-tpl="' + esc(t.rnd ? 'rnd' : t.p) + '">' + esc(t.l) + '</button>').join('') + '</div>' +
        '<div id="nmPreview" style="margin-top:10px">' + nmPreviewHtml() + '</div>' +
        '<div class="btn-row" style="margin-top:8px;gap:6px;flex-wrap:wrap">' +
        '<button class="btn sm p" data-act="nm-apply">' + icon('fa-check') + ' اعمال روی انتخاب‌شده‌ها</button>' +
        '<button class="btn sm ghost" data-act="nm-sel-all">' + icon('fa-check') + ' انتخابِ همه</button>' +
        '<button class="btn sm ghost" data-act="nm-sel-none">' + icon('fa-xmark') + ' هیچ‌کدام</button>' +
        '</div>' +
        '<div class="hint" style="margin-top:6px">شماره‌گذاری خودکار است و در خودِ ساب انجام می‌شود: ' +
        '<span class="mono">{index}</span> شماره‌ی هر کانفیگ در اشتراکِ همان کاربر است (۱، ۲، ۳ …)، ' +
        'پس یک الگو برای همه‌ی کانفیگ‌های یک کاربر کافی است و نام‌ها تکراری نمی‌شوند. ' +
        'اگر دو کانفیگ باز هم هم‌نام شوند، ورکر خودکار به دومی شماره می‌افزاید.</div>' +
        '</div></div></div>';
    };

    /* ═══ شبکه ═══ */
    const network = () => acc('شبکه', 'fa-network-wired', [
      { p: 'cleanIPs', l: 'IPهای پاک', t: 'area', dt: 'lines', h: 'هر خط یک IP — از cfip.rip بگیرید' },
      { p: 'proxyIPs', l: 'IPهای پروکسی', t: 'area', dt: 'lines', h: 'برای دور زدن تحریم' },
      { p: 'doh.url', l: 'DNS', t: 'text', mono: 1 },
    ], s);

    /* ═══ استتار — سیستم جدید مثل نهان ═══ */
    const stealth = () => {
      const sites = [
        { v: 'nginx',      t: 'nginx',           d: 'سرور وب — سبک و شناخته‌شده' },
        { v: 'ubuntu',     t: 'Ubuntu Server',   d: 'مستندات رسمی اوبونتو' },
        { v: 'docker',     t: 'Docker Docs',     d: 'مستندات داکر' },
        { v: 'cloudflare', t: 'Cloudflare',      d: 'مستندات ورکر' },
        { v: 'python',     t: 'Python Docs',     d: 'مستندات پایتون' },
        { v: 'node',       t: 'Node.js Docs',    d: 'مستندات نود' },
      ];
      const cur = s.auth.maintenanceHost || 'nginx';
      return '<div class="acc open"><div class="acc-h" data-acc>' + icon('fa-mask') + '<span>استتار و سایت پوششی</span>' +
        '<svg class="ic chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></div>' +
        '<div class="acc-b"><div class="bd" style="padding:0 12px 12px">' +

        /* انتخاب سایت پوششی — کارت بصری */
        '<div class="hint" style="margin-bottom:8px">مسیرهای ناشناخته این سایت را نشان می‌دهند — انتخاب کنید:</div>' +
        '<div class="mode-grid">' +
        sites.map((x) => '<button class="mode-card' + (cur === x.v ? ' on' : '') + '" data-decoy="' + x.v + '">' +
          icon('fa-globe') + '<b>' + x.t + '</b><span>' + x.d + '</span></button>').join('') +
        '</div>' +

        /* آدرس دلخواه */
        '<div style="margin-top:10px">' +
        field({ p: 'auth.decoyUrl', l: 'یا آدرس دلخواه', t: 'text', mono: 1, h: 'خالی = یکی از سایت‌های بالا. هر سایت واقعی دیگری' }, s.auth.decoyUrl) +
        '</div>' +

        /* کلیدهای استتار — الان واقعاً در مسیریابی اثر دارند */
        '<div class="um-grid two" style="padding:8px 0 0">' +
        field({ p: 'auth.disguise', l: 'Disguise mode', t: 'sw', h: 'خاموش = ریشه هم پنل را نشان می‌دهد' }, s.auth.disguise) +
        field({ p: 'auth.panic', l: 'Panic mode', t: 'sw', bad: 1, h: 'پنل و لینک ساب پشتِ سایت پوششی پنهان می‌شوند' }, s.auth.panic) +
        '</div>' +

        /* مسیر مخفی */
        '<div style="margin-top:8px">' +
        field({ p: 'auth.path', l: 'مسیر مخفی پنل', t: 'text', mono: 1, h: 'پنل روی /این‌مسیر — یک کلمه‌ی تصادفی مثل x7k2m' }, s.auth.path) +
        '</div>' +

        /* دکمه‌ی تست */
        '<div class="btn-row" style="margin-top:8px">' +
        '<a class="btn" href="' + esc(location.origin + '/?refresh=1') + '" target="_blank">' + icon('fa-eye') + ' پیش‌نمایش سایت پوششی</a>' +
        '<a class="btn" href="' + esc(location.origin + '/' + (s.auth.path || 'panel')) + '" target="_blank">' + icon('fa-arrow-up-right-from-square') + ' باز کردن پنل</a>' +
        '</div>' +
        '</div></div></div>';
    };

    /* ═══ تلگرام — آیدی‌هایی که در ساب نمایش داده می‌شوند ═══ */
    const telegram = () => {
      const sup = s.sub.telegramSupport || s.sub.telegramChannel || '';
      const buy = s.sub.telegramBuy || '';
      const toUrl = (id) => {
        if (!id) return '';
        return id.startsWith('http') ? id : 'https://t.me/' + String(id).replace('@', '');
      };
      return '<div class="acc open"><div class="acc-h" data-acc>' + icon('fa-send') + '<span>تلگرام</span>' +
        '<svg class="ic chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></div>' +
        '<div class="acc-b"><div class="um-grid two" style="padding:11px 12px">' +
        field({ p: 'sub.telegramSupport', l: 'آیدی پشتیبانی', t: 'text', mono: 1, h: 'مثل @support — در لینک ساب و هدرِ آن' }, sup) +
        field({ p: 'sub.telegramBuy', l: 'آیدی خرید اشتراک', t: 'text', mono: 1, h: 'مثل @sales — خالی = همان پشتیبانی' }, buy) +
        '</div>' +

        /* پیش‌نمایش لینک‌ها */
        '<div style="padding:0 12px 12px">' +
        '<div class="hint" style="margin-bottom:6px"><b>پیش‌نمایش:</b></div>' +
        '<div class="list">' +
        (toUrl(sup) ? '<div class="row-item">' + icon('fa-send') + '<div class="grow"><b>پشتیبانی</b><div class="mono cell-sub">' + esc(toUrl(sup)) + '</div></div>' +
          '<a class="btn sm" href="' + esc(toUrl(sup)) + '" target="_blank">' + icon('fa-arrow-up-right-from-square') + '</a></div>' : '') +
        (toUrl(buy || sup) ? '<div class="row-item">' + icon('fa-clipboard') + '<div class="grow"><b>خرید اشتراک</b><div class="mono cell-sub">' + esc(toUrl(buy || sup)) + '</div></div>' +
          '<a class="btn sm" href="' + esc(toUrl(buy || sup)) + '" target="_blank">' + icon('fa-arrow-up-right-from-square') + '</a></div>' : '') +
        '</div>' +

        /* متغیرهای قابل استفاده در کانفیگ فیک */
        '<div class="hint" style="margin-top:10px">متغیرهای قابل استفاده در کانفیگ‌های فیک:</div>' +
        '<div class="chips" style="margin-top:5px">' +
        '<span class="chip"><span class="mono">{tgsupport}</span></span>' +
        '<span class="chip"><span class="mono">{tgbuy}</span></span>' +
        '</div>' +

        /* ربات تلگرام (اختیاری) */
        '<div class="hint" style="margin-top:12px"><b>ربات تلگرام</b> (اختیاری — برای اعلان‌ها):</div>' +
        '<div class="um-grid two" style="margin-top:6px">' +
        field({ p: 'tg.token', l: 'توکن ربات', t: 'pw', mono: 1 }, s.tg.token) +
        field({ p: 'tg.chatId', l: 'Chat ID', t: 'text', mono: 1 }, s.tg.chatId) +
        '</div>' +
        '</div></div></div>';
    };

    /* ═══ پیشرفته — کمترین تعداد ═══ */
    const advanced = () => acc('پیشرفته', 'fa-key', [
      { p: 'cf.accountId', l: 'CF Account ID', t: 'text', mono: 1, h: 'برای آمار' },
      { p: 'upd.repo', l: 'ریپو GitHub', t: 'text', mono: 1 },
      { p: 'sec.killSwitch', l: 'Kill Switch', t: 'sw', bad: 1, h: 'قطع فوری' },
    ], s);

    return '<div class="page-head"><div><h1>پیکربندی</h1><p>فقط چیزهایی که لازم است</p></div>' +
      '<button class="btn p" data-act="save-config">' + icon('fa-floppy-disk') + ' ذخیره</button></div>' +

      modeCard() + quickCard() +
      '<div style="padding:0 2px">' + essential() + portsAcc() + naming() + network() + telegram() + stealth() + advanced() + '</div>' +
      pwCard() + exitsCard() +

      '<div class="btn-row" style="justify-content:center;margin-top:10px">' +
      '<button class="btn p lg" data-act="save-config">' + icon('fa-floppy-disk') + ' ذخیره</button></div>';
  }

  const VIEWS = {
    dash: dashView, users: usersView, sub: subView, monitor: monitorView, conns: connsView, logs: logsView, settings: settingsView,
    config: configView,
    update: () => configView(),
    proto: () => configView(),
    network: () => configView(),
    telegram: () => configView(),
    cloud: () => configView(),
    security: securityView,
  };
  function protoExtra() {
    const s = S.d.settings;
    const ok = s.tls && s.transport === 'ws' && (s.protocols.vless || s.protocols.trojan) && !(s.sni && s.sni !== location.hostname);
    return '<div class="card"><header><span class="ic ' + (ok ? '' : 'bad') + '">' + icon(ok ? 'fa-circle-check' : 'fa-triangle-exclamation') + '</span>' +
      '<div><h3>سازگاری با هسته‌ی تونل</h3><p>بررسی سریع تنظیمات فعلی</p></div></header><div class="bd">' +
      [
        ['ترنسپورت WebSocket', s.transport === 'ws', s.transport],
        ['حداقل یک پروتکل پشتیبانی‌شده', s.protocols.vless || s.protocols.trojan, 'VLESS=' + s.protocols.vless + ' Trojan=' + s.protocols.trojan],
        ['TLS روشن', !!s.tls, s.tls ? 'fp: ' + s.fingerprint : 'خاموش'],
        ['SNI با دامنه‌ی ورکر یکی است', !(s.sni && s.sni !== location.hostname), s.sni || location.hostname],
      ].map(([t, o, note]) => '<div class="kv"><span>' + icon(o ? 'fa-circle-check' : 'fa-circle-xmark') + ' ' + t + '</span><b class="mono" style="color:' + (o ? 'var(--ok)' : 'var(--bad)') + '">' + esc(note) + '</b></div>').join('') +
      '<div class="hint" style="margin-top:10px">Shadowsocks و VMess فقط در ساب تولید می‌شوند؛ برای اتصال واقعی از VLESS یا Trojan استفاده کنید.</div></div></div>';
  }

  /* ─────────── پوسته ─────────── */
  function render() {
    const nav = $('#nav');
    if (!S.token || !S.d) {
      /* در صفحه‌ی ورود هیچ هدر، سایدبار یا فوتر وجود ندارد */
      document.body.classList.add('auth');
      closeDrawer();
      $('#view').innerHTML = loginView();
      setTimeout(() => { const e = $('#lgPw'); if (e) e.focus(); }, 60);
      return;
    }
    const d = S.d, s = d.settings;
    document.body.classList.remove('auth');
    ['#menuBtn', '#themeBtn', '#panicBtn', '#logoutBtn', '#searchBox'].forEach((x) => $(x).classList.remove('hide'));
    $('#brandName').textContent = s.panel.name;
    $('#brandVer').textContent = 'v' + d.version;
    $('#pageTitle').textContent = s.panel.name;
    $('#sfStore').textContent = d.storage === 'd1' ? 'D1 پایدار' : 'موقت';
    $('#sfUsers').textContent = fa(d.users.length) + ' کاربر';
    $('#sfVer').textContent = d.version;
    const panic = s.auth.panic;
    $('#tbState').textContent = panic ? 'Panic Mode فعال است' : 'سرویس فعال';
    $('#tbState').style.color = panic ? 'var(--bad)' : '';
    $('#tbDot').className = 'dot ' + (panic ? 'bad' : 'on');
    $('#tbReq').innerHTML = icon('fa-arrow-up-right-dots') + ' ' + n((d.stats && d.stats.requests) || 0) + ' req';
    $('#panicBtn').className = 'btn sm ' + (panic ? 'd' : 's');
    nav.innerHTML = NAV.map((g) => '<div class="nav-group"><span>' + g.g + '</span>' + g.items.map(([id, l, ic]) =>
      '<button class="nav-item ' + (S.view === id ? 'on' : '') + '" data-act="nav" data-view="' + id + '">' + icon(ic) + '<span>' + l + '</span>' +
      (id === 'users' ? '<span class="cnt">' + fa(d.users.length) + '</span>' : '') +
      (id === 'logs' ? '<span class="cnt">' + fa((d.logs || []).length) + '</span>' : '') + '</button>').join('') + '</div>').join('');
    $('#view').innerHTML = '<div class="fade">' + (VIEWS[S.view] || dashView)() + '</div>';
    if (S.view === 'sub') setTimeout(refreshPreview, 30);
    /* اتصال‌های زنده: داده‌ی قبلی همان لحظه رندر می‌شود و بارخوانی فقط همان
       دو بلوک را به‌روز می‌کند — جدول هیچ وقت خالی نمی‌شود. */
    if (S.view === 'conns') setTimeout(cnLoad, 20);
    /* سرورهای خروجی: فهرست از /api/exits خوانده می‌شود و فقط داخل #exitsOut
       رندر می‌شود — بقیه‌ی صفحه دست‌نخورده می‌ماند. */
    if (S.view === 'config') setTimeout(exLoad, 20);
    const cw = $('#chartWrap');
    if (cw) {
      const ser = S.view === 'monitor'
        ? ((S.range === 'm' ? d.stats.monthly : S.range === 'y' ? d.stats.yearly : d.stats.daily) || [])
        : (d.stats.trafficSeries || []);
      bindCharts(cw, ser);
    }
    $('#foot').innerHTML = esc(s.panel.name) + ' • ' + esc(location.hostname) + ' • ورود: <span class="mono">/' + esc(s.auth.path) + '</span> • ساب: <span class="mono">/' + esc(s.sub.path) + '</span>';
  }

  async function refresh() {
    if (!S.token) { render(); return; }
    const d = await api('GET', '/api/state');
    if (d && !d.error) { S.d = d; render(); }
  }

  /* ─────────── جستجوی سراسری ─────────── */
  function doSearch(term) {
    const drop = $('#searchDrop');
    const t = (term || '').trim().toLowerCase();
    if (!t || !S.d) { drop.classList.remove('show'); drop.innerHTML = ''; return; }
    const out = [];
    NAV.forEach((g) => g.items.forEach(([id, l]) => { if (l.toLowerCase().includes(t)) out.push({ ic: 'fa-compass', txt: l, sub: g.g, act: 'nav', view: id }); }));
    S.d.users.forEach((u) => {
      if ([u.name, u.uuid, u.note].join(' ').toLowerCase().includes(t))
        out.push({ ic: 'fa-user', txt: u.name, sub: String(u.uuid).slice(0, 16) + '…', act: 'user-edit', id: u.id });
    });
    (S.d.logs || []).slice(0, 40).forEach((l) => {
      if ((l.action + ' ' + l.detail + ' ' + l.actor).toLowerCase().includes(t))
        out.push({ ic: 'fa-list-check', txt: l.action, sub: l.actor, act: 'nav', view: 'logs' });
    });
    Object.keys(S.d.settings).forEach((k) => {
      if (k.toLowerCase().includes(t)) out.push({ ic: 'fa-gear', txt: k, sub: 'تنظیمات', act: 'nav', view: ['protocols', 'mode', 'transport', 'tls', 'path', 'fragment'].includes(k) ? 'proto' : ['cleanIPs', 'proxyIPs', 'doh', 'nat64', 'geoip'].includes(k) ? 'network' : 'settings' });
    });
    drop.innerHTML = out.length ? out.slice(0, 14).map((o, i) =>
      '<div class="sd-item" data-si="' + i + '">' + icon(o.ic) + '<span>' + esc(o.txt) + '</span><span class="m">' + esc(o.sub) + '</span></div>').join('')
      : '<div class="sd-empty">موردی یافت نشد</div>';
    drop.classList.add('show');
    drop._res = out;
  }

  /* ─────────── رویدادها ─────────── */
  document.addEventListener('click', async (e) => {
    const sd = e.target.closest('[data-si]');
    if (sd) {
      const o = ($('#searchDrop')._res || [])[Number(sd.dataset.si)];
      if (o) {
        $('#searchDrop').classList.remove('show'); $('#tbSearch').value = '';
        if (o.act === 'nav') { S.view = o.view; render(); }
        else if (o.act === 'user-edit') { S.view = 'users'; render(); userModal(S.d.users.find((u) => u.id === o.id)); }
      }
      return;
    }
    /* ═══════ مرحله‌ی ۴ — انتخابگرِ پورت ═══════
       چیپ‌ها data-act ندارند (دکمه‌یِ فرم نیستند، فقط یک فیلدِ پنهان را
       عوض می‌کنند) برای همین پیش از نگهبانِ [data-act] بررسی می‌شوند. */
    const pc = e.target.closest('[data-port]');
    if (pc) {
      e.preventDefault();
      if (pc.dataset.lock) { toast('پورتِ ' + fa(pc.dataset.port) + ' ضروری است و نمی‌توان آن را غیرفعال کرد', 'info'); return; }
      const cur = portList($('#portsVal') ? $('#portsVal').value : '');
      const p = parseInt(pc.dataset.port, 10);
      const at = cur.indexOf(p);
      if (at >= 0) {
        if (cur.length <= 1) { toast('دست‌کم یک پورت باید فعال بماند', 'err'); return; }
        cur.splice(at, 1);
      } else cur.push(p);
      portSet(cur);
      return;
    }

    /* ═══════ نام‌گذاریِ کانفیگ‌ها — چیپ‌ها ═══════
       این سه دسته data-act ندارند (دکمه‌یِ فرم نیستند، فقط پیش‌نمایش را
       عوض می‌کنند) برای همین باید پیش از نگهبانِ [data-act] بررسی شوند؛
       وگرنه کلیک‌شان اصلاً دیده نمی‌شد و کلِ بخش از کار می‌افتاد. */
    const nv = e.target.closest('[data-nm-var]');
    if (nv) {
      e.preventDefault(); e.stopPropagation();
      nmInsert('{' + String(nv.dataset.nmVar || '') + '}');
      return;
    }
    const nt = e.target.closest('[data-nm-tpl]');
    if (nt) {
      e.preventDefault(); e.stopPropagation();
      const v = String(nt.dataset.nmTpl || '');
      /* «تصادفی» یعنی یکی از الگوهای آماده به‌شکل تصادفی انتخاب شود */
      const list = NAME_TPL.filter((x) => !x.rnd);
      nmSetPattern((!v || v === 'rnd') ? list[Math.floor(Math.random() * list.length)].p : v);
      return;
    }
    const nu = e.target.closest('[data-nm-user]');
    if (nu) {
      e.preventDefault(); e.stopPropagation();
      NM.init = true;
      NM.sel[String(nu.dataset.nmUser)] = !NM.sel[String(nu.dataset.nmUser)];
      nmShow();
      return;
    }

    /* آکاردئون */
    const ach = e.target.closest('[data-acc]');
    if (ach) { e.preventDefault(); e.stopPropagation(); ach.parentElement.classList.toggle('open'); return; }

    /* انتخاب سایت پوششی */
    const dc = e.target.closest('[data-decoy]');
    if (dc) {
      e.preventDefault(); e.stopPropagation();
      const v = dc.dataset.decoy;
      S.d.settings.auth.maintenanceHost = v;
      $$('[data-decoy]').forEach((c) => c.classList.toggle('on', c.dataset.decoy === v));
      toast('سایت پوششی: ' + dc.querySelector('b').textContent + ' — ذخیره کنید', 'info');
      return;
    }

    /* کارت‌های انتخاب حالت */
    const mc = e.target.closest('[data-mode]');
    if (mc) {
      e.preventDefault(); e.stopPropagation();
      const v = mc.dataset.mode;
      S.d.settings.mode = v;
      $$('.mode-card').forEach((c) => c.classList.toggle('on', c.dataset.mode === v));
      toast('حالت: ' + (v === 'alpha' ? 'Alpha (VLESS)' : v === 'beta' ? 'Beta (Trojan)' : 'هر دو') + ' — برای اعمال، ذخیره کنید', 'info');
      return;
    }

    /* کارت‌های میان‌بر — با یک کلیک روشن/خاموش */
    const qc = e.target.closest('[data-q]');
    if (qc) {
      e.preventDefault(); e.stopPropagation();
      const k = qc.dataset.q;
      const cur = !!getP(S.d.settings, k);
      setP(S.d.settings, k, !cur);
      qc.classList.toggle('on', !cur);
      qc.querySelector('.qdot').classList.toggle('on', !cur);
      toast((!cur ? 'روشن شد: ' : 'خاموش شد: ') + qc.querySelector('b').textContent + ' — ذخیره کنید', 'info');
      return;
    }

    /* انتخاب حالت کانفیگ فیک کاربر */
    const ufm = e.target.closest('[data-ufake-mode]');
    if (ufm) {
      e.preventDefault(); e.stopPropagation();
      const cur = S.d.users.find((x) => x.id === ($('#mbox [data-act="user-save"]') || {}).dataset?.id) || {};
      const patch = collect($('#mbox')); patch.fakes = readUserFakes();
      Object.assign(cur, patch);
      cur.fakeMode = ufm.dataset.ufakeMode;
      if (cur.fakeMode === 'custom' && (!Array.isArray(cur.fakes) || !cur.fakes.length)) {
        cur.fakes = [
          { id: 'usage',     name: '📊 {usage}',     enabled: true, proto: 'vless',  pos: 1 },
          { id: 'remaining', name: '🟢 {remaining}', enabled: true, proto: 'vless',  pos: 2 },
          { id: 'expiry',    name: '📅 {expiry}',    enabled: true, proto: 'vless',  pos: 3 },
          { id: 'channel',   name: '📢 {channel}',   enabled: true, proto: 'trojan', pos: 4 },
        ];
      }
      closeM(); userModal(cur);
      return;
    }
    /* سوییچ کانفیگ فیک کاربر */
    const ufsw = e.target.closest('[data-ufake-sw]');
    if (ufsw) {
      e.preventDefault(); e.stopPropagation();
      const on = !ufsw.classList.contains('on');
      ufsw.classList.toggle('on', on);
      const row = ufsw.closest('.fk-row');
      if (row) row.classList.toggle('off', !on);
      return;
    }

    /* سوییچ کانفیگ فیک */
    const fsw = e.target.closest('[data-fake-sw]');
    if (fsw) {
      e.preventDefault(); e.stopPropagation();
      const on = !fsw.classList.contains('on');
      fsw.classList.toggle('on', on);
      const row = fsw.closest('.fk-row');
      if (row) row.classList.toggle('off', !on);
      refreshPreview();
      return;
    }
    /* درج متغیر در فیلد فعال */
    const fv = e.target.closest('.fk-var');
    if (fv) {
      e.preventDefault();
      const active = document.activeElement;
      const isFakeName = active && active.classList && active.classList.contains('fk-name');
      const target = isFakeName ? active : ($('#fkList .fk-row .fk-name') || null);
      if (target) {
        const v = fv.dataset.var;
        const st = target.selectionStart || target.value.length;
        const en = target.selectionEnd || target.value.length;
        target.value = target.value.slice(0, st) + v + target.value.slice(en);
        target.focus();
        const np = st + v.length;
        target.setSelectionRange(np, np);
        refreshPreview();
      } else toast('ابتدا یک فیلد نام را انتخاب کنید', 'info');
      return;
    }

    const sw = e.target.closest('[data-sw]');
    if (sw) {
      e.preventDefault(); e.stopPropagation();
      const on = !sw.classList.contains('on');
      sw.classList.toggle('on', on);
      const inp = sw.parentElement.querySelector('[data-p="' + sw.dataset.sw + '"]') ||
        sw.parentElement.querySelector('[data-sw-inp="' + sw.dataset.sw + '"]');
      if (inp) inp.checked = on;
      return;
    }

    const t = e.target.closest('[data-act]'); if (!t) return;
    const a = t.dataset.act, id = t.dataset.id, v = t.dataset.v;
    try {
      if (a === 'login') {
        const pw = $('#lgPw').value, tp = ($('#lgTp') || {}).value || '';
        busy(t, 'در حال ورود');
        try {
          /* timeout ۸ ثانیه — اگر سرور جواب نداد دکمه رها می‌شود */
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 8000);
          const resp = await fetch('/api/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: pw, totp: tp }),
            signal: ctrl.signal,
          });
          clearTimeout(to);
          const r = await resp.json();
          free(t);
          if (r.token) { S.token = r.token; sessionStorage.setItem('sg_t', r.token); await refresh(); toast('خوش آمدید 👋'); }
          else toast(r.error || 'رمز نادرست است', 'err');
        } catch (e) {
          free(t);
          toast(e.name === 'AbortError' ? 'سرور پاسخ نداد — دوباره تلاش کنید' : 'خطای شبکه', 'err');
        }
      }
      else if (a === 'nav') { S.view = t.dataset.view; closeDrawer(); render(); }
      else if (a === 'copy') copy(v);
      else if (a === 'open') window.open(v, '_blank');
      else if (a === 'fmt') { S.fmt = v; render(); }
      else if (a === 'range') { S.range = v; render(); }
      else if (a === 'loglv') { S.tab.log = v; render(); }
      /* ═══════ اتصال‌های زنده — فقط بارخوانی ═══════
         عملیاتِ روی نشستِ زنده (قطعِ موقت، مسدودسازیِ آی‌پی، آزادسازی) کاملاً
         حذف شده است؛ تنها کاری که اینجا می‌ماند خواندنِ جدول است. */
      else if (a === 'conn-load') { busy(t, 'بارخوانی'); await cnLoad(); free(t); }
      else if (a === 'save-config') {
        busy(t, 'ذخیره');
        /* همه‌ی فیلدها از DOM خوانده می‌شوند — شامل تلگرام */
        const patch = collect($('#view'));
        const s = S.d.settings;
        /* فقط مقادیری که با کلیک (نه فیلد) تغییر کرده‌اند از state می‌آیند */
        patch.mode = s.mode;
        if (!patch.auth) patch.auth = {};
        patch.auth.maintenanceHost = s.auth.maintenanceHost;
        /* اگر کارت کانفیگ‌های فیک در صفحه است، مقادیرش را هم ذخیره کن */
        if (!patch.sub) patch.sub = {};
        if ($('#fkList')) patch.sub.fakes = readFakes();
        /* کلیدهای toggle که با کلیک تغییر کرده‌اند */
        ['tls', 'sub.fakeConfigs', 'auth.disguise', 'auth.totp', 'tg.enabled', 'upd.auto'].forEach((k) => {
          setP(patch, k, getP(s, k));
        });
        const r = await api('PUT', '/api/settings', { settings: patch });
        free(t);
        if (r.ok) { toast('ذخیره شد ✓'); await refresh(); }
        else toast(r.error || 'خطا در ذخیره', 'err');
      }
      else if (a.startsWith('save-')) {
        busy(t, 'ذخیره');
        const patch = collect($('#view'));
        /* کانفیگ‌های فیک از DOM خوانده می‌شوند */
        if ($('#fkList')) patch.sub = { ...(patch.sub || {}), fakes: readFakes() };
        const r = await api('PUT', '/api/settings', { settings: patch });
        free(t);
        if (r.ok) { toast('تنظیمات ذخیره شد'); await refresh(); } else toast(r.error || 'خطا', 'err');
      }
      else if (a === 'fake-save') {
        busy(t, 'ذخیره');
        const patch = collect($('#view'));
        patch.sub = { ...(patch.sub || {}), fakes: readFakes() };
        const r = await api('PUT', '/api/settings', { settings: patch });
        free(t);
        if (r.ok) { toast('کانفیگ‌های فیک ذخیره شد ✓'); await refresh(); }
        else toast(r.error || 'خطا در ذخیره', 'err');
      }
      else if (a === 'fake-add') {
        const fakes = S.d.settings.sub.fakes || [];
        const used = fakes.filter((f) => f.name && f.name.trim()).length;
        fakes.push({ id: 'fake_' + Date.now().toString(36), name: '', enabled: true, proto: 'vless', pin: false, pos: fakes.length + 1 });
        S.d.settings.sub.fakes = fakes;
        render(); refreshPreview();
        setTimeout(() => { const el = $('#fkList .fk-row:last-child .fk-name'); if (el) { el.focus(); toast('یک کانفیگ فیک اضافه شد — نام و متغیرها را وارد کنید', 'info'); } }, 80);
      }
      else if (a === 'fake-del') {
        if (!S.d.settings.sub.fakes) S.d.settings.sub.fakes = [];
        const i = Number(t.dataset.i);
        S.d.settings.sub.fakes.splice(i, 1);
        render(); refreshPreview();
        toast('حذف شد', 'err');
      }
      else if (a === 'fake-reset') {
        S.d.settings.sub.fakes = [
          { id: 'usage',     name: '📊 {usage}',        enabled: true,  proto: 'vless',  pin: true, pos: 1 },
          { id: 'remaining', name: '🟢 {remaining}',    enabled: true,  proto: 'vless',  pin: true, pos: 2 },
          { id: 'expiry',    name: '📅 {expiry}',       enabled: true,  proto: 'vless',  pin: true, pos: 3 },
          { id: 'channel',   name: '📢 {channel}',      enabled: true,  proto: 'trojan', pin: true, pos: 4 },
          { id: 'panel',     name: '⚙️ {panel} v{ver}', enabled: false, proto: 'trojan', pin: true, pos: 5 },
        ];
        render(); refreshPreview();
        toast('به پیش‌فرض بازگشت — برای اعمال، ذخیره کنید', 'info');
      }
      else if (a === 'user-new') { const r = await api('POST', '/api/users', { name: 'کاربر ' + (S.d.users.length + 1) }); if (r.user) { S.sel = r.user.id; await refresh(); userModal(S.d.users.find((u) => u.id === r.user.id) || r.user, true); } }
      else if (a === 'user-edit') userModal(S.d.users.find((u) => u.id === id));
      else if (a === 'user-toggle') { const r = await api('POST', '/api/users', { id, op: 'toggle' }); if (r.ok) { toast('انجام شد'); await refresh(); } }
      else if (a === 'user-reset') { const r = await api('POST', '/api/users', { id, op: 'reset' }); if (r.ok) { toast('مصرف ریست شد'); await refresh(); } }
      else if (a === 'user-del') { const u = S.d.users.find((x) => x.id === id); if (!confirm('کاربر «' + (u ? u.name : '') + '» حذف شود؟')) return; const r = await api('POST', '/api/users', { id, op: 'delete' }); if (r.ok) { toast('کاربر حذف شد', 'err'); closeM(); await refresh(); } }
      else if (a === 'user-copy-page') {
        const u = S.d.users.find((x) => x.id === id);
        if (u) copy(location.origin + '/' + S.d.settings.sub.path + '/' + u.uuid);
      }
      else if (a === 'qr') qrModal(v);
      else if (a === 'sub-load') {
        busy(t, 'دریافت');
        const u = S.d.users.find((x) => x.id === id);
        const link = location.origin + '/' + S.d.settings.sub.path + '/' + u.uuid + '?format=' + S.fmt;
        const tx = await fetch(link).then((r) => r.text());
        free(t);
        const out = $('#subOut');
        if (out) out.innerHTML = '<pre class="code"><div class="hd"><span>' + esc(S.fmt) + ' • ' + esc(tx.length) + ' کاراکتر</span><button class="btn sm" data-act="copy" data-v="' + esc(tx.slice(0, 100000)).replace(/"/g, '&quot;') + '">کپی</button></div>' + esc(tx.slice(0, 6000)) + (tx.length > 6000 ? '\n…' : '') + '</pre>';
      }
      else if (a === 'user-save') {
        busy(t, 'ذخیره');
        const patch = collect($('#mbox'));
        /* کانفیگ‌های فیک اختصاصی از DOM خوانده می‌شوند */
        patch.fakes = readUserFakes();
        patch.fakeMode = patch.fakeMode || 'inherit';
        const r = await api('POST', '/api/users', { id, op: 'update', patch });
        free(t);
        if (r.ok) { toast('ذخیره شد'); closeM(); await refresh(); } else toast(r.error || 'خطا', 'err');
      }
      else if (a === 'ufake-add') {
        if (!Array.isArray(u.fakes)) u.fakes = [];
        u.fakes.push({ id: 'uf_' + Date.now().toString(36), name: '', enabled: true, proto: 'vless', pos: u.fakes.length + 1 });
        /* بازتولید مودال برای نمایش ردیف جدید */
        const patch = collect($('#mbox')); patch.fakes = readUserFakes(); patch.fakeMode = u.fakeMode || 'custom';
        Object.assign(u, patch); u.fakeMode = 'custom';
        closeM(); userModal(u);
        setTimeout(() => { const el = $('#ufkList .fk-row:last-child .fk-name'); if (el) el.focus(); }, 80);
      }
      else if (a === 'ufake-reset') {
        u.fakes = [
          { id: 'usage',     name: '📊 {usage}',        enabled: true,  proto: 'vless',  pos: 1 },
          { id: 'remaining', name: '🟢 {remaining}',    enabled: true,  proto: 'vless',  pos: 2 },
          { id: 'expiry',    name: '📅 {expiry}',       enabled: true,  proto: 'vless',  pos: 3 },
          { id: 'channel',   name: '📢 {channel}',      enabled: true,  proto: 'trojan', pos: 4 },
          { id: 'panel',     name: '⚙️ {panel} v{ver}', enabled: false, proto: 'trojan', pos: 5 },
        ];
        const patch = collect($('#mbox')); patch.fakes = readUserFakes(); patch.fakeMode = 'custom';
        Object.assign(u, patch); u.fakeMode = 'custom';
        closeM(); userModal(u);
        toast('به پیش‌فرض بازگشت', 'info');
      }
      else if (a === 'ufake-del') {
        if (!Array.isArray(u.fakes)) u.fakes = [];
        const patch = collect($('#mbox')); patch.fakes = readUserFakes(); patch.fakeMode = 'custom';
        Object.assign(u, patch); u.fakeMode = 'custom';
        u.fakes.splice(Number(t.dataset.i), 1);
        closeM(); userModal(u);
        toast('حذف شد', 'err');
      }
      else if (a === 'regen') { const inp = $('#mbox [data-p="uuid"]'); if (inp) { inp.value = crypto.randomUUID(); toast('UUID جدید ساخته شد', 'info'); } }
      else if (a === 'close') closeM();
      else if (a === 'key-new') { const r = await api('POST', '/api/keys', {}); if (r.ok) { toast('کلید ساخته شد'); await refresh(); } else toast(r.error || 'خطا', 'err'); }
      else if (a === 'key-del') { const r = await api('DELETE', '/api/keys?id=' + id); if (r.ok) { toast('کلید حذف شد', 'err'); await refresh(); } }
      else if (a === 'panel-new') { const name = prompt('نام پنل:'); const url = prompt('آدرس ورکر:'); if (name && url) { await api('POST', '/api/panels', { name, url }); toast('پنل لینک شد'); await refresh(); } }
      else if (a === 'panel-del') { await api('DELETE', '/api/panels?id=' + id); toast('حذف شد', 'err'); await refresh(); }
      else if (a === 'panel-sync') { busy(t, 'همگام‌سازی'); await api('POST', '/api/panels', { id, op: 'sync' }); free(t); toast('همگام شد'); await refresh(); }
      else if (a === 'domain-check') { busy(t, 'بررسی'); const r = await api('POST', '/api/action', { act: 'domain-health' }); free(t); const o = $('#domainOut'); if (o) o.innerHTML = (r.checks || []).map((c) => '<div class="kv"><span>' + icon(c.ok ? 'fa-circle-check' : 'fa-circle-xmark') + ' ' + esc(c.name) + '</span><b class="mono" style="color:' + (c.ok ? 'var(--ok)' : 'var(--bad)') + '">' + esc(c.note || '') + '</b></div>').join(''); }
      else if (a === 'tg-test') { busy(t, 'ارسال'); const r = await api('POST', '/api/action', { act: 'tg-test' }); free(t); toast(r.ok ? 'پیام تست ارسال شد' : 'ارسال نشد — توکن/چت‌آیدی را چک کنید', r.ok ? 'ok' : 'err'); }
      else if (a === 'usage-health') {
        busy(t, 'بررسی');
        const r = await api('POST', '/api/action', { act: 'usage-health' });
        free(t);
        /* نتیجه ذخیره و سپس رندر می‌شود — uhHtml از state/localStorage می‌خواند
           پس با هر بار بازسازیِ صفحه همین گزارش دوباره نمایش داده می‌شود. */
        uhSave(r);
        uhShow();
      }
      else if (a === 'usage-health-clear') {
        UH.last = null; UH.ts = 0;
        try { localStorage.removeItem(UH_KEY); } catch (e) {}
        uhShow();
      }
      else if (a === 'traffic-test') {
        /* ═══ تست واقعی ترافیک — درخواست از مرورگرِ کسی که دکمه را زده ═══
           ۱) سرور یک نشست می‌سازد و مصرفِ فعلیِ کاربر را می‌خواند
           ۲) همین مرورگر فایل را از سرور دانلود می‌کند
           ۳) سرور افزایش مصرفِ ثبت‌شده را با اندازه‌ی فایل مقایسه می‌کند */
        const sel = $('#ttUser'), sz = $('#ttSize');
        const uuid = (sel && sel.value) || '';
        const sizeMB = Math.max(1, Math.min(20, Number(sz && sz.value) || 1));
        TT.uuid = uuid; TT.mb = sizeMB;
        let r = null;
        try {
          busy(t, 'آماده‌سازی…');
          const begin = await api('POST', '/api/action', { act: 'traffic-begin', uuid, sizeMB });
          if (begin.error) throw new Error(begin.error);
          busy(t, 'در حال دانلود…');
          const res = await fetch(begin.url, { cache: 'no-store' });
          if (!res.ok) throw new Error('سرور پاسخ نداد (' + res.status + ')');
          const buf = await res.arrayBuffer();
          const received = buf.byteLength || 0;
          busy(t, 'در حال بررسی…');
          r = await api('POST', '/api/action', { act: 'traffic-end', sid: begin.sid, received });
          r.received = received;
          r.recordedHeader = res.headers ? (res.headers.get('x-usage-recorded') || '') : '';
        } catch (e) {
          free(t);
          /* گزارشِ شکست هم ذخیره می‌شود تا علت روی صفحه بماند */
          ttSave({ failed: true, ok: false, error: String((e && e.message) || e), ts: Date.now() });
          ttShow();
          toast('تست ناموفق بود', 'err');
          return;
        }
        free(t);
        if (r.error && r.measured === undefined) {
          ttSave({ failed: true, ok: false, error: String(r.error || 'تست انجام نشد'), ts: Date.now() });
          ttShow();
          toast('تست ناموفق بود', 'err');
          return;
        }
        /* نتیجه ذخیره می‌شود: تا تستِ بعدی روی صفحه می‌ماند */
        ttSave({
          ok: !!r.ok, expected: r.expected || r.want, want: r.want, received: r.received,
          measured: r.measured, diff: r.diff, tolerance: r.tolerance, user: r.user,
          up: r.up, down: r.down, storage: r.storage, waitedMs: r.waitedMs, ts: Date.now(),
        });
        ttShow();
        toast(r.ok ? 'شمارش مصرف درست است ✓' : 'اختلاف بیش از حد مجاز — شمارش بررسی شود', r.ok ? 'ok' : 'err');
        await refresh();
      }
      else if (a === 'decoy-test') {
        busy(t, 'در حال تست');
        const r = await api('POST', '/api/action', { act: 'decoy-test' });
        free(t);
        const o = $('#decoyOut');
        if (o) o.innerHTML = r.ok
          ? '<div class="kv"><span>' + icon('fa-circle-check') + ' سایت پوششی فعال</span><b class="mono">' + esc(r.target) + '</b></div>' +
            '<div class="kv"><span>منبع</span><b>' + (r.mode === 'live' ? 'واکشیِ زنده از سایت واقعی' : 'صفحه‌ی داخلی — سایت در دسترس نبود') + '</b></div>' +
            '<div class="kv"><span>استتار / اضطراری</span><b>' + (r.disguise ? 'فعال' : 'خاموش') + ' / ' + (r.panic ? 'فعال' : 'خاموش') + '</b></div>' +
            '<div class="kv"><span>حجم پاسخ</span><b class="mono">' + fa(r.size) + ' بایت</b></div>' +
            '<div class="kv" style="flex-direction:column;align-items:flex-start"><span>متن صفحه</span><b style="font-weight:400;line-height:1.9">' + esc(r.sample) + '…</b></div>'
          : '<div class="kv"><span>' + icon('fa-circle-xmark') + ' سایت پوششی</span><b class="mono">خطا در دریافت</b></div>';
        toast(r.ok ? 'سایت پوششی واقعی کار می‌کند ✓' : 'سایت پوششی در دسترس نیست', r.ok ? 'ok' : 'err');
      }
      else if (a === 'tunnel-test') {
        busy(t, 'در حال تست');
        const r = await api('POST', '/api/action', { act: 'tunnel-test' });
        free(t);
        const o = $('#tunnelOut');
        if (o) o.innerHTML = (r.checks || []).map((c) => '<div class="kv"><span>' + icon(c.ok ? 'fa-circle-check' : 'fa-circle-xmark') + ' ' + esc(c.name) + '</span><b class="mono" style="font-size:10px;color:' + (c.ok ? 'var(--ok)' : 'var(--bad)') + ';max-width:60%;overflow:hidden;text-overflow:ellipsis">' + esc(c.note || '') + '</b></div>').join('') +
          '<div class="hint" style="margin-top:12px"><b>تست‌های بعدی (خودتان انجام دهید):</b></div>' +
          '<div class="btn-row" style="margin:8px 0">' +
          '<a class="btn sm" href="' + esc(location.origin + S.d.settings.path + '?test=1') + '" target="_blank">' + icon('fa-vial') + ' تست مسیر تونل در مرورگر</a>' +
          '<a class="btn sm" href="/health" target="_blank">' + icon('fa-heart-pulse') + ' تست سلامت ورکر</a></div>' +
          '<div class="hint">اگر روی «تست مسیر تونل» متن <span class="mono">TUNNEL_OK</span> دیدید، مسیر از اینترنت شما در دسترس است و مشکل قطعاً از تنظیمات کلاینت است.</div>' +
          '<div class="hint" style="margin-top:12px"><b>چک‌لیست کلاینت (به‌ترتیب):</b></div>' +
          '<div class="hint">۱. ساب را در کلاینت <b>دوباره رفرش</b> کنید تا کانفیگ جدید (بدون <span class="mono">?ed=2048</span> و با ALPN درست) بیاید.</div>' +
          '<div class="hint">۲. اگر از v2rayNG استفاده می‌کنید: تنظیمات → «Fragment» را خاموش کنید و در تنظیمات SSL، گزینه‌ی «allowInsecure» را روشن کنید و دوباره امتحان کنید.</div>' +
          '<div class="hint">۳. در کلاینت، آدرس سرور را به‌جای IP پاک، خودِ دامنه‌ی ورکر بگذارید (کانفیگ دستی) — اگر وصل شد یعنی آن IP در ISP شما فیلتر است.</div>' +
          '<div class="hint">۴. کانفیگ را در یک کلاینت دیگر (Hiddify یا v2rayN) امتحان کنید تا مشکل کلاینت مشخص شود.</div>' +
          '<div class="hint">۵. اگر سایت مقصد خودش روی کلاودفلر است، از داخل تونل قابل دسترسی نیست (محدودیت <span class="mono">connect()</span>) — سایت دیگری را تست کنید.</div>' +
          '<div class="hint" style="margin-top:12px"><b>راهنمای تفسیر نتایج:</b></div>' +
          '<div class="hint">• <b>SNI / Host قرمز</b> = رایج‌ترین علت. SNI و Host را در «پروتکل و کانفیگ» خالی بگذارید تا دامنه‌ی خود ورکر استفاده شود.</div>' +
          '<div class="hint">• <b>ترنسپورت قرمز</b> = باید WebSocket باشد؛ gRPC و XHTTP فقط در ساب تولید می‌شوند.</div>' +
          '<div class="hint">• <b>خروجی TCP</b> با یک پرس‌وجوی واقعی DNS به <span class="mono">8.8.8.8:53</span> تست می‌شود (نه IP کلاودفلر، نه سرویس HTTP). اگر سبز باشد یعنی سوکت‌های خروجی سالم‌اند.</div>' +
          '<div class="hint">• <b>🧪 تست سرتاسری</b> مهم‌ترین بررسی است: ورکر خودش از طریق DNS و لبه‌ی کلاودفلار به خودش وصل می‌شود، ارتقای WebSocket می‌گیرد، هدر VLESS می‌فرستد و پاسخ واقعی می‌گیرد. اگر سبز باشد یعنی <b>کل مسیر کلاینت تا مقصد سالم است</b> و مشکل قطعاً از کلاینت یا IP پاک است.</div>' +
          '<div class="hint">• <b>سوکت به پورت ۸۰</b> صرفاً اطلاعاتی است (سبز نمایش داده می‌شود). اگر کلاودفلر اجازه ندهد، هسته به‌طور خودکار از <span class="mono">fetch()</span> جایگزین استفاده می‌کند.</div>' +
          '<div class="hint">• <b>دامنه‌ی SNI</b> اگر workers.dev باشد و در شبکه‌ی شما فیلتر نباشد، مشکلی نیست.</div>' +
          '<div class="hint">• <b>محدودیت کلاودفلر:</b> سایت‌های میزبانی‌شده روی کلاودفلر از داخل تونل مستقیماً قابل دسترسی نیستند (محدودیت <span class="mono">connect()</span>). سایت‌های معمولی (گوگل، یوتیوب، تلگرام و…) مشکلی ندارند.</div>' +
          '<div class="hint">• <b>هسته‌ی تونل VLESS/Trojan</b> اگر سبز باشد، یعنی پارس پروتکل، تطبیق UUID/رمز و اتصال واقعی به مقصد همه سالم‌اند — پس کانفیگ از سمت سرور درست است؛ اگر کلاینت وصل نمی‌شود، مسیر شبکه (فیلتر بودن workers.dev) یا SNI است.</div>';
        toast(r.ok ? 'همه‌ی بررسی‌ها سالم بود ✓' : 'مشکلی پیدا شد — جزئیات را ببینید', r.ok ? 'ok' : 'err');
        if (r.error) toast('خطای سرور: ' + r.error, 'err');
      }
      else if (a === 'upd-check') { busy(t, 'بررسی'); const r = await api('POST', '/api/action', { act: 'update-check' }); free(t); toast(r.msg || 'بررسی شد', 'info'); await refresh(); }
      else if (a === 'upd-deploy') { busy(t, 'نصب'); const r = await api('POST', '/api/action', { act: 'update-deploy' }); free(t); toast(r.msg || 'نصب شد'); await refresh(); }
      else if (a === 'upd-rollback') { busy(t, 'بازگشت'); const r = await api('POST', '/api/action', { act: 'update-rollback' }); free(t); toast(r.msg || 'بازگشت انجام شد', 'info'); await refresh(); }
      else if (a === 'rotate-path') { const r = await api('POST', '/api/action', { act: 'rotate-path' }); toast('مسیر جدید: /' + (r.path || '')); await refresh(); }
      /* ═════════════════════════════════════════════════════════════
         مرحله‌ی ۴ — انتخابگرِ پورت
         این دکمه‌ها فرم را ذخیره نمی‌کنند؛ فقط مقدارِ فیلدِ پنهان را عوض
         می‌کنند تا با ذخیره‌ی بعدیِ تنظیمات همراه برود.
         ═════════════════════════════════════════════════════════════ */
      else if (a === 'ports-essential') { portSet(PORT_ESSENTIAL); toast('فقط پورت‌های ضروری فعال شد — ذخیره را فراموش نکنید', 'info'); }
      else if (a === 'ports-recommended') { portSet(PORTS_DEFAULT); toast('پورت‌های ضروری + پیشنهادی فعال شد', 'info'); }
      else if (a === 'ports-all') { portSet(PORTS_ALL); toast('همه‌ی پورت‌های پشتیبانی‌شده فعال شد', 'info'); }

      /* ═════════════════════════════════════════════════════════════
         مرحله‌ی ۴ — تغییر رمز عبور
         چهار خروجیِ متفاوت دارد و هر کدام رفتارِ خودش را دارد:
         ok → پیامِ سرور + خروجِ اجباری (relogin)، چون نشست با رمزِ قبلی
              امضا شده و بعد از تغییر نامعتبر است؛
         ۴۰۹ → رمز به MASTER_KEY بایند شده، پس فیلدها قفل می‌شوند تا
              کاربر فکر نکند چیزی عوض شده است.
         ═════════════════════════════════════════════════════════════ */
      else if (a === 'pw-save') {
        const curEl = $('#pwCur'), nwEl = $('#pwNew'), nw2El = $('#pwNew2');
        const cur = curEl ? curEl.value : '', nw = nwEl ? nwEl.value : '', nw2 = nw2El ? nw2El.value : '';
        PW.msg = ''; PW.kind = '';
        if (!cur) { PW.msg = 'رمز عبور فعلی را وارد کنید'; PW.kind = 'err'; pwShow(); return; }
        if (nw.length < 5) { PW.msg = 'رمز جدید باید دست‌کم ۵ نویسه باشد'; PW.kind = 'err'; pwShow(); return; }
        if (nw !== nw2) { PW.msg = 'تکرارِ رمز جدید با رمز جدید یکسان نیست'; PW.kind = 'err'; pwShow(); return; }
        busy(t, 'در حال تغییر');
        const r = await api('POST', '/api/password', { current: cur, newPassword: nw });
        free(t);
        PW.msg = (r && (r.msg || r.error)) || 'تغییرِ رمز انجام نشد';
        /* ۴۰۹ = رمز از متغیر محیطی می‌آید و از این صفحه قابل تغییر نیست */
        if (r && r.__status === 409) { PW.locked = true; PW.kind = 'err'; pwShow(); toast(PW.msg, 'err'); return; }
        if (r && r.ok) {
          PW.kind = 'ok'; pwShow(); toast(PW.msg || 'رمز تغییر کرد', 'ok');
          if (r.relogin !== false) { S.token = ''; sessionStorage.removeItem('sg_t'); S.d = null; render(); }
          return;
        }
        PW.kind = 'err'; pwShow(); toast(PW.msg, 'err');
      }

      /* ═════════════════════════════════════════════════════════════
         مرحله‌ی ۴ — پشتیبان و بازیابی
         ═════════════════════════════════════════════════════════════ */
      else if (a === 'bk-load') {
        busy(t, 'در حال ساخت');
        const r = await api('GET', '/api/backup');
        free(t);
        if (r && r.kind) { BK.data = r; BK.err = ''; BK.errors = []; bkShow(); toast('پشتیبان آماده است — آن را بیرون بکشید یا دانلود کنید', 'ok'); }
        else toast((r && r.error) || 'ساختِ پشتیبان انجام نشد', 'err');
      }
      else if (a === 'bk-download') {
        if (!BK.data) { toast('ابتدا «ساخت پشتیبان» را بزنید', 'err'); return; }
        const blob = new Blob([JSON.stringify(BK.data, null, 2)], { type: 'application/json' });
        const dl = document.createElement('a');
        dl.href = URL.createObjectURL(blob);
        dl.download = bkName(BK.data);
        dl.click();
        setTimeout(() => URL.revokeObjectURL(dl.href), 4000);
        toast('پشتیبان دانلود شد', 'ok');
      }
      else if (a === 'bk-clear') { BK.data = null; BK.file = null; BK.err = ''; BK.errors = []; bkShow(); toast('پاک شد', 'info'); }
      /* ناحیه‌ی رها کردن — کلیک هم همان انتخاب‌گرِ فایل را باز می‌کند */
      else if (a === 'bk-pick') { const f = $('#bkFile'); if (f) f.click(); }
      else if (a === 'bk-mode') { BK.mode = String(v || 'merge'); bkShow(); }
      else if (a === 'bk-cancel') { BK.file = null; BK.err = ''; BK.errors = []; bkShow(); }
      else if (a === 'bk-restore') {
        if (!BK.file || !BK.file.data) { toast('ابتدا یک فایل پشتیبان رها کنید', 'err'); return; }
        const cnt = fa(((BK.file.data || {}).users || []).length);
        if (!confirm('فایل پشتیبان با ' + cnt + ' کاربر ' +
            (BK.mode === 'replace' ? 'جایگزینِ همه‌ی تنظیمات شود؟\nتنظیماتِ فعلی از بین می‌رود.' : 'در تنظیماتِ فعلی ادغام شود؟\nکاربرانِ فعلی نگه داشته می‌شوند.') +
            '\nادامه می‌دهید؟')) return;
        busy(t, 'در حال بازیابی');
        const r = await api('POST', '/api/restore', { data: BK.file.data, mode: BK.mode });
        free(t);
        if (r && r.ok) {
          BK.file = null; BK.data = null; BK.err = ''; BK.errors = []; bkShow();
          toast(r.msg || 'بازیابی انجام شد', 'ok');
          await refresh();
          return;
        }
        /* خطاها همان‌طور که سرور فرستاده نمایش داده می‌شوند — فایلِ نامعتبر
           نباید بی‌صدا رد شود و کاربر نداند کدام بخش مشکل داشت */
        BK.err = (r && r.error) || 'بازیابی انجام نشد';
        BK.errors = (r && Array.isArray(r.errors)) ? r.errors : [];
        bkShow();
        toast(BK.err, 'err');
      }

      /* ═════════════════════════════════════════════════════════════
         مرحله‌ی ۴ — نام‌گذاریِ کانفیگ‌ها
         ═════════════════════════════════════════════════════════════ */
      else if (a === 'nm-sel-all') { NM.init = true; ((S.d && S.d.users) || []).forEach((u) => { NM.sel[u.id] = true; }); nmShow(); }
      else if (a === 'nm-sel-none') { NM.init = true; NM.sel = {}; nmShow(); }
      else if (a === 'nm-apply') {
        const plan = nmPlan();
        if (!plan.length) { toast('هیچ کانفیگی انتخاب نشده — روی نامِ کانفیگ‌ها در بالا کلیک کنید', 'err'); return; }
        NM.pat = nmPat();
        if (!confirm(fa(plan.length) + ' کانفیگ با این الگو نام‌گذاری شود؟\nکاربران باید اشتراک‌شان را دوباره بگیرند.')) return;
        busy(t, 'در حال اعمال');
        let done = 0, failed = 0;
        /* الگو برای هر کانفیگ جداگانه ذخیره می‌شود تا بعداً بشود آن را
           برای یک کاربرِ خاص عوض کرد، پس نمی‌شود همه را با یک درخواست فرستاد */
        for (const p of plan) {
          const r = await api('POST', '/api/users', { id: p.id, op: 'update', patch: { namePattern: p.pattern } });
          if (r && r.ok) done++; else failed++;
        }
        free(t);
        await refresh();
        nmShow();
        toast(failed ? (fa(done) + ' کانفیگ تغییر کرد، ' + fa(failed) + ' تا انجام نشد')
                     : (fa(done) + ' کانفیگ نام‌گذاری شد — کاربران ساب را دوباره بگیرند'), failed ? 'err' : 'ok');
      }

      /* ═════════════════════════════════════════════════════════════
         مرحله‌ی ۴ — سرورهای خروجی VLESS
         ═════════════════════════════════════════════════════════════ */
      else if (a === 'exit-new') { EX.form = exitBlank(); EX.test = null; exShow(); const nm = $('#ex_link'); if (nm) nm.focus(); }
      else if (a === 'exit-cancel') { EX.form = null; exShow(); }
      else if (a === 'exit-reload') { busy(t, 'بارخوانی'); EX.test = null; await exLoad(); free(t); }
      else if (a === 'exit-edit') {
        const srv = ((EX.data && EX.data.servers) || []).find((x) => x.id === id);
        EX.form = srv ? exitRead(srv) : exitBlank();
        EX.test = null; exShow();
      }
      else if (a === 'exit-save') {
        const body = exitFormRead();
        if (!body.link) { toast('لینکِ vless:// را در فیلد بچسبانید', 'err'); return; }
        busy(t, 'در حال ذخیره');
        /* قراردادِ ورکر: add فقط link می‌گیرد، update هم id را */
        const r = await api('POST', '/api/exits', body.id ? { op: 'update', id: body.id, link: body.link } : { op: 'add', link: body.link });
        free(t);
        if (r && r.ok) { EX.form = null; await exLoad(); toast(r.msg || 'سرور خروجی ذخیره شد', 'ok'); }
        else toast((r && r.error) || 'ذخیره انجام نشد', 'err');
      }
      else if (a === 'exit-del') {
        const srv = ((EX.data && EX.data.servers) || []).find((x) => x.id === id);
        if (!confirm('سرور خروجیِ «' + ((srv && srv.name) || id) + '» حذف شود؟\nکانفیگ‌هایی که به آن وابسته بودند مستقیم می‌شوند.')) return;
        busy(t, 'در حال حذف');
        const r = await api('POST', '/api/exits', { op: 'delete', id });
        free(t);
        if (r && r.ok) { EX.form = null; EX.test = null; await exLoad(); toast(r.msg || 'حذف شد', 'ok'); }
        else toast((r && r.error) || 'حذف انجام نشد', 'err');
      }
      else if (a === 'exit-test') {
        /* فرم دیگر فیلدی ندارد که بشود بدون ذخیره تستش کرد، پس تست فقط روی
           یک سرورِ ذخیره‌شده معنا دارد. */
        if (!id) { toast('سرور را نخست ذخیره کنید، سپس اتصالش را تست کنید', 'err'); return; }
        const srv = ((EX.data && EX.data.servers) || []).find((x) => x.id === id);
        EX.testing = id; EX.test = null; exShow();
        const r = await api('POST', '/api/exits/test', { id });
        EX.testing = '';
        EX.test = (r && r.name) ? r : { name: ((srv && srv.name) || '—'), reachable: false, error: (r && r.error) || 'تست انجام نشد' };
        exShow();
        toast((r && r.msg) || 'تست انجام شد', r && r.reachable ? 'ok' : 'err');
      }
      else if (a === 'exit-default') {
        const sel = $('#exDefault');
        const val = sel ? String(sel.value || '') : '';
        busy(t, 'در حال ذخیره');
        const r = await api('POST', '/api/exits/default', val ? { mode: 'exit', exitId: val } : { mode: 'direct' });
        free(t);
        if (r && r.ok) { await exLoad(); toast(r.msg || 'پیش‌فرضِ سراسری ذخیره شد', 'ok'); }
        else toast((r && r.error) || 'ذخیره انجام نشد', 'err');
      }
      else if (a === '2fa-gen') { const r = await api('POST', '/api/action', { act: '2fa-secret' }); const o = $('#totpOut'); if (o) o.innerHTML = r.secret ? '<div class="row-item"><div class="grow"><b class="mono">' + esc(r.secret) + '</b><div class="cell-sub mono">' + esc(r.url || '') + '</div></div><button class="btn sm ghost" data-act="copy" data-v="' + esc(r.secret) + '">' + icon('fa-copy') + '</button></div>' : '<div class="empty">ساخته نشد</div>'; }
      else if (a === 'factory') { if (!confirm('همه‌ی کاربران و تنظیمات به حالت اول برگردند؟')) return; await api('POST', '/api/action', { act: 'factory' }); toast('ریست شد', 'err'); await refresh(); }
      else if (a === 'logs-clear') { await api('POST', '/api/action', { act: 'logs-clear' }); toast('لاگ پاک شد', 'err'); await refresh(); }
    } catch (err) { free(t); toast('خطا: ' + err.message, 'err'); }
  });

  document.addEventListener('change', async (e) => {
    if (e.target.closest('[data-act="sel-user"]')) { S.sel = e.target.value; render(); }
    if (e.target.classList.contains('fk-proto')) refreshPreview();
    /* انتخابگرِ فایلِ پشتیبان — مسیرِ کلیک‌کردن، هم‌ارز با رها‌کردن */
    if (e.target.id === 'bkFile') {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) await bkReadFile(f);
    }
    /* انتخابِ خروجی برای هر کانفیگ — بر پیش‌فرضِ سراسری مقدم است.
       مقدارِ select یا inherit/direct است یا شناسه‌ی یکی از سرورها. */
    if (e.target.id && e.target.id.indexOf('exSel-') === 0) {
      const uid = e.target.id.slice(6);
      const val = String(e.target.value || 'inherit');
      const named = val === 'inherit' || val === 'direct';
      const r = await api('POST', '/api/exits', {
        op: 'select', uuid: uid,
        mode: named ? val : 'exit',
        exitId: named ? '' : val,
      });
      if (r && r.ok) { toast(r.msg || 'خروجیِ کانفیگ ذخیره شد', 'ok'); await exLoad(); }
      else { toast((r && r.error) || 'ذخیره انجام نشد', 'err'); await exLoad(); }
    }
  });

  /* جستجوی کاربران: فیلتر زنده‌ی ردیف‌ها بدون رندر مجدد (تمرکز و مقدار حفظ می‌شود) */
  document.addEventListener('input', (e) => {
    if (e.target.id === 'uSearch') {
      S.q = e.target.value;
      const q = S.q.trim().toLowerCase();
      $$('tbody tr[data-uid]').forEach((tr) => {
        const u = S.d.users.find((x) => x.id === tr.dataset.uid);
        if (!u) return;
        const hit = !q || [u.name, u.uuid, u.note, u.secret].join(' ').toLowerCase().includes(q);
        tr.dataset.hit = hit ? '1' : '0';
      });
      const vis = $$('tbody tr[data-uid]').filter((tr) => tr.dataset.hit === '1').length;
      let bar = $('#uCount');
      if (!bar) { bar = document.createElement('div'); bar.id = 'uCount'; bar.className = 'hint'; $('#uSearchBox').parentElement.appendChild(bar); }
      bar.textContent = fa(vis) + ' از ' + fa(S.d.users.length) + ' کاربر';
    }
    /* جست‌وجو در جدولِ اتصال‌های زنده حذف شده است */
    if (e.target.id === 'tbSearch') doSearch(e.target.value);
    /* به‌روزرسانی زنده‌ی پیش‌نمایش کانفیگ‌های فیک */
    if (e.target.classList.contains('fk-name') || e.target.classList.contains('fk-pos')) refreshPreview();
    if (e.target.type === 'range') { const b = e.target.parentElement.querySelector('b'); if (b) b.textContent = e.target.value + (b.textContent.match(/[^\d۰-۹]+$/) || [''])[0]; }
    /* پیش‌نمایشِ زنده‌ی نام‌گذاری — هر تغییر در الگو همان لحظه پیش‌نمایش را
       می‌سازد، بدون رندرِ دوباره‌ی کل صفحه */
    if (e.target.id === 'nmPat') { NM.pat = nmPat(); nmShow(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'lgPw') { const b = $('[data-act="login"]'); if (b) b.click(); }
    if (e.key === 'Escape') { closeM(); $('#searchDrop').classList.remove('show'); closeDrawer(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); const s = $('#tbSearch'); if (s) s.focus(); }
  });

  /* ═══════════════════════════════════════════════════════════════════════
     مرحله‌ی ۴ — کشیدن و رها کردنِ فایلِ پشتیبان
     دو جهت دارد: ورودی (فایل روی ناحیه رها می‌شود) و خروجی (کارتِ پشتیبان
     بیرون کشیده می‌شود). هر دو روی document گوش می‌دهند، چون ناحیه با هر
     رندر دوباره ساخته می‌شود و نمی‌شد به خودِ عنصر گره زد.
     ═══════════════════════════════════════════════════════════════════════ */
  const BK_MIME = 'application/json';
  /* خروجی — کارتِ پشتیبان به بیرون کشیده می‌شود */
  document.addEventListener('dragstart', (e) => {
    const h = e.target && e.target.closest ? e.target.closest('#bkHandle') : null;
    if (!h || !BK.data) return;
    const txt = JSON.stringify(BK.data, null, 2);
    const name = bkName(BK.data);
    try {
      e.dataTransfer.setData(BK_MIME, txt);
      e.dataTransfer.setData('text/plain', txt);
      /* DownloadURL مرورگر را وادار می‌کند فایل را با نامِ درست بنویسد؛
         بدون آن فقط متنِ خام رها می‌شود */
      e.dataTransfer.setData('DownloadURL', BK_MIME + ':' + name + ':' +
        URL.createObjectURL(new Blob([txt], { type: BK_MIME })));
      e.dataTransfer.effectAllowed = 'copy';
    } catch (er) { /* مرورگری که DownloadURL را نشناسد — همان مسیرِ متنی کافی است */ }
    h.style.opacity = '.6';
  });
  document.addEventListener('dragend', (e) => {
    const h = e.target && e.target.closest ? e.target.closest('#bkHandle') : null;
    if (h) h.style.opacity = '';
  });
  /* ورودی — باید dragover را پیش‌فرض‌گیری کنیم، وگرنه مرورگر خودش فایل را
     باز می‌کند و صفحه‌ی پنل از بین می‌رود */
  document.addEventListener('dragover', (e) => {
    if (!e.dataTransfer) return;
    const z = $('#bkDrop'); if (!z) return;
    if (!e.target || !e.target.closest || !e.target.closest('#bkDrop')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    bkZoneOn(z, true);
  });
  document.addEventListener('dragleave', (e) => {
    const z = $('#bkDrop'); if (!z) return;
    /* هنگامِ جابه‌جایی روی فرزندانِ ناحیه هم dragleave می‌آید — فقط وقتی
       واقعاً از ناحیه بیرون رفت حالتِ فعال برداشته شود */
    const to = e.relatedTarget;
    if (to && to.closest && to.closest('#bkDrop')) return;
    bkZoneOn(z, false);
  });
  document.addEventListener('drop', async (e) => {
    const z = $('#bkDrop'); if (!z) return;
    if (!e.target || !e.target.closest || !e.target.closest('#bkDrop')) return;
    e.preventDefault();
    bkZoneOn(z, false);
    const dt = e.dataTransfer;
    if (!dt) return;
    const f = (dt.files && dt.files[0]) || null;
    if (f) { await bkReadFile(f); return; }
    /* برخی مرورگرها هنگامِ کشیدنِ متن، files نمی‌دهند — همان متن را می‌خوانیم */
    const txt = dt.getData(BK_MIME) || dt.getData('text/plain') || '';
    if (!String(txt).trim()) { BK.err = 'فایلی در ناحیه رها نشد'; BK.errors = []; bkShow(); toast(BK.err, 'err'); return; }
    await bkReadFile({ name: 'dropped.json', text: async () => txt });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#searchBox')) $('#searchDrop').classList.remove('show'); });

  /* ═══ ناوبری ═══
     موبایل (≤1024px): سایدبار کشویی است → دکمه باز/بسته می‌کند
     دسکتاپ (>1024px): سایدبار ثابت است → دکمه نمایش/مخفی می‌کند */
  const isMobile = () => window.matchMedia('(max-width: 1024px)').matches;
  const openDrawer = () => {
    $('#sidebar').classList.add('open');
    $('#scrim').classList.add('show');
    document.body.classList.add('nav-open');
  };
  const closeDrawer = () => {
    $('#sidebar').classList.remove('open');
    $('#scrim').classList.remove('show');
    document.body.classList.remove('nav-open');
  };
  const toggleNav = () => {
    if (isMobile()) { $('#sidebar').classList.contains('open') ? closeDrawer() : openDrawer(); }
    else { document.body.classList.toggle('nav-collapsed'); }
  };
  $('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleNav(); });
  $('#scrim').addEventListener('click', closeDrawer);
  window.addEventListener('resize', () => { if (!isMobile()) closeDrawer(); });

  /* خروج */
  $('#logoutBtn').addEventListener('click', () => {
    if (!confirm('از پنل خارج شوید؟')) return;
    S.token = ''; sessionStorage.removeItem('sg_t'); S.d = null; render(); toast('خارج شدید', 'info');
  });

  /* تم */
  const setThemeIcon = () => { $('#themeBtn').innerHTML = icon(document.documentElement.dataset.theme === 'light' ? 'fa-moon' : 'fa-sun'); };
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = cur;
    try { localStorage.setItem('sg_theme', cur); } catch (e) {}
    setThemeIcon();
  });

  /* Panic */
  $('#panicBtn').addEventListener('click', async () => {
    const b = $('#panicBtn');
    busy(b, '…');
    const r = await api('POST', '/api/action', { act: 'panic' });
    free(b);
    toast(r.panic ? 'Panic Mode فعال شد — همه‌ی تونل‌ها قطع شدند' : 'سرویس فعال شد', r.panic ? 'err' : 'ok');
    await refresh();
  });

  /* ═══════════ مودال ویرایش کاربر — چیدمان دسته‌بندی‌شده ═══════════ */
  /* ═══════════ کارت مدیریت کانفیگ‌های فیک ═══════════ */
  const FAKE_VARS = [
    ['{usage}', 'مصرف کل'], ['{remaining}', 'حجم باقی‌مانده'], ['{percent}', 'درصد مصرف'],
    ['{expiry}', 'تاریخ انقضا'], ['{days}', 'روزهای باقی‌مانده'], ['{quota}', 'سهمیه کل'],
    ['{up}', 'آپلود'], ['{down}', 'دانلود'], ['{req}', 'تعداد درخواست'],
    ['{channel}', 'کانال تلگرام'], ['{panel}', 'نام پنل'], ['{ver}', 'نسخه'],
    ['{user}', 'نام کاربر'], ['{mode}', 'حالت پروتکل'], ['{date}', 'تاریخ امروز'],
    ['{time}', 'ساعت'], ['{ip}', 'آدرس پنل'],
  ];

  function fakeConfigsCard() {
    const s = S.d.settings;
    const fakes = (s.sub && Array.isArray(s.sub.fakes)) ? s.sub.fakes : [];
    return '<div class="card"><header><span class="ic">' + icon('fa-list-check') + '</span>' +
      '<div><h3>کانفیگ‌های فیک (اطلاعاتی)</h3>' +
      '<p>در ابتدای لیست ساب کلاینت نمایش داده می‌شوند تا مصرف و انقضا در برنامه دیده شود</p></div>' +
      '<div class="acts">' +
      '<button class="btn sm" data-act="fake-reset" title="بازگشت به ۵ کانفیگ پیش‌فرض">' + icon('fa-rotate-left') + ' پیش‌فرض</button>' +
      '<button class="btn sm s" data-act="fake-add">' + icon('fa-plus') + ' افزودن</button>' +
      '<button class="btn sm p" data-act="fake-save">' + icon('fa-floppy-disk') + ' ذخیره</button>' +
      '</div></header>' +
      '<div class="bd">' +

      /* راهنمای متغیرها */
      '<div class="fk-help"><div class="fk-help-t">' + icon('fa-circle-info') + ' متغیرهای مجاز — روی هرکدام کلیک کنید تا در فیلد فعال درج شود</div>' +
      '<div class="chips">' + FAKE_VARS.map(([v, d]) =>
        '<button class="chip fk-var" data-var="' + esc(v) + '" title="' + esc(d) + '"><span class="mono">' + esc(v) + '</span></button>').join('') +
      '</div></div>' +

      /* فهرست کانفیگ‌های فیک */
      '<div class="fk-list" id="fkList">' +
      (fakes.map((f, i) => fakeRow(f, i)).join('') || '<div class="empty">هیچ کانفیگ فکی تعریف نشده</div>') +
      '</div>' +

      /* نمونه‌ی پیش‌نمایش */
      '<div class="fk-preview" id="fkPreview"></div>' +
      '</div></div>';
  }

  function fakeRow(f, i) {
    const on = !!(f && f.enabled);
    const pinned = !!(f && f.pin);
    return '<div class="fk-row' + (on ? '' : ' off') + '" data-i="' + i + '">' +
      /* سوییچ فعال */
      '<div class="sw' + (on ? ' on' : '') + '" data-fake-sw="' + i + '"><i></i></div>' +
      /* شماره ترتیب */
      '<input class="fk-pos mono" data-fake-pos="' + i + '" value="' + esc(f.pos || (i + 1)) + '" title="ترتیب" inputmode="numeric">' +
      /* نام با متغیرها */
      '<input class="fk-name" data-fake-name="' + i + '" value="' + esc(f.name || '') + '" placeholder="📊 {usage}" ' + (pinned ? 'readonly' : '') + '>' +
      /* پروتکل */
      '<select class="fk-proto" data-fake-proto="' + i + '"' + (pinned ? ' disabled' : '') + '>' +
      ['vless', 'trojan'].map((p) => '<option value="' + p + '"' + (f.proto === p ? ' selected' : '') + '>' + p + '</option>').join('') +
      '</select>' +
      /* دکمه‌ها */
      (pinned ? '<span class="badge ac" title="از پیش تعریف‌شده">' + icon('fa-lock') + ' ثابت</span>'
              : '<button class="btn sm d" data-act="fake-del" data-i="' + i + '" title="حذف">' + icon('fa-trash-can') + '</button>') +
      '</div>';
  }

  function refreshPreview() {
    const s = S.d.settings;
    const box = $('#fkPreview');
    if (!box) return;
    const fakes = (s.sub && Array.isArray(s.sub.fakes)) ? s.sub.fakes : [];
    const act = fakes.filter((f) => f.enabled && f.name).sort((a, b) => (a.pos || 99) - (b.pos || 99));
    const u = S.d.users[0] || { name: 'کاربر نمونه', uuid: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', secret: 'sample', up: 5.5 * 1073741824, down: 24.3 * 1073741824, quotaGB: 50, totalReq: 1234, expiryAt: Date.now() + 45 * 86400000 };
    const vars = { usage: 'مصرف: ۲۹.۸۰ GB از ۵۰.۰۰ GB', remaining: 'باقیمانده: ۲۰.۲۰ GB', percent: '۶۰٪',
      expiry: new Date(u.expiryAt).toLocaleDateString('fa-IR'), days: '۴۵ روز', quota: '۵۰.۰۰ GB',
      up: '۵.۵۰ GB', down: '۲۴.۳۰ GB', req: '۱۲۳۴', channel: s.sub.telegramChannel || '', panel: s.panel.name,
      ver: S.d.version || '2.0.0', user: u.name, mode: s.mode, date: new Date().toLocaleDateString('fa-IR'),
      time: new Date().toLocaleTimeString('fa-IR'), ip: s.panel.url || '' };
    const render = (tpl) => { let o = String(tpl || ''); for (const [k, v] of Object.entries(vars)) o = o.split('{' + k + '}').join(v); return o; };
    box.innerHTML = '<div class="fk-help-t" style="margin-bottom:8px">' + icon('fa-eye') + ' پیش‌نمایش خروجی</div>' +
      '<div class="list">' + (act.map((f) => '<div class="row-item"><span class="dot on"></span>' +
        '<div class="grow"><b>' + esc(render(f.name)) + '</b><div class="cell-sub mono">' + esc(f.proto) + '://…</div></div></div>').join('') ||
        '<div class="empty">کانفیگ فعالی نیست</div>') + '</div>';
  }

  function readFakes() {
    const out = [];
    const cur = (S.d.settings && S.d.settings.sub && Array.isArray(S.d.settings.sub.fakes)) ? S.d.settings.sub.fakes : [];
    $$('#fkList .fk-row').forEach((row) => {
      const i = Number(row.dataset.i);
      const sw = row.querySelector('[data-fake-sw]');
      const nm = row.querySelector('[data-fake-name]');
      const pr = row.querySelector('[data-fake-proto]');
      const ps = row.querySelector('[data-fake-pos]');
      out.push({
        id: (cur[i] && cur[i].id) || ('fake_' + Date.now().toString(36) + '_' + i),
        name: nm ? String(nm.value || '') : '',
        enabled: sw ? sw.classList.contains('on') : false,
        proto: (pr && pr.value === 'trojan') ? 'trojan' : 'vless',
        pos: ps ? (Number(ps.value) || 99) : 99,
        pin: !!(cur[i] && cur[i].pin),
      });
    });
    return out;
  }

  /* ═══════════ بخش کانفیگ‌های فیک اختصاصی کاربر ═══════════ */
  function userFakeSection(u) {
    const fakes = Array.isArray(u.fakes) ? u.fakes : [];
    const mode = u.fakeMode || 'inherit';
    return '<div class="um-sec"><div class="um-sec-h">' + icon('fa-list-check') + '<span>کانفیگ‌های فیک اختصاصی</span></div>' +
      '<div class="bd" style="padding:11px 13px">' +

      /* انتخاب حالت */
      '<div class="seg" style="margin-bottom:10px">' +
      [['inherit', 'از پنل'], ['custom', 'اختصاصی'], ['off', 'خاموش']].map(([k, l]) =>
        '<button data-ufake-mode="' + k + '" class="' + (mode === k ? 'on' : '') + '">' + l + '</button>').join('') +
      '</div>' +

      '<div class="hint" style="margin-bottom:8px">' +
      (mode === 'inherit' ? 'این کاربر از کانفیگ‌های فیک عمومی پنل استفاده می‌کند (بخش «لینک ساب»).' :
       mode === 'custom' ? 'فقط کانفیگ‌های زیر برای این کاربر نمایش داده می‌شوند.' :
       'هیچ کانفیگ فکی برای این کاربر ساخته نمی‌شود.') + '</div>' +

      /* لیست (فقط در حالت custom) */
      (mode === 'custom' ? userFakeList(fakes) : '') +
      '</div></div>';
  }

  function userFakeList(fakes) {
    return '<div class="fk-help"><div class="fk-help-t">' + icon('fa-circle-info') + ' متغیرهای مجاز — کلیک کنید تا درج شود</div>' +
      '<div class="chips">' + FAKE_VARS.map(([v, d]) =>
        '<button class="chip fk-var" data-var="' + esc(v) + '" title="' + esc(d) + '"><span class="mono">' + esc(v) + '</span></button>').join('') +
      '</div></div>' +
      '<div class="btn-row" style="margin-bottom:8px">' +
      '<button class="btn sm s" data-act="ufake-add">' + icon('fa-plus') + ' افزودن</button>' +
      '<button class="btn sm" data-act="ufake-reset">' + icon('fa-rotate-left') + ' پیش‌فرض</button></div>' +
      '<div class="fk-list" id="ufkList">' +
      (fakes.map((f, i) => userFakeRow(f, i)).join('') || '<div class="empty">موردی نیست</div>') +
      '</div>';
  }

  function userFakeRow(f, i) {
    const on = !!(f && f.enabled);
    return '<div class="fk-row' + (on ? '' : ' off') + '" data-i="' + i + '">' +
      '<div class="sw' + (on ? ' on' : '') + '" data-ufake-sw="' + i + '"><i></i></div>' +
      '<input class="fk-pos mono" data-ufake-pos="' + i + '" value="' + esc(f.pos || (i + 1)) + '" title="ترتیب" inputmode="numeric">' +
      '<input class="fk-name" data-ufake-name="' + i + '" value="' + esc(f.name || '') + '" placeholder="📊 {usage}">' +
      '<select class="fk-proto" data-ufake-proto="' + i + '">' +
      ['vless', 'trojan'].map((p) => '<option value="' + p + '"' + (f.proto === p ? ' selected' : '') + '>' + p + '</option>').join('') +
      '</select>' +
      '<button class="btn sm d" data-act="ufake-del" data-i="' + i + '" title="حذف">' + icon('fa-trash-can') + '</button>' +
      '</div>';
  }

  function readUserFakes() {
    const out = [];
    if (!$('#ufkList')) return out;
    $$('#ufkList .fk-row').forEach((row) => {
      const i = Number(row.dataset.i);
      const sw = row.querySelector('[data-ufake-sw]');
      const nm = row.querySelector('[data-ufake-name]');
      const pr = row.querySelector('[data-ufake-proto]');
      const ps = row.querySelector('[data-ufake-pos]');
      out.push({
        id: 'uf_' + i + '_' + Date.now().toString(36),
        name: nm ? String(nm.value || '') : '',
        enabled: sw ? sw.classList.contains('on') : false,
        proto: (pr && pr.value === 'trojan') ? 'trojan' : 'vless',
        pos: ps ? (Number(ps.value) || 99) : 99,
      });
    });
    return out;
  }

  function userModal(u, isNew) {
    if (!u) return;
    const v = (p) => {
      if (p === 'expiryDays') return u.expiryAt ? Math.max(0, Math.ceil((u.expiryAt - Date.now()) / 86400000)) : 0;
      const val = getP(u, p);
      if (Array.isArray(val)) return val.join('\n');
      if (val === null || val === undefined) return '';
      return val;
    };
    const F = (f) => field(f, v(f.p));
    const sec = (title, icn, fields, cols) =>
      '<div class="um-sec"><div class="um-sec-h">' + icon(icn) + '<span>' + title + '</span></div>' +
      '<div class="um-grid ' + (cols || '') + '">' + fields.map(F).join('') + '</div></div>';

    modal(
      '<header><span class="ic">' + icon('fa-user') + '</span>' +
      '<div><h3>' + (isNew ? 'کاربر جدید' : 'ویرایش «' + esc(u.name) + '»') + '</h3>' +
      '<p>شناسه، سهمیه و تنظیمات اختصاصی</p></div>' +
      '<div class="acts"><button class="btn sm" data-act="regen" title="ساخت UUID جدید">' + icon('fa-shuffle') + ' UUID</button>' +
      '<button class="btn sm ghost" data-act="close" title="بستن">' + icon('fa-xmark') + '</button></div></header>' +
      '<div class="bd">' +
      sec('اطلاعات پایه', 'fa-user', [
        { p: 'name', l: 'نام کاربر', t: 'text', req: 1 },
        { p: 'note', l: 'یادداشت', t: 'text' },
      ], 'two') +
      sec('شناسه‌های اتصال', 'fa-key', [
        { p: 'uuid', l: 'UUID (VLESS / VMess)', t: 'text', mono: 1 },
        { p: 'secret', l: 'رمز Trojan (خام)', t: 'text', mono: 1, h: 'کلاینت خودش sha224 می‌گیرد' },
      ], 'two') +
      sec('سهمیه و محدودیت', 'fa-database', [
        { p: 'quotaGB', l: 'سهمیه کل (GB)', t: 'num', h: '۰ = نامحدود' },
        { p: 'dailyQuotaMB', l: 'سهمیه روزانه (MB)', t: 'num', h: '۰ = بدون سقف' },
        { p: 'expiryDays', l: 'انقضا (روز)', t: 'num', h: '۰ = نامحدود' },
        /* محدودیت دستگاهی حذف شد — فقط IP واقعی کلاینت شمرده می‌شود */
        { p: 'ipLimit', l: 'سقف IP همزمان', t: 'num', h: '۰ = پیش‌فرض سراسری • بیشینه‌ی IPهای همزمان' },
        { p: 'maxConfigs', l: 'سقف کانفیگ', t: 'num', h: '۰ = پیش‌فرض' },
        { p: 'speedLimit', l: 'سقف سرعت (Mbps)', t: 'num', h: '۰ = نامحدود' },
      ], 'three') +
      sec('نام‌گذاری و تنظیمات اختصاصی', 'fa-gear', [
        { p: 'mode', l: 'حالت پروتکل', t: 'sel', o: ['inherit', 'alpha', 'beta', 'both'], lbls: { inherit: 'از پنل', alpha: 'Alpha — VLESS', beta: 'Beta — Trojan', both: 'Both' } },
        { p: 'fakeMode', l: 'کانفیگ‌های فیک', t: 'sel', o: ['inherit', 'custom', 'off'], lbls: { inherit: 'از پنل', custom: 'اختصاصی', off: 'خاموش' } },
        { p: 'namePrefix', l: 'پیشوند نام کانفیگ', t: 'text', h: 'خالی = پیش‌فرض پنل' },
        { p: 'namePattern', l: 'الگوی نام اختصاصی', t: 'text', mono: 1, h: 'مثل {user}-{port} — خالی یعنی از استراتژی/الگوی پنل • توکن‌ها: {user} {proto} {port} {ip} {node} {index} {prefix} {mark}' },
        { p: 'nameStrategy', l: 'استراتژی نام', t: 'sel', o: ['inherit', 'default', 'user-port', 'type-user-port', 'host-port-user', 'ip'],
          lbls: { inherit: 'از پنل', default: 'پیش‌فرض', 'user-port': 'کاربر-پورت', 'type-user-port': 'پروتکل-کاربر-پورت', 'host-port-user': 'هاست-پورت-کاربر', ip: 'فقط IP' } },
        { p: 'ports', l: 'پورت‌های اختصاصی', t: 'text', mono: 1, h: 'خالی = پورت‌های پنل' },
        { p: 'nat64', l: 'NAT64 اختصاصی', t: 'text', mono: 1 },
        { p: 'panelUrl', l: 'Panel URL اختصاصی', t: 'text', mono: 1 },
      ], 'two') +
      sec('IPها و نودها', 'fa-network-wired', [
        { p: 'cleanIPs', l: 'Clean IPs', t: 'area', dt: 'lines', h: 'هر خط یکی • خالی = لیست پنل' },
        { p: 'proxyIPs', l: 'Proxy IPs', t: 'area', dt: 'lines', h: 'هر خط یکی' },
        { p: 'nodes', l: 'Nodes', t: 'area', dt: 'lines', h: 'هر خط یکی' },
      ], 'three') +

      /* ── ۶. کانفیگ‌های فیک اختصاصی ── */
      userFakeSection(u) +
      '<div class="um-sec"><div class="um-sec-h">' + icon('fa-shield-halved') + '<span>فیلترینگ و وضعیت</span></div>' +
      '<div class="switches two">' +
      field({ p: 'blockAdult', l: 'بلاک محتوای بزرگسال', t: 'sw' }, v('blockAdult')) +
      field({ p: 'blockAds', l: 'بلاک تبلیغات', t: 'sw' }, v('blockAds')) +
      field({ p: 'enabled', l: 'کاربر فعال باشد', t: 'sw' }, v('enabled')) +
      '</div></div>' +
      '<div class="um-stats">' +
      '<div class="um-stat"><span>' + icon('fa-database') + ' مصرف</span><b>' + bytes((u.up || 0) + (u.down || 0)) + '</b></div>' +
      '<div class="um-stat"><span>' + icon('fa-chart-column') + ' درخواست</span><b>' + fa(u.totalReq || 0) + '</b></div>' +
      '<div class="um-stat"><span>' + icon('fa-check') + ' وضعیت</span><b>' + (u.enabled ? 'فعال' : 'غیرفعال') + '</b></div>' +
      '<div class="um-stat"><span>' + icon('fa-activity') + ' آخرین اتصال</span><b>' + ago(u.lastSeen) + '</b></div>' +
      '</div>' +

      /* اتصال‌های فعال */
      (u.activeIPs && u.activeIPs.length ? '<div class="um-sec"><div class="um-sec-h">' + icon('fa-globe') +
        '<span>اتصال‌های فعال — ' + fa(u.activeConns || 0) + ' اتصال از ' + fa(u.activeIPCount || 0) + ' IP</span></div>' +
        '<div class="bd" style="padding:9px 12px"><div class="list">' +
        u.activeIPs.map((s) => '<div class="row-item"><span class="dot on"></span><span class="mono">' + esc(s.ip) + '</span>' +
          (s.conns > 1 ? '<span class="badge warn">' + fa(s.conns) + ' اتصال</span>' : '') +
          '<span class="badge ac" style="margin-inline-start:auto">فعال</span></div>').join('') +
        '</div>' +
        '<div class="hint" style="margin-top:7px">سقف IP همزمان: ' + fa(u.ipLimit || S.d.settings.sec.ipConnLimit || 0) + ' IP' +
        (u.ipLimit || S.d.settings.sec.ipConnLimit ? ' ✓' : ' (بدون سقف — تعداد IP نامحدود است)') + '</div>' +
        '</div></div>' : '') +
      '</div>' +
      '<footer>' +
      '<button class="btn d" data-act="user-del" data-id="' + esc(u.id) + '">' + icon('fa-trash-can') + ' حذف</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn" data-act="user-copy-page" data-id="' + esc(u.id) + '">' + icon('fa-clipboard') + ' کپی لینک</button>' +
      '<button class="btn ghost" data-act="close">انصراف</button>' +
      '<button class="btn p" data-act="user-save" data-id="' + esc(u.id) + '">' + icon('fa-floppy-disk') + ' ذخیره</button>' +
      '</footer>', true);
  }

  function qrModal(link) {
    modal('<header><span class="ic">' + icon('fa-qrcode') + '</span><div><h3>QR</h3><p>اسکن کنید یا لینک را کپی کنید</p></div>' +
      '<div class="acts"><button class="btn sm ghost" data-act="close">' + icon('fa-xmark') + '</button></div></header>' +
      '<div class="bd" style="text-align:center">' +
      '<div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(link) + '" width="240" height="240" alt="QR"></div>' +
      '<p class="mono" style="word-break:break-all;font-size:10.5px;margin:14px 0;direction:ltr;text-align:left">' + esc(link) + '</p>' +
      '<div class="btn-row" style="justify-content:center">' +
      '<button class="btn" data-act="copy" data-v="' + esc(link) + '">' + icon('fa-copy') + ' کپی لینک</button>' +
      '<button class="btn ghost" data-act="close">بستن</button></div></div>');
  }

  /* ─────────── راه‌اندازی ─────────── */
  try { document.documentElement.dataset.theme = localStorage.getItem('sg_theme') || 'dark'; } catch (e) { document.documentElement.dataset.theme = 'dark'; }
  setThemeIcon();
  render();
  window.__sgBooted = true;
  refresh();
  setInterval(() => { if (S.token && (S.view === 'dash' || S.view === 'monitor')) refresh(); }, 20000);
  /* اتصال‌های زنده هر ۱۰ ثانیه به‌روز می‌شود — با بارخوانیِ هدفمند (cnLoad)،
     نه رندرِ کل صفحه، تا جدول نپرد و فیلتر/مکانِ اسکرول از بین نرود. */
  setInterval(() => { if (S.token && S.view === 'conns') cnLoad(); }, 10000);
})();
