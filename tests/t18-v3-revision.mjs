/* ══════════════════════════════════════════════════════════════════════
   t18 — بازنگریِ نسخه‌ی ۳: تغییرهایی که بعد از t16/t17 آمدند

     ۱) رادار از پنلِ مدیریت حذف شد (به صفحه‌ی کاربر رفت).
     ۲) افزودنِ سرور خروجی VLESS یک فیلد شد: فقط لینکِ vless://
        (parseVlessLink در worker.js آن را به فیلدها می‌شکند).
     ۳) نام‌گذاری: «اشتراک» → «لینک ساب».
     ۴) باگِ واقعی: renderName در worker.js و nmRender در ui/app.js باید
        خروجیِ بایت‌به‌بایتِ یکسان بدهند (جدولِ الگوها × مجموعه‌متغیرها).
     ۵) رفت‌وبرگشتِ لینک: parseVlessLink → ذخیره → exitToLink → دوباره
        parseVlessLink باید همان سرور را بدهد.
     ۶) رادارِ مرورگری در ui/user.html (کاملاً سمتِ کلاینت).
     ۷) نسخه ۳٫۰٫۰ / ساخت ۲۰۲۶٫۰۸٫۳۰.
     ۸) USER_PAGE در worker.js همان داشبوردِ کاملِ origin/main است.

   همان الگوی بقیه‌ی مجموعه‌ها: منبع با readFileSync خوانده می‌شود، توابعِ
   داخلیِ worker.js از worker.test.mjs می‌آیند (ساخته‌ی build.mjs) و بخشی
   از ادعاها روی APIِ واقعی با D1 واقعی (SQLite) اجرا می‌شود.
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { makeD1 } from './d1.mjs';
import { makeCtx } from './mocks.mjs';
import * as W from './worker.test.mjs';

const UI = readFileSync(new URL('../ui/app.js', import.meta.url), 'utf8');
const WK = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
const UH = readFileSync(new URL('../ui/user.html', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, note) => {
  if (cond) { pass++; console.log('PASS ', name + (note ? ' — ' + note : '')); }
  else { fail++; console.log('FAIL ', name + (note ? ' — ' + note : '')); }
};
const eq = (name, got, want) => ok(name, got === want,
  'got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
/* یک بازه‌ی مشخص از یک منبع — برای وقتی که یک بلوک بین چند تابع پخش شده */
const slice = (src, from, to) => {
  const i = src.indexOf(from), j = src.indexOf(to);
  return i < 0 || j < 0 ? '' : src.slice(i, j);
};
/* بدنه‌ی یک تابع در یک منبعِ دلخواه */
const fnBody = (src, name) => {
  const i = src.indexOf('function ' + name);
  if (i < 0) return '';
  const j = src.indexOf('\n  function ', i + 10);
  return j < 0 ? src.slice(i) : src.slice(i, j);
};

console.log('── ۱) رادار از پنلِ مدیریت حذف شده ──');

ok('ui/app.js has no radar reference at all', (UI.match(/radar/gi) || []).length === 0,
  'matches: ' + (UI.match(/radar/gi) || []).length);
ok('the admin panel never calls /api/radar/*', !/\/api\/radar\//.test(UI));
ok('no radar state object is left behind', !/const RD = /.test(UI) && !/RD_KEY/.test(UI));
ok('no radar card/handler is left behind',
  !/radarCard|radarHtml|radarScan|radarCfg|radarSave|rdOpt\b/.test(UI));
ok('no apply-clean-IP button is left behind',
  !/radar-apply|radar-scan|radar-clear/.test(UI));
/* اسکنرِ سمتِ ورکر هم حذف شده — اندازه‌گیری فقط در مرورگرِ کاربر انجام می‌شود */
ok('the worker no longer serves any radar endpoint',
  ["route === 'radar/config'", "route === 'radar/scan'", "route === 'radar/apply'"]
    .every((r) => !WK.includes(r)));

console.log('\n── ۲) فرمِ سرور خروجی: یک فیلد (لینکِ vless://) ──');

ok('the exit form has a single #ex_link textarea',
  /<textarea id="ex_link"/.test(UI), (UI.match(/<textarea id="ex_link"[^>]*>/) || [''])[0]);
ok('the form carries a hidden id next to it', /<input type="hidden" id="ex_id"/.test(UI));
ok('no per-field inputs survived (address/port/uuid/name/security/transport/path/sni/host)',
  !/id="ex_(address|port|uuid|name|security|transport|path|serviceName|sni|host|flow)"/.test(UI));

const efrBody = slice(UI, 'const exitFormRead = ', 'const exitFormHtml');
ok('exitFormRead returns exactly { id, link }',
  /=> \(\{ id: xf\('id'\), link: xf\('link'\) \}\)/.test(efrBody) &&
  (efrBody.match(/xf\(/g) || []).length === 2, efrBody.trim());
ok('exitFormRead no longer reads any server field',
  !/address|uuid|security|transport|serviceName|sni\b/.test(efrBody));

const exSaveBody = slice(UI, "a === 'exit-save'", "a === 'exit-del'");
ok('add posts only { op, link }', /\{ op: 'add', link: body\.link \}/.test(exSaveBody));
ok('update posts { op, id, link }', /\{ op: 'update', id: body\.id, link: body\.link \}/.test(exSaveBody));
ok('the save handler goes to /api/exits', /api\('POST',\s*'\/api\/exits',/.test(exSaveBody));
ok('an empty link is rejected before any request',
  /if \(!body\.link\) \{ toast\('لینکِ vless:\/\/ را در فیلد بچسبانید'/.test(exSaveBody));
ok('the exit form is filled from the stored server when editing',
  /const exitRead = \(s\) => \(\{ id: \(s && s\.id\) \|\| '', link: \(s && s\.id\) \? exitToLink\(s\)/.test(UI));

console.log('\n── ۳) تغییرِ نام: «اشتراک» → «لینک ساب» ──');

ok('the sidebar entry is called لینک ساب', /\['sub', 'لینک ساب', 'fa-/.test(UI),
  (UI.match(/\['sub', '[^']+', 'fa-[^']+'\]/) || [''])[0]);
ok('the subscription page heading is لینک ساب', /<h1>لینک ساب<\/h1>/.test(UI));
ok('the old phrasing «صفحه‌ی کاربر (داشبورد + اشتراک)» is gone',
  !UI.includes('صفحه‌ی کاربر (داشبورد + اشتراک)'));
/* توضیحِ Panic mode هم باید نامِ تازه را ببرد (قدیمی‌اش «اشتراک» بود) */
ok('the panic-mode hint uses the new name too',
  /پنل و لینک ساب/.test(UI) && /لینک ساب پشتِ سایت پوششی پنهان می‌شوند/.test(UI));

console.log('\n── ۴) یکسانیِ نام‌گذاری (worker ↔ پنل) ──');

/* nmRender در ui/app.js یک تابعِ داخلیِ بسته است؛ همان متن را با NM_SEP اش
   برمی‌داریم و اجرا می‌کنیم تا دقیقاً همان چیزی سنجیده شود که مرورگر اجرا
   می‌کند (و نه یک بازنویسیِ تست که ممکن است از منبع جدا بیفتد). */
const nmSrc = slice(UI, 'const NM_SEP = ', 'const nmNode = ');
ok('nmRender was found in ui/app.js', /const nmRender = \(pattern, vars\) =>/.test(nmSrc));
const nmRender = new Function(nmSrc + '\nreturn nmRender;')();
const renderName = W.renderName;
ok('renderName is exported by the worker for tests', typeof renderName === 'function');

const FULL = { prefix: 'پنل', user: 'علی', proto: 'VLESS', port: '443',
  ip: '104.17.152.10', node: 'فرانکفورت', index: '1', mark: 'β' };
const VARSETS = [
  { l: 'همه پر', v: FULL },
  { l: 'پیشوند خالی', v: { ...FULL, prefix: '' } },
  { l: 'پیشوند و نود خالی', v: { ...FULL, prefix: '', node: '' } },
  { l: 'نشان و شماره خالی', v: { ...FULL, mark: '', index: '' } },
  { l: 'همه خالی', v: { prefix: '', user: '', proto: '', port: '', ip: '', node: '', index: '', mark: '' } },
];
/* الگوهای خواسته‌شده + همه‌ی الگوهای آماده‌ی ورکر (تا پیش‌نمایش و ساب یکی بمانند) */
const PATTERNS = [
  '{node}-{index}',
  '{prefix} | {node} | :{port} | {mark}',
  '{ip}',
  '{node}:{port}',
  '{node} · {index}',
  '{node} – {port}',
  '{node} — {index}',
  '{prefix}·{node}·{mark}',
  ...W.NAME_PRESETS.map((p) => p.p),
];
ok('the parity table covers the presets too', PATTERNS.length >= 15, String(PATTERNS.length));

for (const pat of PATTERNS) {
  const bad = [];
  for (const vs of VARSETS) {
    const a = renderName(pat, vs.v);
    const b = nmRender(pat, vs.v);
    if (a !== b) bad.push(vs.l + ': worker=' + JSON.stringify(a) + ' panel=' + JSON.stringify(b));
    else if (!Buffer.from(a, 'utf8').equals(Buffer.from(b, 'utf8'))) bad.push(vs.l + ': بایت‌ها فرق دارند');
  }
  ok('worker and panel render "' + pat + '" identically', bad.length === 0, bad.join(' | '));
}

/* همان جایی که باگ بود: پیشوندِ خالی نباید جداکننده‌ی سرگردان بسازد */
const dangling = /^[\s|·\-–—]/;
const emptyPrefixCases = [
  ['{prefix} | {node} | :{port} | {mark}', { ...FULL, prefix: '' }],
  ['{prefix}·{node}', { ...FULL, prefix: '' }],
  ['{prefix} – {node}', { ...FULL, prefix: '' }],
  ['{prefix} — {node}', { ...FULL, prefix: '' }],
];
for (const [pat, vars] of emptyPrefixCases) {
  const out = renderName(pat, vars);
  ok('an empty prefix leaves no dangling separator in "' + pat + '"',
    !dangling.test(out) && out === nmRender(pat, vars), JSON.stringify(out));
}
/* توکن‌های خالی نباید جداکننده‌ای پشتِ سر بگذارند. در الگویِ پیش‌فرض یک «:»
   لفظی (جلوی {port}) هم هست که متنِ قالب است و باید بماند. */
const EMPTY = { prefix: '', user: '', proto: '', port: '', ip: '', node: '', index: '', mark: '' };
eq('all tokens empty → only the literal colon of the default preset is left',
  renderName('{prefix} | {node} | :{port} | {mark}', EMPTY), ':');
eq('and the panel agrees', nmRender('{prefix} | {node} | :{port} | {mark}', EMPTY), ':');
eq('all tokens empty without literal text → empty name',
  renderName('{prefix} | {node} | {port} | {mark}', EMPTY), '');
eq('and the panel agrees there too', nmRender('{prefix} | {node} | {port} | {mark}', EMPTY), '');
eq('an unknown token is dropped', renderName('{node}-{nope}', { node: 'فرانکفورت' }), 'فرانکفورت');
eq('repeated separators collapse to one',
  renderName('{node} || {index}', { node: 'فرانکفورت', index: '2' }), 'فرانکفورت | 2');

/* نگهبانِ کدبندی: جداسازها باید یوتی‌اف-۸ درست باشند، نه mojibakeِ قدیمی */
const rnBody = fnBody(WK, 'renderName');
ok('worker renderName uses the real utf-8 separator class',
  /\[\\s\|·\\-–—\]/.test(rnBody), (rnBody.match(/\[\\s[^\]]*\]/) || [''])[0]);
ok('no mojibake is left in the worker', !/[Ââ]/.test(WK));
ok('no mojibake is left in the panel', !/[Ââ]/.test(UI));
ok('both sides know the three separator characters',
  ['·', '–', '—'].every((c) => rnBody.includes(c) && UI.includes(c)));

console.log('\n── ۵) رفت‌وبرگشتِ لینکِ vless:// ──');

const REAL_LINK = 'vless://7e2c8d71-7164-02eb-7571-24b6fd645220@x4g-production-ad2c.up.railway.app:443' +
  '?encryption=none&security=tls&sni=x4g-production-ad2c.up.railway.app&alpn=http%2F1.1&fp=chrome' +
  '&type=ws&host=x4g-production-ad2c.up.railway.app&path=%2Fws%2F7e2c8d71-7164-02eb-7571-24b6fd645220' +
  '#X4G-لینک-پیش‌فرض';

const p = W.parseVlessLink(REAL_LINK);
ok('a real vless link parses', !!p);
eq('uuid', p.uuid, '7e2c8d71-7164-02eb-7571-24b6fd645220');
eq('address', p.address, 'x4g-production-ad2c.up.railway.app');
eq('port', p.port, 443);
eq('name comes from the #fragment', p.name, 'X4G-لینک-پیش‌فرض');
eq('security', p.security, 'tls');
eq('transport (type=ws)', p.transport, 'ws');
eq('path is decoded', p.path, '/ws/7e2c8d71-7164-02eb-7571-24b6fd645220');
eq('host', p.host, 'x4g-production-ad2c.up.railway.app');
eq('sni', p.sni, 'x4g-production-ad2c.up.railway.app');
eq('unknown key alpn survives in params', p.params.alpn, 'http/1.1');
eq('unknown key fp survives in params', p.params.fp, 'chrome');
eq('encryption lands in params (not a server field)', p.params.encryption, 'none');
ok('no known field leaks into params',
  !Object.keys(p.params).some((k) => W.VLESS_QUERY_MAP[k] && W.EXIT_FIELDS.includes(W.VLESS_QUERY_MAP[k])),
  JSON.stringify(Object.keys(p.params)));

/* پورتِ پیش‌فرض و نامِ پیش‌فرض */
const noPort = W.parseVlessLink('vless://7e2c8d71-7164-02eb-7571-24b6fd645220@de1.example.com?security=tls&type=ws&path=%2F#آلمان');
eq('a link without a port defaults to 443', noPort.port, 443);
const noName = W.parseVlessLink('vless://7e2c8d71-7164-02eb-7571-24b6fd645220@de1.example.com:8443?security=tls&type=ws&path=%2F');
eq('a link without a fragment falls back to the address', noName.name, 'de1.example.com');
eq('a link without a fragment keeps its port', noName.port, 8443);

/* ورودیِ غیرِ vless باید رد شود — نه اینکه یک سرورِ نیمه‌کاره بسازد */
ok('a trojan link is rejected', W.parseVlessLink('trojan://secret@de1.example.com:443#x') === null);
ok('a bare hostname is rejected', W.parseVlessLink('de1.example.com:443') === null);
ok('an empty link is rejected', W.parseVlessLink('') === null);
ok('garbage is rejected', W.parseVlessLink('چیزی که لینک نیست') === null);
ok('the worker has a persian error message for it', /لینک معتبر نیست/.test(W.EXIT_LINK_ERR), W.EXIT_LINK_ERR);

/* سریال‌سازِ پنل باید همان سرور را دوباره بسازد */
const etlSrc = slice(UI, 'const exitToLink = (s) => {', 'const exitBlank = ');
ok('exitToLink was found in ui/app.js', /const exitToLink = \(s\) => \{/.test(etlSrc));
const exitToLink = new Function(etlSrc + '\nreturn exitToLink;')();
const stored = W.normalizeExit(p, 'ex-1');
const again = W.parseVlessLink(exitToLink(stored));
ok('the panel re-serialises the server into a link the worker parses back', !!again, exitToLink(stored));
if (again) {
  eq('round trip: uuid', again.uuid, stored.uuid);
  eq('round trip: address', again.address, stored.address);
  eq('round trip: port', again.port, stored.port);
  eq('round trip: name', again.name, stored.name);
  eq('round trip: security', again.security, stored.security);
  eq('round trip: transport', again.transport, stored.transport);
  eq('round trip: path', again.path, stored.path);
  eq('round trip: host', again.host, stored.host);
  eq('round trip: sni', again.sni, stored.sni);
  eq('round trip: params survive', JSON.stringify(again.params), JSON.stringify(stored.params));
}
/* یک سرورِ grpc هم باید سالم برگردد */
const grpcLink = exitToLink(W.normalizeExit({
  uuid: '7e2c8d71-7164-02eb-7571-24b6fd645220', address: 'grpc.example.com', port: 2096,
  security: 'tls', transport: 'grpc', serviceName: 'GunService', sni: 'grpc.example.com',
  name: 'grpc-آلمان', params: { fp: 'chrome' },
}, 'ex-2'));
const grpc = W.parseVlessLink(grpcLink);
ok('a grpc server round-trips too', !!grpc && grpc.transport === 'grpc' && grpc.serviceName === 'GunService', grpcLink);

console.log('\n── ۵ب) همان مسیر روی APIِ واقعی ──');

const env = { DB: makeD1() };
const HOST = 'panel.example.workers.dev';
const call = async (method, path, body, token) => {
  const h = { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.7.9' };
  if (token) h.authorization = 'Bearer ' + token;
  const res = await W.default.fetch(
    new Request('https://' + HOST + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }),
    env, makeCtx());
  let j = null;
  try { j = await res.json(); } catch (e) { j = {}; }
  return { status: res.status, body: j };
};

const login = await call('POST', '/api/login', { password: 'simorgh' }, null);
ok('login works (needed for the protected route)', !!(login.body && login.body.token));
const TOK = login.body ? login.body.token : '';

const added = await call('POST', '/api/exits', { op: 'add', link: REAL_LINK }, TOK);
eq('POST /api/exits {op:"add", link} is accepted', added.status, 201);
if (added.body && added.body.server) {
  const s = added.body.server;
  eq('stored: address', s.address, 'x4g-production-ad2c.up.railway.app');
  eq('stored: port', s.port, 443);
  eq('stored: name', s.name, 'X4G-لینک-پیش‌فرض');
  eq('stored: transport', s.transport, 'ws');
  eq('stored: security', s.security, 'tls');
  eq('stored: path', s.path, '/ws/7e2c8d71-7164-02eb-7571-24b6fd645220');
  eq('stored: unknown keys are kept', JSON.stringify(s.params), JSON.stringify({ encryption: 'none', alpn: 'http/1.1', fp: 'chrome' }));
}
const badAdd = await call('POST', '/api/exits', { op: 'add', link: 'trojan://x@de1.example.com:443#y' }, TOK);
eq('a non-vless link is rejected by the API', badAdd.status, 400);
eq('and it answers with the persian link error', badAdd.body && badAdd.body.error, W.EXIT_LINK_ERR);

const moved = REAL_LINK.replace(':443?', ':8443?');
const upd = await call('POST', '/api/exits', { op: 'update', id: 'ex-1', link: moved }, TOK);
/* شناسه‌ی واقعی همان چیزی است که سرور ساخت — با مقدارِ برگشتی جایگزین می‌شود */
const realId = (added.body && added.body.server && added.body.server.id) || 'ex-1';
const upd2 = await call('POST', '/api/exits', { op: 'update', id: realId, link: moved }, TOK);
ok('POST /api/exits {op:"update", id, link} is accepted', upd2.status === 200 && upd2.body.ok === true,
  JSON.stringify(upd2.body && upd2.body.error));
eq('the update really changed the port', upd2.body && upd2.body.server && upd2.body.server.port, 8443);
const missing = await call('POST', '/api/exits', { op: 'update', id: 'ex-nope', link: REAL_LINK }, TOK);
eq('updating an unknown id answers 404', missing.status, 404);

console.log('\n── ۶) رادارِ صفحه‌ی کاربر (ui/user.html) ──');

ok('the user page has a #btn-radar action card', /id="btn-radar"/.test(UH));
ok('and a persian label for it', /id="action-radar">رادار/.test(UH));
ok('the radar panel is browser-only (no /api/radar call)', !/\/api\/radar\//.test(UH));
ok('the cloudflare ranges are inlined', /const CF_RANGES = \[\['104\.16\.'/.test(UH));
ok('the ranges cover the well-known blocks',
  ['104.16.', '104.17.', '172.64.', '162.159.', '188.114.', '141.101.'].every((r) => UH.includes("'" + r + "'")));
ok('randCfIp picks from those ranges', /function randCfIp\(\)[\s\S]{0,300}?CF_RANGES\[Math\.floor\(Math\.random\(\) \* CF_RANGES\.length\)\]/.test(UH));
ok('candidates are generated from randCfIp',
  /for \(let i = 0; i < RADAR_IP_COUNT; i\+\+\) ips\.push\(randCfIp\(\)\)/.test(UH));

const pingBody = slice(UH, 'function pingIp(', 'function radarSelectedPorts');
ok('the probe uses new Image() against /cdn-cgi/trace',
  /new Image\(\)/.test(pingBody) &&
  /img\.src = 'https:\/\/' \+ \(port == 443 \? ip : ip \+ ':' \+ port\) \+ '\/cdn-cgi\/trace\?' \+ Math\.random\(\);/.test(pingBody),
  (pingBody.match(/img\.src = [^\n]*/) || [''])[0].trim());
ok('onerror counts as an answer', /img\.onerror = function\(\) \{ clearTimeout\(timer\); fin\(true\); \};/.test(pingBody));
ok('onload counts as an answer', /img\.onload = function\(\) \{ clearTimeout\(timer\); fin\(true\); \};/.test(pingBody));
ok('only the timeout counts as no answer',
  /setTimeout\(function\(\) \{ fin\(false\); \}, timeout\)/.test(pingBody));
eq('three probes per IP', /const RADAR_PROBES = 3;/.test(UH), true);
eq('concurrency is 12', /const RADAR_CONCURRENCY = 12;/.test(UH), true);
eq('the per-probe timeout is 2000 ms', /const RADAR_TIMEOUT = 2000;/.test(UH), true);

ok('the port chips are rendered',
  (UH.match(/class="radar-port-chip(?: active)?" data-port="\d+"/g) || []).length >= 6,
  String((UH.match(/data-port="\d+"/g) || []).length));
ok('the chips cover 443, 8443, 2053, 2083, 2087, 2096',
  [443, 8443, 2053, 2083, 2087, 2096].every((n) => UH.includes('data-port="' + n + '"')));
ok('a chip can be toggled on and off',
  /chip\.addEventListener\('click'[\s\S]{0,200}?this\.classList\.toggle\('active'\)/.test(UH));
ok('only the active chips are scanned',
  /#radar-ports \.radar-port-chip\.active/.test(UH) && /getAttribute\('data-port'\)/.test(UH));

ok('the results table has the # column', /<th>#<\/th>/.test(UH));
ok('the results table has the IP column', /<th>IP<\/th>/.test(UH));
ok('the results table has latency/jitter/loss columns',
  /id="radar-th-ping">تأخیر/.test(UH) && /id="radar-th-jitter">جیتر/.test(UH) && /id="radar-th-loss">لاس٪/.test(UH));
ok('the best row is highlighted',
  /if \(idx === 0\) tr\.className = 'radar-row-best';/.test(UH));
ok('results are sorted best first', /results\.sort\(function\(a, b\) \{ return a\.score - b\.score; \}\)/.test(UH));
ok('the best IP rebuilds a vless:// config',
  /const newLink = 'vless:\/\/' \+ uuid \+ '@' \+ best\.ip \+ ':' \+ best\.port \+ '\?' \+ query \+ '#' \+ encodeURIComponent/.test(UH));
ok('the rebuilt config is offered for copying', /id="radar-best-link"/.test(UH) && /id="radar-copy-btn"/.test(UH));
ok('a scan can be cancelled mid-flight', /radarCancelRequested/.test(UH) && /radarStop/.test(UH));
ok('the scan reports progress in persian', /radarStatusScan/.test(UH) && /radarStatusDone/.test(UH));

console.log('\n── ۷) نسخه ──');

const versionOf = (name) => {
  const m = new RegExp("const " + name + " = '([^']+)';").exec(WK);
  return m ? m[1] : '';
};
eq('VERSION is 3.0.0', versionOf('VERSION'), '3.0.0');
eq('BUILD is 2026.08.30', versionOf('BUILD'), '2026.08.30');

console.log('\n── ۸) USER_PAGE همان داشبوردِ کامل است ──');

/* لفظِ USER_PAGE یک قالبِ طولانی است؛ از «const USER_PAGE = `» تا نخستین
   بک‌تیکِ خاتمه (که با \ گریز نگرفته باشد) برداشته می‌شود. */
const userPageOf = (src) => {
  const head = 'const USER_PAGE = `';
  const i = src.indexOf(head);
  if (i < 0) return null;
  const start = i + head.length;
  let j = start;
  for (;;) {
    j = src.indexOf('`', j);
    if (j < 0) return null;
    if (src[j - 1] !== '\\') break;
    j++;
  }
  return src.slice(start, j);
};
const pageNow = userPageOf(WK);
ok('the worker embeds a USER_PAGE fallback', !!pageNow, pageNow ? pageNow.length + ' chars' : '');
const mainSrc = execFileSync('git', ['show', 'origin/main:worker.js'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
const pageMain = userPageOf(mainSrc);
ok('origin/main also has a USER_PAGE fallback', !!pageMain, pageMain ? pageMain.length + ' chars' : '');
ok('the fallback is byte-identical to origin/main',
  !!pageNow && !!pageMain && Buffer.from(pageNow, 'utf8').equals(Buffer.from(pageMain, 'utf8')),
  pageNow && pageMain ? (pageNow.length + ' vs ' + pageMain.length + ' chars') : 'missing');
ok('it is the whole dashboard, not a stub',
  !!pageNow && pageNow.length > 40000 && /<\!DOCTYPE html>/.test(pageNow) && /radar|رادار/.test(pageNow),
  pageNow ? String(pageNow.length) : '');

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('T18 V3-REVISION TESTS FAILED'); process.exit(1); }
console.log('ALL V3-REVISION TESTS PASSED');
process.exit(0);
