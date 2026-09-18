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
const V = new Function('toU8', 'dialableAddr', 'TextEncoder', vbsrc +
  '\n;return { vlessAddons, vlessRequestHeader };'
)(toU8, dialableAddrStub, TextEncoder);

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
    ok(b[18] === 1 && b[19] === 16 && b.slice(20, 36).toString() === FLOW, 'flow با [type,len] در addons نشست');
    ok(b[36] === 1 && ((b[37] << 8) | b[38]) === 443, 'فرمان/پورت بعد از addons درست‌اند');
    const h0 = Buffer.from(V.vlessRequestHeader({ uuid: '11111111-1111-4111-8111-111111111111', flow: '' }, '1.2.3.4', 443, new Uint8Array(0)));
    ok(h0[17] === 0 && h0[18] === 1, 'بدونِ flow، addons خالی است');
  }

  console.log('== ۵) هندشیکِ کامل با سرورِ جعلی (پیاده‌سازیِ مستقل) ==');
  /* ── ابزارِ بایتِ تست ── */
  const u16 = (v) => Buffer.from([(v >> 8) & 255, v & 255]);
  const cat = (...a) => Buffer.concat(a.map((x) => Buffer.from(x)));
  const msg = (t, body) => cat(Buffer.from([t, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255]), Buffer.from(body));

  /* پارسِ حداقلیِ ClientHello برای بیرون‌کشیدنِ کلیدِ موقتِ کلاینت */
  function clientPubOf(chRecord) {
    const b = Buffer.from(chRecord);
    if (b[0] !== 22) throw new Error('not hs');
    const L = (b[3] << 8) | b[4];
    const m = b.slice(5, 5 + L);
    if (m[0] !== 1) throw new Error('not CH');
    let i = 4 + 2 + 32;
    const sidL = m[i]; i += 1 + sidL;
    const csL = (m[i] << 8) | m[i + 1]; i += 2 + csL;
    i += 1 + m[i];
    const exL = (m[i] << 8) | m[i + 1]; i += 2;
    const end = i + exL;
    while (i + 4 <= end) {
      const t = (m[i] << 8) | m[i + 1], l = (m[i + 2] << 8) | m[i + 3];
      const v = m.slice(i + 4, i + 4 + l);
      if (t === 0x0033) {
        let k = 2;
        while (k + 4 <= v.length) {
          const g = (v[k] << 8) | v[k + 1], ll = (v[k + 2] << 8) | v[k + 3];
          if (g === 29 && ll === 32) return v.slice(k + 4, k + 36);
          k += 4 + ll;
        }
      }
      i += 4 + l;
    }
    throw new Error('no x25519 share');
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
  async function refOpen(keyObj, record, seq) {
    const r = Buffer.from(record);
    const h = r.slice(0, 5);
    const L = (h[3] << 8) | h[4];
    const pt = Buffer.from(await webcrypto.subtle.decrypt(
      { name: 'AES-GCM', iv: refNonce(keyObj.iv, seq), additionalData: new Uint8Array(h) }, keyObj.k, r.slice(5, 5 + L)));
    return pt;
  }

  /* ساختِ flight سرور مثل سرورِ واقعی: اول session_id با AEAD باز و shortId/زمان
     چک می‌شود؛ اگر تأیید نشد، مثل سرورِ سخت‌گیر alert می‌دهد (نه camouflage).
     shortIds قابل‌قبول و پنجره‌ی زمانی از opts می‌آیند. pt رمزگشایی‌شده هم
     برمی‌گردد تا نسخه/زمان/sid ادعاشده راستی‌آزمایی شود. */
  async function fakeFlight(chRecord, opts) {
    opts = opts || {};
    const shortIds = Array.isArray(opts.shortIds) ? opts.shortIds : ['a1b2'];
    const timeWindow = Number(opts.timeWindowSec) || 3600;
    const cliPub = clientPubOf(chRecord);
    const cliPubKey = await webcrypto.subtle.importKey('raw', cliPub, { name: 'X25519' }, false, []);
    const srvPrivKey = await webcrypto.subtle.importKey('jwk', srvJwk, { name: 'X25519' }, false, ['deriveBits']);
    const shared = Buffer.from(await webcrypto.subtle.deriveBits({ name: 'X25519', public: cliPubKey }, srvPrivKey, 256));
    const Z = Buffer.alloc(32), E0 = Buffer.alloc(0);
    const h = (d) => refSha(d);
    const fullRec = Buffer.from(chRecord);
    const chMsg = fullRec.slice(5);
    const chRnd = chMsg.slice(6, 38);
    const sidVal = chMsg.slice(39, 71);
    /* تأییدِ AEAD مثل سرورِ واقعی */
    const authRef = refExpand(refHmac(chRnd.slice(0, 20), shared), Buffer.from('REALITY'), 32);
    const aadRef = Buffer.from(chMsg);
    aadRef.fill(0, 39, 71);
    let pt = null, sidOk = false;
    try {
      const authK = await webcrypto.subtle.importKey('raw', authRef, { name: 'AES-GCM' }, false, ['decrypt']);
      pt = Buffer.from(await webcrypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(chRnd.slice(20, 32)), additionalData: new Uint8Array(aadRef) },
        authK, sidVal));
      const t = (pt[4] << 24) | (pt[5] << 16) | (pt[6] << 8) | pt[7];
      const fresh = Math.abs(Math.floor(Date.now() / 1000) - t) <= timeWindow;
      sidOk = fresh && shortIds.some((s) => {
        const sb = Buffer.from(String(s), 'hex');
        return sb.length <= 8 && pt.slice(8, 8 + sb.length).equals(sb) && pt.slice(8 + sb.length, 16).every((b) => b === 0);
      });
    } catch (e) { sidOk = false; }
    if (!sidOk) return { flight: [Buffer.from([21, 3, 3, 0, 2, 2, 40])], rejected: true };
    const early = refHmac(Z, Z);
    const derived1 = refLabel(early, 'derived', h(E0), 32);
    const hs = refHmac(derived1, shared);
    const Rs = randomBytes(32);
    const shBody = cat(Buffer.from([3, 3]), Rs, Buffer.from([0]), u16(0x1301), Buffer.from([0]),
      u16(6 + 40),
      Buffer.from([0, 43]), u16(2), Buffer.from([3, 4]),
      Buffer.from([0, 51]), u16(36), u16(29), u16(32), Buffer.from(srvPub));
    const shMsg = msg(2, shBody);
    const shRec = cat(Buffer.from([22, 3, 1]), u16(shMsg.length), shMsg);
    const chSh = h(cat(chMsg, shMsg));
    const cHs = refLabel(hs, 'c hs traffic', chSh, 32);
    const sHs = refLabel(hs, 's hs traffic', chSh, 32);
    const sK = await refKeyIv(sHs);
    const ee = msg(8, u16(0));
    const cert = msg(11, cat(Buffer.from([0]), u16(0)));
    let tr = cat(chMsg, shMsg, ee, cert);
    const fk = refLabel(sHs, 'finished', E0, 32);
    let vd = refHmac(fk, tr).slice(0, 32);
    if (opts.tamper) vd = cat(Buffer.from([vd[0] ^ 1]), vd.slice(1));
    const fin = msg(20, vd);
    tr = cat(tr, fin);
    const sealRec = async (m, seq) => {
      const { hdr, ct } = await (async () => {
        const hh = Buffer.from([23, 3, 3, 0, 0]);
        const c = await webcrypto.subtle.encrypt(
          { name: 'AES-GCM', iv: refNonce(sK.iv, seq), additionalData: new Uint8Array(hh) }, sK.k, m);
        const L = c.byteLength;
        const h2 = Buffer.from([23, 3, 3, (L >> 8) & 255, L & 255]);
        const c2 = await webcrypto.subtle.encrypt(
          { name: 'AES-GCM', iv: refNonce(sK.iv, seq), additionalData: new Uint8Array(h2) }, sK.k, m);
        return { hdr: h2, ct: Buffer.from(c2) };
      })();
      void hdr;
      return cat(hdr, ct);
    };
    if (opts.alert) return { flight: [Buffer.from([21, 3, 3, 0, 2, 2, 40])] };
    const r1 = await sealRec(cat(ee, cert), 0);
    const r2 = await sealRec(fin, 1);
    const master = refHmac(refLabel(hs, 'derived', h(tr), 32), Z);
    const cAp = refLabel(master, 'c ap traffic', h(tr), 32);
    const sAp = refLabel(master, 's ap traffic', h(tr), 32);
    return { flight: [shRec, r1, r2], cAp, sAp, tr, pt };
  }

  /* io تنبل: flight بعد از دیدنِ CH ساخته می‌شود */
  function lazyIo(buildOpts) {
    let ch = null, built = null, buf = Buffer.alloc(0), off = 0;
    const writes = [];
    return {
      io: {
        readExact: async (n) => {
          if (!built) {
            if (!ch) throw new Error('no CH yet');
            built = await fakeFlight(ch, buildOpts);
            buf = Buffer.concat(built.flight);
          }
          if (off + n > buf.length) throw new Error('eof');
          const o = buf.slice(off, off + n);
          off += n;
          return new Uint8Array(o);
        },
        write: async (b) => {
          if (!ch) ch = Buffer.from(b);
          else writes.push(Buffer.from(b));
        },
        close: () => {},
      },
      writes,
      ref: () => built,
    };
  }

  const srvCfg = { sni: 'mask.example.com', sid: 'a1b2', pbk };

  /* هندشیکِ موفق */
  {
    const t = lazyIo({});
    const hs = await M.rlHandshake(t.io, srvCfg, 5000);
    ok(!!hs && !!hs.cAp && !!hs.sAp, 'هندشیک با سرورِ جعلی کامل شد');
    ok(t.writes.length >= 1, 'Finished کلاینت فرستاده شد', t.writes.length + ' write');
    const ref = t.ref();
    /* سرور shortId را از AEAD خوانده است (نه از بایتِ خام) */
    ok(ref.pt && ref.pt[0] === 26 && ref.pt[1] === 7 && ref.pt[2] === 11 && ref.pt[3] === 0, 'نسخه‌ی کلاینت مدرن است', ref.pt && [...ref.pt.slice(0, 4)].join('.'));
    ok(ref.pt && ref.pt.slice(8, 10).toString('hex') === 'a1b2' && ref.pt.slice(10, 16).every((b) => b === 0), 'سرور shortId را از AEAD خواند');
    /* کلاینت→سرور با کلیدِ مرجع باز می‌شود */
    const pt1 = Buffer.from('hello reality');
    const rec1 = await M.rlSeal(hs.cAp, pt1, 0);
    const cApK = await refKeyIv(ref.cAp);
    const back1 = await refOpen(cApK, rec1, 0);
    ok(eq(back1, pt1), 'app-data کلاینت با مرجع خوانده شد');
    /* سرور→کلاینت با rlOpen باز می‌شود */
    const pt2 = Buffer.from('welcome');
    const sApK = await refKeyIv(ref.sAp);
    const rec2 = await (async () => {
      const hh = Buffer.from([23, 3, 3, 0, 0]);
      const c = await webcrypto.subtle.encrypt(
        { name: 'AES-GCM', iv: refNonce(sApK.iv, 0), additionalData: new Uint8Array(hh) }, sApK.k, pt2);
      const L = c.byteLength;
      const h2 = Buffer.from([23, 3, 3, (L >> 8) & 255, L & 255]);
      const c2 = await webcrypto.subtle.encrypt(
        { name: 'AES-GCM', iv: refNonce(sApK.iv, 0), additionalData: new Uint8Array(h2) }, sApK.k, pt2);
      return Buffer.concat([h2, Buffer.from(c2)]);
    })();
    const back2 = await M.rlOpen(hs.sAp, rec2, 0);
    ok(eq(back2.plaintext, pt2), 'app-data سرور با rlOpen خوانده شد');
  }

  console.log('== ۶) منفی‌ها: شکست باید throw شود ==');
  {
    const t = lazyIo({ tamper: true });
    let threw = false;
    try { await M.rlHandshake(t.io, srvCfg, 5000); } catch (e) { threw = true; }
    ok(threw, 'Finished دستکاری‌شده رد می‌شود');
  }
  {
    const t = lazyIo({ alert: true });
    let threw = false, msg = '';
    try { await M.rlHandshake(t.io, srvCfg, 5000); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    ok(threw && msg.includes('40') && msg.includes('handshake_failure'), 'alert سرور با کدش گزارش می‌شود', msg.slice(0, 80));
  }
  /* shortId ناشناس برای سرور → alert (مثل خطای واقعیِ کاربر) */
  {
    const t = lazyIo({});
    let threw = false, msg = '';
    try { await M.rlHandshake(t.io, { ...srvCfg, sid: 'ffff' }, 5000); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    ok(threw && msg.includes('40'), 'sid ناشناس → alert و خطای گویا', msg.slice(0, 80));
  }
  {
    const t = lazyIo({});
    let threw = false;
    try { await M.rlHandshake(t.io, { ...srvCfg, pbk: b64u(randomBytes(32)) }, 5000); } catch (e) { threw = true; }
    ok(threw, 'pbk اشتباه (سرورِ دیگر) رد می‌شود');
  }
  {
    let threw = false;
    const t = lazyIo({});
    try { await M.rlHandshake(t.io, { ...srvCfg, sid: 'zz' }, 5000); } catch (e) { threw = true; }
    ok(threw, 'sid بدریخت همان اول رد می‌شود');
  }
  {
    let threw = false;
    const t = lazyIo({});
    try { await M.rlHandshake(t.io, { ...srvCfg, sni: '' }, 5000); } catch (e) { threw = true; }
    ok(threw, 'sni خالی رد می‌شود');
  }

  console.log(fail ? '\n' + fail + ' تست ناموفق ✗' : '\nهمه‌ی تست‌ها موفق ✓');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FATAL: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
