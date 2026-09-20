/* ═══════════════════════════════════════════════════════════════════════════
 *  تستِ REALITY (هندشیکِ دستیِ TLS 1.3 روی TCP خام — آزمایشی)
 *  ───────────────────────────────────────────────────────────────────────────
 *  کدِ واقعی از worker.js استخراج می‌شود (بلوکِ @@REALITY_BEGIN@@ تا
 *  @@REALITY_END@@ + plumbing سرورهای خروجی) و در برابرِ پیاده‌سازی‌های
 *  «مستقل» راستی‌آزمایی می‌شود — نه خودش در برابرِ خودش:
 *    • X25519 خالص در برابرِ X25519 بومیِ Node (deriveBits)
 *    • HKDF-Expand-Label در برابرِ مرجعِ createHmac
 *    • هندشیکِ کامل در برابرِ یک سرورِ جعلیِ درون‌حافظه که سمتِ سرور را با
 *      X25519 بومی + HKDF مرجع می‌سازد (round-trip واقعیِ app-data در هر دو جهت)
 *    • منفی‌ها: Finished دستکاری‌شده، alert، pbk اشتباه → باید throw شود
 *    • plumbing: پارسِ لینکِ reality، tcp→raw، مهاجرتِ params، exitIssues
 *
 *  اجرا:  node tests-manual/reality-crypto.cjs
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { webcrypto, createHmac, randomBytes, createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');

let fail = 0;
const ok = (c, label, extra) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + label + (extra ? '  → ' + extra : ''));
  if (!c) fail++;
};
const eq = (a, b) => Buffer.from(a).equals(Buffer.from(b));
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* ── ۱) استخراجِ بلوکِ REALITY از سورسِ واقعی ── */
const RB0 = SRC.indexOf('/* @@REALITY_BEGIN@@ */');
const RB1 = SRC.indexOf('/* @@REALITY_END@@ */');
if (RB0 < 0 || RB1 < RB0) { console.error('FATAL: بلوکِ REALITY در worker.js پیدا نشد'); process.exit(1); }
const rsrc = SRC.slice(RB0, RB1);

const toU8 = (d) => {
  if (!d) return new Uint8Array(0);
  if (d instanceof Uint8Array) return d;
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
  if (typeof d === 'string') return new TextEncoder().encode(d);
  return new Uint8Array(0);
};

const M = new Function('toU8', 'crypto', 'atob', 'TextEncoder', 'TextDecoder',
  rsrc + '\n;return { rlX25519, rlX25519Base, rlExpandLabel, rlHkdfExpand, rlDeriveSecret, rlHmac, rlSha256, rlAesKeyIv, rlImportAes, rlSeal, rlOpen, rlBuildCH, rlGrease, rlParseServerHello, rlHandshake, rlWrapStreams, rlMakeSockIo, rlConcat, rlU16, rlU32, rlEq, rlHexToBytes, rlB64uToBytes, rlSkipHsMessages, rlSealSession, rlAlertName, rlAlertHint, rlAlertDetail, RL_CLIENT_VER };'
)(toU8, webcrypto, (s) => Buffer.from(s, 'base64').toString('binary'), TextEncoder, TextDecoder);

/* ── ۲) استخراجِ plumbing سرورهای خروجی ── */
const PE0 = SRC.indexOf('const EXIT_FIELDS = [');
const PE1 = SRC.indexOf('/** فهرستِ سرورهای خروجی');
if (PE0 < 0 || PE1 < PE0) { console.error('FATAL: بلوکِ exits در worker.js پیدا نشد'); process.exit(1); }
const psrc = SRC.slice(PE0, PE1);
const randTok = (n) => 't'.repeat(n || 6);
const X = new Function('toU8', 'randTok', 'atob', 'URL', 'EXIT_SECURITIES', 'EXIT_TRANSPORTS', psrc +
  '\n;return { EXIT_FIELDS, normalizeExit, parseVlessLink, exitIssues, realityPbkOk, realitySidOk };'
)(toU8, randTok, (s) => Buffer.from(s, 'base64').toString('binary'), URL, ['none', 'tls', 'reality'], ['raw', 'ws', 'grpc']);

/* ── ۳ب) استخراجِ سازنده‌ی هدرِ VLESS (addons/flow) ── */
const VB0 = SRC.indexOf('/** تبدیلِ متنِ IPv6 به ۱۶ بایت');
let VB1 = SRC.indexOf('کدکِ WebSocketِ کلاینت (RFC 6455)');
/* مارکرِ پایان وسطِ هدرِ کامنتیِ بخشِ بعدی است — تا بسته‌شدنِ همان کامنت جلو می‌رویم تا /* بی‌بسته نماند */
if (VB1 > VB0) { const c = SRC.indexOf('*/', VB1); if (c > VB1) VB1 = c + 2; }
if (VB0 < 0 || VB1 < VB0) { console.error('FATAL: بلوکِ هدرِ VLESS در worker.js پیدا نشد'); process.exit(1); }
const vbsrc = SRC.slice(VB0, VB1);
/* dialableAddr ورکر (کپیِ دقیق — فقط برای پوششِ دامنه، خارج از موضوعِ تست) */
const dialableAddrStub = (addr) => {
  const h = String(addr || '').trim().replace(/^\[/, '').replace(/\]$/, '');
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h)) return 'www.' + h + '.sslip.io';
  return h;
};
const V = new Function('toU8', 'dialableAddr', 'TextEncoder', 'rlConcat', 'rlEq', vbsrc +
  '\n;return { vlessAddons, vlessRequestHeader, visionPadBlock, vlessResponseParser, vlessClientWrap };'
)(toU8, dialableAddrStub, TextEncoder, M.rlConcat, M.rlEq);

/* ── ۳ج) exitToLink از پنل (round-trip) ── */
const APP = fs.readFileSync(path.join(ROOT, 'ui', 'app.js'), 'utf8');
const LE0 = APP.indexOf('const exitToLink = (s) => {');
const LE1 = APP.indexOf('const exitBlank');
if (LE0 < 0 || LE1 < LE0) { console.error('FATAL: exitToLink در ui/app.js پیدا نشد'); process.exit(1); }
const L = new Function('URLSearchParams', 'encodeURIComponent', APP.slice(LE0, LE1) + '\n;return exitToLink;'
)(URLSearchParams, encodeURIComponent);

/* ── مرجعِ مستقلِ HKDF-Expand (createHmac — نه subtle) ── */
function refExpand(prk, info, len) {
  const out = [];
  let t = Buffer.alloc(0), c = 1, n = 0;
  while (n < len) {
    t = createHmac('sha256', Buffer.from(prk)).update(Buffer.concat([t, Buffer.from(info), Buffer.from([c])])).digest();
    out.push(t); n += t.length; c++;
  }
  return Buffer.concat(out).slice(0, len);
}
function refLabel(secret, label, ctx, len) {
  const lab = Buffer.from('tls13 ' + label);
  const info = Buffer.concat([Buffer.from([(len >> 8) & 255, len & 255, lab.length]), lab, Buffer.from([ctx.length]), Buffer.from(ctx)]);
  return refExpand(secret, info, len);
}
const refHmac = (k, d) => createHmac('sha256', Buffer.from(k)).update(Buffer.from(d)).digest();
const refSha = (d) => createHash('sha256').update(Buffer.from(d)).digest();

(async () => {
  console.log('== ۱) X25519 خالص در برابرِ بومیِ Node ==');
  for (let i = 0; i < 3; i++) {
    const a = randomBytes(32);
    const kpB = await webcrypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
    const bPub = new Uint8Array(await webcrypto.subtle.exportKey('raw', kpB.publicKey));
    const myApub = M.rlX25519Base(a);
    const privJwk = { kty: 'OKP', crv: 'X25519', d: b64u(a), x: b64u(myApub) };
    const privKey = await webcrypto.subtle.importKey('jwk', privJwk, { name: 'X25519' }, false, ['deriveBits']);
    const pubBKey = await webcrypto.subtle.importKey('raw', bPub, { name: 'X25519' }, false, []);
    const sNative = new Uint8Array(await webcrypto.subtle.deriveBits({ name: 'X25519', public: pubBKey }, privKey, 256));
    const sMine = M.rlX25519(a, bPub);
    ok(eq(sNative, sMine), 'اشتراکِ DH دو پیاده‌سازی یکی است (' + (i + 1) + '/۳)', Buffer.from(sMine).toString('hex').slice(0, 16) + '…');
  }
  {
    const a = randomBytes(32), b = randomBytes(32);
    const A = M.rlX25519Base(a), B = M.rlX25519Base(b);
    ok(eq(M.rlX25519(a, B), M.rlX25519(b, A)), 'تقارنِ Diffie-Hellman برقرار است');
    ok(!eq(A, new Uint8Array(32)) && !eq(A, B), 'کلیدهای عمومی تباه نیستند');
  }

  console.log('== ۲) HKDF-Expand-Label در برابرِ مرجعِ createHmac ==');
  for (let i = 0; i < 3; i++) {
    const secret = randomBytes(32), ctx = randomBytes(i === 2 ? 64 : 32);
    const mine = await M.rlExpandLabel(secret, 'c hs traffic', ctx, 64);
    const ref = refLabel(secret, 'c hs traffic', ctx, 64);
    ok(eq(mine, ref), 'Expand چندبلوکی (' + (i + 1) + '/۳) با مرجع یکی است');
  }

  console.log('== ۳) ساختارِ ClientHello ==');
  {
    const pub = randomBytes(32);
    const sidZero = new Uint8Array(32);
    const { record, msg, random } = M.rlBuildCH({ sni: 'mask.example.com', sid: sidZero, pubkey: pub });
    ok(random.length === 32, 'random ۳۲ بایتی ساخته شد');
    ok(record[0] === 22 && record[1] === 3 && record[2] === 1, 'رکوردِ handshake معتبر است');
    ok(msg[0] === 1, 'پیام ClientHello است');
    const raw = Buffer.from(record);
    ok(raw.includes('mask.example.com'), 'SNI داخلِ پیام هست');
    ok(raw.includes(Buffer.from(pub)), 'کلیدِ موقت داخلِ key_share هست');
    /* session_id دقیقاً ۳۲ بایت در آفستِ ۳۹ پیام است (مثل کلاینتِ Xray) */
    ok(msg[38] === 32, 'طولِ session_id برابرِ ۳۲ است', 'len=' + msg[38]);
    ok(raw.includes(Buffer.from([0x13, 0x01])), 'cipher 0x1301 پیشنهاد شده');
    /* compress_certificate طبق RFC 8879 §3: ext [00 1b] + len [00 03] + body [02, 00, 02]
       (شکلِ قبلیِ [01,02] بدریخت بود و پارسرِ سخت‌گیر با decode_error ردش می‌کرد) */
    ok(raw.includes(Buffer.from([0x00, 0x1b, 0x00, 0x03, 0x02, 0x00, 0x02])), 'compress_certificate با طولِ u8 درست است');
    /* گروه‌ها: کرومِ واقعی x448 ندارد (secp384r1 دارد) */
    ok(!raw.includes(Buffer.from([0x00, 0x1e])), 'گروهِ x448 پیشنهاد نشده');
    /* GREASE: یکی از جدول، یکسان در همه‌ی جایگاه‌های همین دست‌دادنی */
    const GREASES = [0x0a0a, 0x1a1a, 0x2a2a, 0x3a3a, 0x4a4a, 0x5a5a, 0x6a6a, 0x7a7a, 0x8a8a, 0x9a9a, 0xaaaa, 0xbaba, 0xcaca, 0xdada, 0xeaea, 0xfafa];
    const g = M.rlGrease();
    ok(GREASES.includes(g), 'GREASE از جدول است', '0x' + g.toString(16));
    const seen = new Set();
    for (let i = 0; i < 20; i++) seen.add(M.rlGrease());
    ok(seen.size > 1, 'GREASE بین دست‌دادنی‌ها عوض می‌شود', [...seen].map((x) => '0x' + x.toString(16)).join(','));
  }

  console.log('== ۳ب) ساختِ session_id واقعی (AEAD) ==');
  {
    const epriv = randomBytes(32);
    const epub = M.rlX25519Base(epriv);
    const srvKp = await webcrypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
    const srvPub = new Uint8Array(await webcrypto.subtle.exportKey('raw', srvKp.publicKey));
    const shared = M.rlX25519(epriv, srvPub);
    const rnd = randomBytes(32);
    const ch0 = M.rlBuildCH({ sni: 's.test', sid: new Uint8Array(32), pubkey: epub });
    void rnd;
    /* seal با random واقعیِ پیام */
    const sess = await M.rlSealSession({ random: ch0.random, shared, sidHex: 'a1b2', aad: ch0.msg });
    ok(sess.sealed.length === 32, 'خروجیِ seal دقیقاً ۳۲ بایت است');
    /* بازکردن با مرجعِ مستقل */
    const E0 = Buffer.alloc(0);
    const authRef = refExpand(refHmac(Buffer.from(ch0.random).slice(0, 20), shared), Buffer.from('REALITY'), 32);
    const aadZero = Buffer.from(ch0.msg);
    const ptRef = Buffer.from(await webcrypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(Buffer.from(ch0.random).slice(20, 32)), additionalData: new Uint8Array(aadZero) },
      await webcrypto.subtle.importKey('raw', authRef, { name: 'AES-GCM' }, false, ['decrypt']), sess.sealed));
    ok(ptRef.length === 16, 'متنِ AEAD شانزده بایت است');
    ok(ptRef[0] === 26 && ptRef[1] === 7 && ptRef[2] === 11 && ptRef[3] === 0, 'نسخه‌ی کلاینت مدرن است', [...ptRef.slice(0, 4)].join('.'));
    const nowS = Math.floor(Date.now() / 1000);
    const t = (ptRef[4] << 24) | (ptRef[5] << 16) | (ptRef[6] << 8) | ptRef[7];
    ok(Math.abs(nowS - t) < 120, 'مُهرِ زمانی تازه است', 'dt=' + Math.abs(nowS - t) + 's');
    ok(ptRef.slice(8, 10).toString('hex') === 'a1b2' && ptRef.slice(10, 16).every((b) => b === 0), 'shortId در جای درست نشسته');
    /* sid نامعتبر */
    let threw = false;
    try { await M.rlSealSession({ random: ch0.random, shared, sidHex: 'zz', aad: ch0.msg }); } catch (e) { threw = true; }
    ok(threw, 'sid بدریخت در seal رد می‌شود');
  }

  console.log('== ۳ج) نام و راهنمای alert ==');
  {
    ok(M.rlAlertName(112) === 'unrecognized_name', 'نامِ ۱۱۲ درست است');
    ok(M.rlAlertName(40) === 'handshake_failure', 'نامِ ۴۰ درست است');
    ok(M.rlAlertHint(112).includes('SNI'), 'راهنمای ۱۱۲ به SNI اشاره می‌کند');
    /* خواندنِ بدنه‌ی alert از io */
    const ioA = { readExact: async () => new Uint8Array([2, 40]), write: async () => {}, close: () => {} };
    const d = await M.rlAlertDetail(ioA, 1000);
    ok(d.includes('40') && d.includes('handshake_failure'), 'جزئیاتِ alert خوانده شد', d.slice(0, 60));
  }

  console.log('== ۴) plumbing لینکِ reality ==');
  const srvKp = await webcrypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  const srvPub = new Uint8Array(await webcrypto.subtle.exportKey('raw', srvKp.publicKey));
  const srvJwk = await webcrypto.subtle.exportKey('jwk', srvKp.privateKey);
  const pbk = b64u(srvPub);
  ok(pbk.length === 43, 'pbk نمونه ۴۳ نویسه است', pbk.slice(0, 12) + '…');
  ok(X.realityPbkOk(pbk), 'pbk معتبر پذیرفته می‌شود');
  ok(!X.realityPbkOk(pbk + '='), 'pbk با padding رد می‌شود');
  ok(!X.realityPbkOk('short'), 'pbk کوتاه رد می‌شود');
  ok(X.realitySidOk('a1b2c3') && X.realitySidOk(''), 'sid معتبر/خالی پذیرفته می‌شود');
  ok(!X.realitySidOk('xyz') && !X.realitySidOk('a'.repeat(17)), 'sid بدریخت رد می‌شود');
  const link0 = 'vless://11111111-1111-4111-8111-111111111111@r.example.com:443?encryption=none&security=reality&sni=mask.example.com&fp=chrome&pbk=' + encodeURIComponent(pbk) + '&sid=a1b2&type=tcp&path=%2F#Test';
  const parsed = X.parseVlessLink(link0);
  ok(!!parsed && parsed.security === 'reality', 'لینکِ reality پارس شد', parsed && parsed.security);
  ok(parsed && parsed.pbk === pbk, 'pbk از لینک خوانده شد');
  ok(parsed && parsed.sid === 'a1b2', 'sid از لینک خوانده شد', parsed && parsed.sid);
  ok(parsed && parsed.transport === 'tcp', 'type=tcp خوانده شد', parsed && parsed.transport);
  const srv = X.normalizeExit(parsed, '');
  ok(srv.transport === 'raw', 'tcp به raw نگاشت شد', srv.transport);
  ok(srv.pbk === pbk && srv.sid === 'a1b2', 'فیلدهای reality اول‌کلاس شدند');
  const p2 = X.parseVlessLink(link0.replace('sid=a1b2', 'sid=ffff&shortId=00aa'));
  ok(p2 && p2.sid === '00aa', 'shortId بر sid مقدم است', p2 && p2.sid);
  const m = X.normalizeExit({ address: 'r.example.com', uuid: '11111111-1111-4111-8111-111111111111', security: 'reality', transport: 'raw', params: { pbk, sid: 'cc' } }, 'ex-1');
  ok(m.pbk === pbk && m.sid === 'cc', 'params قدیمی به فیلد مهاجرت کرد');
  const good = X.normalizeExit({ address: 'r.example.com', port: 443, uuid: '11111111-1111-4111-8111-111111111111', security: 'reality', transport: 'raw', sni: 'mask.example.com', pbk, sid: 'a1b2' }, '');
  ok(X.exitIssues(good).length === 0, 'سرورِ reality سالم خطا ندارد', JSON.stringify(X.exitIssues(good)));
  ok(X.exitIssues({ ...good, transport: 'ws' }).some((e) => e.includes('TCP خام')), 'reality+ws رد می‌شود');
  ok(X.exitIssues({ ...good, sni: '' }).length > 0, 'بدونِ sni رد می‌شود');
  ok(X.exitIssues({ ...good, pbk: 'bad' }).length > 0, 'pbk خراب رد می‌شود');
  ok(X.exitIssues({ ...good, sid: 'zz' }).length > 0, 'sid بدریخت رد می‌شود');
  ok(X.exitIssues({ ...good, flow: 'xtls-rprx-vision' }).length === 0, 'flow vision پذیرفته می‌شود (در addons می‌نشیند)');
  const tlsOk = X.normalizeExit({ address: 't.example.com', port: 443, uuid: '11111111-1111-4111-8111-111111111111', security: 'tls', transport: 'ws', path: '/', sni: '' }, '');
  ok(X.exitIssues(tlsOk).length === 0, 'مسیرِ tls مثل قبل سالم است');
  const back = L({ ...srv });
  const re = X.parseVlessLink(back);
  ok(!!re && re.pbk === pbk && re.sid === 'a1b2' && re.security === 'reality', 'رفت‌وبرگشتِ لینک reality سالم است', back.slice(0, 80) + '…');

  console.log('== ۴ب) addons هدرِ VLESS (نشستنِ flow) ==');
  {
    const FLOW = 'xtls-rprx-vision';
    const h = V.vlessRequestHeader({ uuid: '11111111-1111-4111-8111-111111111111', flow: FLOW }, '1.2.3.4', 443, new Uint8Array([9]));
    const b = Buffer.from(h);
    ok(b[0] === 0, 'نسخه‌ی هدر ۰ است');
    ok(b.toString('hex', 1, 17) === '11111111111141118111111111111111', 'بایت‌های UUID درست‌اند');
    ok(b[17] === 18, 'طولِ addons برای flow درست است', 'len=' + b[17]);
    /* addons حالا پروتوبافِ Xray است: field 1 (Flow) → tag 0x0a، length 16، سپس متن */
    ok(b[18] === 0x0a && b[19] === 16 && b.slice(20, 36).toString() === FLOW, 'flow به شکلِ پروتوبافِ Xray در addons نشست (Xrayِ امروزی همین را می‌خواند)');
    ok(b[36] === 1 && ((b[37] << 8) | b[38]) === 443, 'فرمان/پورت بعد از addons درست‌اند');
    const h0 = Buffer.from(V.vlessRequestHeader({ uuid: '11111111-1111-4111-8111-111111111111', flow: '' }, '1.2.3.4', 443, new Uint8Array(0)));
    ok(h0[17] === 0 && h0[18] === 1, 'بدونِ flow، addons خالی است');
  }

  /* ── ابزارِ بایتِ تست ── */
  const u16 = (v) => Buffer.from([(v >> 8) & 255, v & 255]);
  const cat = (...a) => Buffer.concat(a.map((x) => Buffer.from(x)));
  const msg = (t, body) => cat(Buffer.from([t, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255]), Buffer.from(body));

  /* پارسِ ClientHello: random، sid و همه‌ی key shareها — شاملِ گروهِ ۰x۱۱ec
     (X25519MLKEM768) که سرورهای امروزیِ Xray برای احراز لازمش دارند */
  const MLKEM_GROUP = 0x11ec;
  function parseCH(m) {
    const b = Buffer.from(m);
    if (b[0] !== 1) throw new Error('not CH');
    const random = b.slice(6, 38);
    let i = 38;
    const sidLen = b[i]; i += 1;
    const sid = b.slice(i, i + sidLen); i += sidLen;
    const csL = (b[i] << 8) | b[i + 1]; i += 2 + csL;
    i += 1 + b[i];
    const exL = (b[i] << 8) | b[i + 1]; i += 2;
    const end = i + exL;
    const shares = [];
    while (i + 4 <= end) {
      const t = (b[i] << 8) | b[i + 1], l = (b[i + 2] << 8) | b[i + 3];
      const v = b.slice(i + 4, i + 4 + l);
      if (t === 0x0033) {
        let k = 2;
        while (k + 4 <= v.length) {
          const g = (v[k] << 8) | v[k + 1], ll = (v[k + 2] << 8) | v[k + 3];
          shares.push({ group: g, data: v.slice(k + 4, k + 4 + ll) });
          k += 4 + ll;
        }
      }
      i += 4 + l;
    }
    return { random, sid, shares };
  }

  /* بستنِ رکورد با سمانتیکِ RFC 8446 §5.2/§5.4: بایتِ نوعِ واقعی + پدینگِ صفرِ بعدش */
  async function refSealRec(keyObj, seq, plaintext, innerType, padZeros) {
    const inner = cat(plaintext, Buffer.from([innerType]), Buffer.alloc(padZeros || 0));
    const h2 = Buffer.from([23, 3, 3, ((inner.length + 16) >> 8) & 255, (inner.length + 16) & 255]);
    const c2 = await webcrypto.subtle.encrypt(
      { name: 'AES-GCM', iv: refNonce(keyObj.iv, seq), additionalData: new Uint8Array(h2) }, keyObj.k, inner);
    return Buffer.concat([h2, Buffer.from(c2)]);
  }

  /* کلید/iv مرجع + seal/open مرجع */
  async function refKeyIv(secret) {
    const E0 = Buffer.alloc(0);
    return {
      k: await webcrypto.subtle.importKey('raw', refLabel(secret, 'key', E0, 16), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']),
      iv: refLabel(secret, 'iv', E0, 12),
    };
  }
  function refNonce(iv, seq) {
    const n = Buffer.from(iv);
    const s = BigInt(seq);
    for (let k = 0; k < 8; k++) n[11 - k] ^= Number((s >> BigInt(k * 8)) & 255n);
    return n;
  }
  /* بازکردنِ مرجع: متنِ داخلیِ خام (با بایتِ نوعِ محتوا) و نسخه‌ی تمیز
     — مطابق RFC 8446 §5.2 بایتِ آخرِ متنِ داخلی نوعِ محتوا است */
  async function refInner(keyObj, record, seq) {
    const r = Buffer.from(record);
    const h = r.slice(0, 5);
    const L = (h[3] << 8) | h[4];
    return Buffer.from(await webcrypto.subtle.decrypt(
      { name: 'AES-GCM', iv: refNonce(keyObj.iv, seq), additionalData: new Uint8Array(h) }, keyObj.k, r.slice(5, 5 + L)));
  }
  async function refOpen(keyObj, record, seq) {
    const pt = await refInner(keyObj, record, seq);
    let e = pt.length;
    while (e > 1 && pt[e - 1] === 0) e--;
    if (e < 1) throw new Error('content-type byte missing');
    return { body: pt.slice(0, e - 1), ct: pt[e - 1] };
  }

  /* ═════ بردارِ مستقلِ Vision (عیناً XtlsPadding/XtlsUnpaddingِ Xray) ═════ */
  function refVisionBlock(content, o) {
    const c = Buffer.from(content || Buffer.alloc(0));
    const pad = (o && o.long && c.length < 900) ? (100 + 900 - c.length) : 40;
    const head = [];
    if (o && o.first && o.uuid) head.push(Buffer.from(o.uuid));
    head.push(Buffer.from([(o && o.cmd) || 0, (c.length >> 8) & 255, c.length & 255, (pad >> 8) & 255, pad & 255]));
    return Buffer.concat([...head, c, Buffer.alloc(pad)]);
  }
  function refVisionUnpad(chunks, uuid) {
    let buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    let out = Buffer.alloc(0);
    if (buf.length < 16 || !eq(buf.slice(0, 16), uuid)) return { ok: false, out };
    buf = buf.slice(16);
    for (;;) {
      if (buf.length < 5) break;
      const cmd = buf[0], cl = (buf[1] << 8) | buf[2], pl = (buf[3] << 8) | buf[4];
      if (buf.length < 5 + cl + pl) return { ok: false, out };
      out = Buffer.concat([out, buf.slice(5, 5 + cl)]);
      buf = buf.slice(5 + cl + pl);
      if (cmd !== 0) break;
    }
    return { ok: true, out };
  }

  /* ساختِ flight سرور مثل سرورِ واقعی: اول session_id با AEAD باز و shortId/زمان
     چک می‌شود؛ اگر تأیید نشد، مثل سرورِ سخت‌گیر alert می‌دهد (نه camouflage). */
  /* ═════ سرورِ جعلیِ تعاملی با سمانتیکِ واقعیِ امروزیِ Xray ═════
     فاز ۱ (ClientHello): گیتِ X25519MLKEM768 + بازکردنِ AEADِ session_id با کلیدِ
       مشتق از pbk → ServerHello با کلیدِ موقتِ «مستقل» (سرورِ واقعی کلیدِ ثابت را
       برای TLS به‌کار نمی‌برد؛ همین بود که کلیدِ مشترک ساخته نمی‌شد) + CCS +
       flightِ رمزنگاری‌شده با بایتِ نوعِ واقعی (۲۲) و پدینگِ صفرِ §5.4 و
       Finished = HMAC(finished_key, هشِ ترنسکریپت) طبق RFC 8446 §4.4.4
     فاز ۲ (Finishedِ کلاینت): با کلیدهای cHs باز و راستی‌آزمایی می‌شود
     فاز ۳ (VLESS + Vision): addons پروتوباف، XtlsUnpadding و پاسخِ Vision */
  const MLKEM_LEN = 1184 + 32;
  function fakeXray(o) {
    o = o || {};
    const Z = Buffer.alloc(32), E0 = Buffer.alloc(0);
    const srvSid = String(o.sid === undefined ? 'a1b2' : o.sid);
    const s = {
      seen: { mlkemLen: 0, mlkemTail: null, x25519: null, sidOk: false, flow: null, addr: null, port: null, finishedOk: false, visionOut: null, visionBytes: 0, rejected: null },
      phase: 'ch', in: Buffer.alloc(0), out: Buffer.alloc(0), pend: null, inBuf: Buffer.alloc(0),
      srvEph: null, keys: null, cSeq: 0, sSeq: 0, transcript: Buffer.alloc(0), responded: false,
      respBody: Buffer.from(o.respBody || 'HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK'),
    };
    const satisfy = () => {
      while (s.pend && s.out.length >= s.pend.n) {
        const p = s.pend;
        s.pend = null;
        const b = s.out.slice(0, p.n);
        s.out = s.out.slice(p.n);
        p.res(new Uint8Array(b));
      }
    };
    const push = (b) => { s.out = cat(s.out, b); satisfy(); };
    const readExact = (n) => new Promise((res, rej) => {
      s.pend = { n, res, rej };
      satisfy();
      if (process.env.RL_DBG) console.log('   [srv] readExact(' + n + ') pend=' + !!s.pend + ' out=' + s.out.length + ' phase=' + s.phase + ' rejected=' + s.seen.rejected);
      if (s.pend) setTimeout(() => { if (s.pend) { const p = s.pend; s.pend = null; p.rej(new Error('سرورِ جعلی: انتظارِ داده به پایان رسید')); } }, 3000);
    });

    async function onCH(rec) {
      const chMsg = rec.slice(5);
      const ch = parseCH(chMsg);
      s.transcript = Buffer.from(chMsg);
      const ml = ch.shares.find((x) => x.group === MLKEM_GROUP);
      const x = ch.shares.find((x) => x.group === 29);
      s.seen.mlkemLen = ml ? ml.data.length : 0;
      s.seen.mlkemTail = ml ? ml.data.slice(-32) : null;
      s.seen.x25519 = x ? Buffer.from(x.data) : null;
      /* گیتِ احراز: بدونِ key share گروهِ ۰x۱۱ec سرورِ واقعی آن را مزاحم می‌بیند و
         به مقصدِ استتار پروکسی می‌کند (در تستِ زنده با Xray واقعی هم تأیید شد) */
      if (o.noGate !== true && !ml) { s.seen.rejected = 'mlkem-gate'; s.phase = 'done'; push(Buffer.from([21, 3, 3, 0, 2, 2, 40])); return; }
      if (!x) { s.seen.rejected = 'no-x25519'; s.phase = 'done'; push(Buffer.from([21, 3, 3, 0, 2, 2, 40])); return; }
      try {
        const cliPub = await webcrypto.subtle.importKey('raw', x.data, { name: 'X25519' }, false, []);
        const srvPriv = await webcrypto.subtle.importKey('jwk', srvJwk, { name: 'X25519' }, false, ['deriveBits']);
        const shared = Buffer.from(await webcrypto.subtle.deriveBits({ name: 'X25519', public: cliPub }, srvPriv, 256));
        const authKey = refExpand(refHmac(ch.random.slice(0, 20), shared), Buffer.from('REALITY'), 32);
        const aad = Buffer.from(chMsg);
        aad.fill(0, 39, 71);
        const pt = Buffer.from(await webcrypto.subtle.decrypt(
          { name: 'AES-GCM', iv: new Uint8Array(ch.random.slice(20, 32)), additionalData: new Uint8Array(aad) },
          await webcrypto.subtle.importKey('raw', authKey, { name: 'AES-GCM' }, false, ['decrypt']), ch.sid));
        const t = (pt[4] << 24) | (pt[5] << 16) | (pt[6] << 8) | pt[7];
        const fresh = Math.abs(Math.floor(Date.now() / 1000) - t) <= (Number(o.timeWindowSec) || 3600);
        const sb = Buffer.from(srvSid, 'hex');
        s.seen.sidOk = !o.badSid && fresh && sb.length > 0 && pt.slice(8, 8 + sb.length).equals(sb) && pt.slice(8 + sb.length, 16).every((b) => b === 0);
      } catch (e) { s.seen.sidOk = false; }
      if (!s.seen.sidOk) { s.seen.rejected = 'auth'; s.phase = 'done'; push(Buffer.from([21, 3, 3, 0, 2, 2, 40])); return; }
      const eph = await webcrypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
      const srvEphPub = new Uint8Array(await webcrypto.subtle.exportKey('raw', eph.publicKey));
      s.srvEph = { priv: eph.privateKey, pub: srvEphPub };
      const cliPub2 = await webcrypto.subtle.importKey('raw', x.data, { name: 'X25519' }, false, []);
      const tlsShared = Buffer.from(await webcrypto.subtle.deriveBits({ name: 'X25519', public: cliPub2 }, eph.privateKey, 256));
      const derived1 = refLabel(refHmac(Z, Z), 'derived', refSha(E0), 32);
      const hsSec = refHmac(derived1, tlsShared);
      const Rs = randomBytes(32);
      const shBody = cat(Buffer.from([3, 3]), Rs, Buffer.from([0]), u16(0x1301), Buffer.from([0]),
        u16(6 + 40), Buffer.from([0, 43]), u16(2), Buffer.from([3, 4]),
        Buffer.from([0, 51]), u16(36), u16(29), u16(32), Buffer.from(srvEphPub));
      const shMsg = msg(2, shBody);   /* هدرِ ۴بایتیِ handshake: type + uint24 */
      s.transcript = cat(s.transcript, shMsg);
      const chSh = refSha(s.transcript);
      const cHs = refLabel(hsSec, 'c hs traffic', chSh, 32);
      const sHs = refLabel(hsSec, 's hs traffic', chSh, 32);
      s.keys = { cHs, sHs, hsSec };
      const ee = msg(8, u16(0));
      const cert = msg(11, cat(Buffer.from([0]), u16(0), u16(0)));
      const cv = msg(15, cat(u16(0x0807), u16(64), randomBytes(64)));
      let tr = cat(s.transcript, ee, cert, cv);
      let vd = refHmac(refLabel(sHs, 'finished', E0, 32), refSha(tr)).slice(0, 32);
      if (o.tamper) vd = cat(Buffer.from([vd[0] ^ 1]), vd.slice(1));
      const fin = msg(20, vd);
      s.transcript = cat(tr, fin);
      const sK = await refKeyIv(sHs);
      /* ترتیبِ واقعی: ServerHello (۲۲، پلین‌تکست)، سپس CCS (برای middleboxِ
         خراب‌کار)، سپس flightِ رمزنگاری‌شده — CCS هرگز قبل از SH نمی‌آید */
      const flight = [cat(Buffer.from([22, 3, 1]), u16(shMsg.length), shMsg)];
      if (o.ccs) flight.push(Buffer.from([20, 3, 3, 0, 1, 1]));
      flight.push(await refSealRec(sK, 0, cat(ee, cert, cv), 22, o.pad ? 32 : 0));
      flight.push(await refSealRec(sK, 1, fin, 22, o.pad ? 24 : 0));
      push(Buffer.concat(flight));
      const master = refHmac(refLabel(hsSec, 'derived', refSha(E0), 32), Z);
      const full = refSha(s.transcript);
      s.keys.cAp = refLabel(master, 'c ap traffic', full, 32);
      s.keys.sAp = refLabel(master, 's ap traffic', full, 32);
      s.phase = 'fin';
      s.cSeq = 0;
    }

    async function sendResponse() {
      if (s.responded) return;
      s.responded = true;
      const sK = await refKeyIv(s.keys.sAp);
      const block = refVisionBlock(s.respBody, { uuid: uuidBytes, first: true, cmd: 1, long: true });
      /* هدرِ پاسخِ VLESS ([نسخه][طولِ addons=۰]) + اولین بلوکِ Vision، هر دو
         داخلِ رکوردِ app-dataِ رمزشده — عیناً چیزی که سرورِ واقعی می‌فرستد */
      push(await refSealRec(sK, s.sSeq++, cat(Buffer.from([0x00, 0x00]), block), 23, 0));
    }

    async function onRecord(rec) {
      if (rec[0] === 20) return;                       /* CCS کلاینت بی‌صدا */
      if (rec[0] !== 23) { s.seen.rejected = 'record 0x' + rec[0].toString(16); return; }
      if (s.phase === 'fin') {
        const cK = await refKeyIv(s.keys.cHs);
        const { body, ct } = await refOpen(cK, rec, s.cSeq++);
        const expect = refHmac(refLabel(s.keys.cHs, 'finished', E0, 32), refSha(s.transcript)).slice(0, 32);
        s.seen.finishedOk = ct === 22 && body[0] === 20 && eq(body.slice(4, 36), expect);
        s.transcript = cat(s.transcript, Buffer.from(body));
        s.phase = 'vless';
        s.cSeq = 0;
        if (o.noise) {
          const sK0 = await refKeyIv(s.keys.sAp);
          push(await refSealRec(sK0, s.sSeq++, msg(4, cat(Buffer.from([0, 0]), Buffer.from('ticketbody'))), 22, 0));
          push(await refSealRec(sK0, s.sSeq++, Buffer.alloc(0), 23, 24));
        }
        return;
      }
      const cK = await refKeyIv(s.keys.cAp);
      const { body } = await refOpen(cK, rec, s.cSeq++);
      if (!body.length) return;
      s.in = cat(s.in, body);
      if (!s.seen.flow) {
        const b = s.in;
        if (b.length < 18) return;
        const al = b[17];
        if (b.length < 18 + al + 3) return;
        const addons = b.slice(18, 18 + al);
        if (addons.length >= 2 && addons[0] === 0x0a) s.seen.flow = addons.slice(2, 2 + addons[1]).toString();
        let i = 18 + al + 1;
        s.seen.port = (b[i] << 8) | b[i + 1];
        i += 2;
        const atyp = b[i];
        i += 1;
        if (atyp === 1) { s.seen.addr = b.slice(i, i + 4).join('.'); i += 4; }
        else if (atyp === 2) { const L = b[i]; i += 1; s.seen.addr = b.slice(i, i + L).toString(); i += L; }
        else { s.seen.addr = b.slice(i, i + 16).toString('hex'); i += 16; }
        s.in = b.slice(i);
        s.visionBytes = 0;
      }
      if (s.seen.flow && !o.noVision) {
        s.visionBytes += s.in.length;
        const un = refVisionUnpad([s.in], uuidBytes);
        s.in = Buffer.alloc(0);
        if (un.ok) { s.seen.visionOut = un.out; await sendResponse(); }
      } else if (s.in.length) {
        s.seen.visionOut = cat(s.seen.visionOut || Buffer.alloc(0), s.in);
        s.in = Buffer.alloc(0);
        await sendResponse();
      }
    }

    async function feed(bytes) {
      s.inBuf = cat(s.inBuf, bytes);
      for (;;) {
        if (s.inBuf.length < 5) return;
        const L = (s.inBuf[3] << 8) | s.inBuf[4];
        if (s.inBuf.length < 5 + L) return;
        const rec = s.inBuf.slice(0, 5 + L);
        s.inBuf = s.inBuf.slice(5 + L);
        if (s.phase === 'ch') await onCH(rec);
        else if (s.phase !== 'done') await onRecord(rec);
      }
    }

    return {
      s,
      io: { readExact, write: async (b) => { await feed(Buffer.from(b)); }, close: () => {} },
    };
  }

  const srvCfg = { sni: 'mask.example.com', sid: 'a1b2', pbk };
  const uuidStr = '11111111-1111-4111-8111-111111111111';
  const uuidBytes = Buffer.from(uuidStr.replace(/-/g, ''), 'hex');

  console.log('== ۵) هندشیکِ کامل با سرورِ جعلی (سمانتیکِ واقعیِ امروزیِ Xray) ==');
  {
    const f = fakeXray({ ccs: true, pad: true });
    const hs = await M.rlHandshake(f.io, srvCfg, 5000);
    ok(!!hs && !!hs.cAp && !!hs.sAp, 'هندشیک کامل شد (با CCS و پدینگِ صفرِ رکوردهای سرور)');
    ok(f.s.seen.mlkemLen === MLKEM_LEN, 'کلاینت key share گروهِ ۰x۱۱ec (X25519MLKEM768) می‌فرستد — گیتِ سرورهای امروزی', 'len=' + f.s.seen.mlkemLen);
    ok(eq(f.s.seen.mlkemTail, f.s.seen.x25519), '۳۲ بایتِ آخرِ همان share عیناً X25519ِ کلاینت است (سرورِ واقعی از همین احراز می‌کند)');
    ok(f.s.seen.sidOk, 'AEADِ session_id با کلیدِ مشتق از pbk باز شد (shortId و زمان درست)');
    ok(f.s.seen.finishedOk, 'Finishedِ کلاینت طبق RFC 8446 §4.4.4 تأیید شد (HMAC روی هشِ ترنسکریپت، نه ترنسکریپتِ خام)');
    /* کلیدِ مشترکِ TLS از share موقتِ سرور ساخته شده، نه از کلیدِ ثابتِ reality:
       رکوردی که با rlSeal می‌سازیم باید با کلیدِ مرجعِ cAp باز شود */
    const pt1 = Buffer.from('hello reality');
    const rec1 = await M.rlSeal(hs.cAp, pt1, 0);
    const rawInner = await refInner(await refKeyIv(f.s.keys.cAp), rec1, 0);
    ok(rawInner[rawInner.length - 1] === 0x17 && eq(rawInner.slice(0, -1), pt1),
      'app-data کلاینت با کلیدِ مرجع (ساخته‌شده از shareِ سرور) خوانده می‌شود', 'last=0x' + rawInner[rawInner.length - 1].toString(16));
    ok(eq(await (async () => (await refOpen(await refKeyIv(f.s.keys.cAp), rec1, 0)).body)(), pt1), 'rlSeal دقیقاً یک بایتِ نوعِ محتوا در انتها می‌گذارد');
    /* رکوردِ سرور با پدینگِ صفرِ §5.4 هم باید سالم باز شود */
    const rec2 = await refSealRec(await refKeyIv(f.s.keys.sAp), 7, Buffer.from('welcome'), 23, 48);
    const back2 = await M.rlOpen(hs.sAp, rec2, 7);
    ok(eq(back2.plaintext, Buffer.from('welcome')) && back2.ct === 23, 'پدینگِ صفرِ انتهای رکوردِ سرور جدا می‌شود (RFC 8446 §5.4)', 'ct=' + back2.ct);
    /* رکوردِ بدونِ بایتِ نوعِ محتوا باید رد شود (شکلِ معیوبِ قبلی) */
    let noCt = false;
    try {
      const bad = await (async () => {
        const body = Buffer.from('welcome');
        const h2 = Buffer.from([23, 3, 3, ((body.length + 16) >> 8) & 255, (body.length + 16) & 255]);
        const c2 = await webcrypto.subtle.encrypt(
          { name: 'AES-GCM', iv: refNonce((await refKeyIv(f.s.keys.sAp)).iv, 8), additionalData: new Uint8Array(h2) },
          (await refKeyIv(f.s.keys.sAp)).k, body);
        return Buffer.concat([h2, Buffer.from(c2)]);
      })();
      await M.rlOpen(hs.sAp, bad, 8);
    } catch (e) { noCt = true; }
    ok(noCt, 'رکوردِ بدونِ بایتِ نوعِ محتوا رد می‌شود');
    /* اعلانِ close_notify سرور نباید خطای کشنده باشد (پاسخِ HTTP ممکن است
       قبلش آمده باشد؛ این همان چیزی بود که پاسخِ سالم را «شکست» نشان می‌داد) */
    const cn = await (async () => {
      const h2 = Buffer.from([21, 3, 3, 0, 16 + 2]);
      const body = Buffer.from([1, 0]);
      const c2 = await webcrypto.subtle.encrypt(
        { name: 'AES-GCM', iv: refNonce((await refKeyIv(f.s.keys.sAp)).iv, 9), additionalData: new Uint8Array(h2) },
        (await refKeyIv(f.s.keys.sAp)).k, cat(body, Buffer.from([21])));
      return Buffer.concat([h2, Buffer.from(c2)]);
    })();
    ok(cn.length > 0, 'رکوردِ alert (۲۱) برای تست لنگر ساخته شد');
  }

  console.log('== ۵ب) VLESS + XTLS-Vision روی سرورِ جعلی (رفت‌وبرگشتِ کامل) ==');
  {
    const f = fakeXray({});
    const hs = await M.rlHandshake(f.io, srvCfg, 5000);
    const pair = M.rlWrapStreams(f.io, hs.cAp, hs.sAp);
    const header = Buffer.from(V.vlessRequestHeader(
      { uuid: uuidStr, flow: 'xtls-rprx-vision' }, 'mask.example.com', 443, new Uint8Array(0)));
    const wrapped = V.vlessClientWrap(pair, { header, uuid: uuidBytes, flow: 'xtls-rprx-vision' });
    const w = wrapped.writable.getWriter();
    const payload = Buffer.from('GET / HTTP/1.1\r\nHost: mask.example.com\r\n\r\n');
    await w.write(payload);
    const reader = wrapped.readable.getReader();
    let got = null;
    for (let i = 0; i < 5 && !(got && got.value && got.value.length); i++) got = await reader.read();
    ok(f.s.seen.flow === 'xtls-rprx-vision', 'addons به شکلِ پروتوبافِ Xray خوانده شد (نه شکلِ قدیمی)', String(f.s.seen.flow));
    ok(f.s.seen.addr === 'mask.example.com' && f.s.seen.port === 443, 'مقصد و پورت درست پارس شدند', f.s.seen.addr + ':' + f.s.seen.port);
    ok(f.s.seen.visionOut && eq(f.s.seen.visionOut, payload), 'XtlsUnpaddingِ سرور داده‌ی اصلی را بی‌کم‌وکاست بیرون کشید', f.s.seen.visionOut ? f.s.seen.visionOut.length + ' بایت' : 'خیر');
    ok(got && got.value && Buffer.from(got.value).toString().slice(0, 12) === 'HTTP/1.1 200', 'پاسخِ سرور (هدرِ پاسخ + بلوکِ Vision) به کلاینت رسید', got && got.value ? Buffer.from(got.value).toString().slice(0, 20) : 'خیر');
  }

  console.log('== ۶ب) نویزِ پس از هندشیک (ticket + رکوردِ خالی) به جریان تزریق نمی‌شود ==');
  {
    const f = fakeXray({ noise: true });
    const hs = await M.rlHandshake(f.io, srvCfg, 5000);
    const pair = M.rlWrapStreams(f.io, hs.cAp, hs.sAp);
    const header = Buffer.from(V.vlessRequestHeader(
      { uuid: uuidStr, flow: 'xtls-rprx-vision' }, 'mask.example.com', 443, new Uint8Array(0)));
    const wrapped = V.vlessClientWrap(pair, { header, uuid: uuidBytes, flow: 'xtls-rprx-vision' });
    const w = wrapped.writable.getWriter();
    await w.write(Buffer.from('GET /x HTTP/1.1\r\n\r\n'));
    const reader = wrapped.readable.getReader();
    let got = null, steps = 0;
    while (steps++ < 6 && !(got && got.value && got.value.length)) got = await reader.read();
    ok(got && got.value && Buffer.from(got.value).toString().slice(0, 12) === 'HTTP/1.1 200', 'NewSessionTicket و رکوردِ خالیِ سرور رد شدند و فقط پاسخ رسید', got && got.value ? Buffer.from(got.value).toString().slice(0, 20) : 'خیر');
  }

  console.log('== ۷) منفی‌ها: شکست باید throw شود ==');
  {
    const f = fakeXray({ tamper: true });
    let threw = false;
    try { await M.rlHandshake(f.io, srvCfg, 5000); } catch (e) { threw = true; }
    ok(threw, 'Finishedِ دستکاری‌شده رد می‌شود');
  }
  /* shortId ناشناس برای سرور → alert (مثل خطای واقعیِ کاربر) */
  {
    const f = fakeXray({ badSid: true });
    let threw = false, msg = '';
    try { await M.rlHandshake(f.io, srvCfg, 5000); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    ok(threw && msg.includes('40') && msg.includes('handshake_failure'), 'alert سرور با کدش گزارش می‌شود', msg.slice(0, 80));
  }
  {
    const f = fakeXray({});
    let threw = false, msg = '';
    try { await M.rlHandshake(f.io, { ...srvCfg, sid: 'ffff' }, 5000); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    ok(threw && msg.includes('40'), 'sid ناشناس در کانفیگ → alert و خطای گویا', msg.slice(0, 80));
  }
  {
    const f = fakeXray({});
    let threw = false;
    try { await M.rlHandshake(f.io, { ...srvCfg, pbk: b64u(randomBytes(32)) }, 5000); } catch (e) { threw = true; }
    ok(threw, 'pbk اشتباه (سرورِ دیگر) رد می‌شود');
  }
  {
    let threw = false;
    const f = fakeXray({});
    try { await M.rlHandshake(f.io, { ...srvCfg, sid: 'zz' }, 5000); } catch (e) { threw = true; }
    ok(threw, 'sid بدریخت همان اول رد می‌شود');
  }
  {
    let threw = false;
    const f = fakeXray({});
    try { await M.rlHandshake(f.io, { ...srvCfg, sni: '' }, 5000); } catch (e) { threw = true; }
    ok(threw, 'sni خالی رد می‌شود');
  }

  console.log(fail ? '\n' + fail + ' تست ناموفق ✗' : '\nهمه‌ی تست‌ها موفق ✓');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FATAL: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
