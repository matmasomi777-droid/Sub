/* ══════════════════════════════════════════════════════════════════════
   t12 — نمای «امنیت» در پنل + ماندگاریِ گزارشِ سلامت شمارش مصرف

   این تست متنِ ui/app.js و worker.js را می‌خواند (بدون اجرای مرورگر) و
   چک می‌کند که:
     • بخش امنیت واقعاً یک مسیرِ قابل‌رؤیت دارد (NAV + VIEWS)
     • فیلدهایش دقیقاً به همان کلیدهایی وصل‌اند که ورکر می‌خواند
       (sec.ipConnLimit — گزینه‌ی «زمان آزاد شدن آی‌پی» حذف شده است)
     • ذخیره از طریق save-security به PUT /api/settings می‌رود
     • نتیجه‌ی «بررسی سلامت» در state و localStorage نگه داشته می‌شود و
       در هر بار رندرِ کارتِ مانیتور دوباره نمایش داده می‌شود
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';

const UI = readFileSync(new URL('../ui/app.js', import.meta.url), 'utf8');
const WK = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, note) => {
  if (cond) { pass++; console.log('PASS ', name + (note ? ' — ' + note : '')); }
  else { fail++; console.log('FAIL ', name + (note ? ' — ' + note : '')); }
};

/* بدنه‌ی یک تابع را از متن بیرون می‌کشد تا پنجره‌ی جست‌وجو محدود و دقیق باشد */
const fnBody = (name) => {
  const i = UI.indexOf('function ' + name);
  if (i < 0) return '';
  const j = UI.indexOf('\n  function ', i + 10);
  return j < 0 ? UI.slice(i) : UI.slice(i, j);
};

/* ─── ۱) مسیرِ ناوبری ─── */
const navLine = UI.split('\n').find((l) => l.includes("['security', 'امنیت'")) || '';
ok('nav has a security entry', !!navLine, navLine.trim().slice(0, 90));
ok('security is grouped under پیکربندی', navLine.includes('پیکربندی'));

/* ─── ۲) VIEWS به تابعِ واقعی وصل است (نه فال‌بک به configView) ─── */
ok('VIEWS maps security → securityView', /security:\s*securityView\b/.test(UI));
ok('securityView is defined', /function\s+securityView\s*\(/.test(UI));
const secBody = fnBody('securityView');
ok('securityView renders SCHEMA.security', /SCHEMA\.security/.test(secBody));

/* ─── ۳) کلیدهای UI همان کلیدهایی است که ورکر می‌خواند ─── */
ok('worker reads sec.ipConnLimit', /settings\.sec\.ipConnLimit|sec\.ipConnLimit/.test(WK));
/* ═══ «زمان آزاد شدن آی‌پی» دیگر وجود ندارد ═══
   آزادسازی آنی است و سقفِ سختِ ۳ ثانیه در خودِ ورکر ثابت است؛ نه در پنل
   فیلدی دارد و نه در ورکر مسیرِ خواندنِ تنظیمات. */
ok('release-time setting is gone from the worker', !WK.includes('connTtlSec'));
ok('release-time setting is gone from the panel', !UI.includes('connTtlSec'));
ok('release-time setting is gone from worker defaults', !/sec:\s*\{[^}]*connTtlSec/.test(WK));
ok('no TTL knob left (min/max/apply/heartbeat)', !/CONN_TTL_SEC|CONN_TTL_MIN|CONN_TTL_MAX|connTtlMs|connHbMs|connApplySettings|CONN_HB/.test(WK));
ok('staleness window is hardcoded to 3s', /const CONN_TTL = 3000;/.test(WK));
ok('activity refresh is throttled to 1s', /const CONN_ACTIVITY_MS = 1000;/.test(WK));
ok('no periodic heartbeat timer remains', !/hbTimer/.test(WK));
ok('SCHEMA binds sec.ipConnLimit', /p:\s*'sec\.ipConnLimit'/.test(UI));
ok('SCHEMA binds sec.speedTestUrl', /p:\s*'sec\.speedTestUrl'/.test(UI));
ok('SCHEMA keeps the panel login session expiry', /p:\s*'auth\.sessionMin'/.test(UI));

/* ─── ۴) ذخیره ─── */
ok('security view has a save-security button', /saveBtn\('save-security'\)/.test(UI));
ok('save-* is routed to PUT /api/settings', /a\.startsWith\('save-'\)[\s\S]{0,600}?api\('PUT',\s*'\/api\/settings'/.test(UI));
ok('worker PUT /api/settings deep-merges', /route === 'settings' && \(m === 'PUT'[\s\S]{0,400}?merge\(s, b\.settings\)/.test(WK));
ok('refresh is wired into the byte-accounting function',
  /const maybeFlush = \(force\) => \{[\s\S]{0,200}?noteActivity\(\);/.test(WK));
ok('refresh cannot re-insert a released row',
  /if\s*\(!stillAlive\(\)\)\s*return\s*\{\s*ok:\s*false,\s*reason:\s*'released'/.test(WK));
ok('denied refresh closes the connection gracefully', /ws\.close\(1013, 'connection limit reached'\)/.test(WK));

/* ─── ۵) نشانگرِ مرجعِ محدودیت ─── */
ok('securityView shows the active backend badge', /S\.d\.storage/.test(secBody));
ok('backend badge covers d1/kv/do/mem', /store === 'd1'/.test(secBody) && /store === 'kv'/.test(secBody) && /store === 'do'/.test(secBody));
ok('securityView states the instant release', /آزادسازی آی‌پی/.test(secBody) && /آنی/.test(secBody) && /۳/.test(secBody));
ok('securityView no longer mentions a configurable TTL', !/ttl|hb\b|idle/.test(secBody));

/* ─── ۶) ماندگاریِ گزارشِ سلامت ─── */
ok('health result is kept in state', /const UH = \{ last: null, ts: 0 \}/.test(UI));
ok('health result is persisted to localStorage', /localStorage\.setItem\(UH_KEY/.test(UI));
ok('health result is restored on load', /localStorage\.getItem\(UH_KEY\)/.test(UI));
ok('monitor card re-renders the stored report', /id="usageHealthOut">'\s*\+\s*uhHtml\(UH\.last\)/.test(UI));
ok('usage-health handler saves then shows', /a === 'usage-health'[\s\S]{0,900}?uhSave\(r\);\s*uhShow\(\);/.test(UI));
ok('report header shows last-check time', /آخرین بررسی/.test(UI));
ok('report header says it survives until next check', /تا وقتی دوباره «بررسی سلامت» را نزنید/.test(UI));
ok('a clear button exists', /data-act="usage-health-clear"/.test(UI));
ok('clear handler resets state + storage', /a === 'usage-health-clear'[\s\S]{0,400}?localStorage\.removeItem\(UH_KEY\)/.test(UI));
ok('conn-reset keeps the report (re-runs health)', /a === 'conn-reset'[\s\S]{0,1400}?uhSave\(r2\)/.test(UI));

/* ─── ۷) تست ترافیک هم ماندگار است ─── */
ok('traffic-test result is persisted', /const ttSave = /.test(UI) && /localStorage\.setItem\(TT_KEY/.test(UI));
ok('traffic-test result is re-rendered', /id="trafficTestOut"[^>]*>'\s*\+\s*ttHtml\(TT\.last\)/.test(UI));

/* ─── ۸) کارتِ سلامت: خلاصه‌ی صادقانه، جدولِ ردیف‌ها و دکمه‌ی آزادسازی ───
   خطِ «TTL / ضربان / آستانه‌ی بی‌ضربانی» باید با یک خلاصه‌ی کوتاه و صادقانه
   جایگزین شود و هیچ اشاره‌ای به تنظیمِ حذف‌شده نداشته باشد. */
ok('health card no longer reads the deleted ttl/hb/idle diagnostics',
  !/ttlSec|hbSec|idleAfterSec/.test(UI));
ok('health card shows the releaseSec diagnostic', /releaseSec/.test(UI));
ok('health card states release is instant on disconnect', /آنی هنگام قطع شدن/.test(UI));
ok('health card states the 3s ceiling for sudden drops', /قطعیِ ناگهانی/.test(UI));
ok('live-connections table is still rendered', /اتصال‌های زنده/.test(UI) && /x\.ageSec/.test(UI));
ok('live-connections table still shows row age', /fa\(x\.ageSec\) \+ ' ثانیه'/.test(UI));
ok('reset-connections button is still there', /data-act="conn-reset"/.test(UI));
ok('reset-connections button is still labelled', /آزادسازی اتصال‌ها/.test(UI));

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('T12 UI-SECURITY TESTS FAILED'); process.exit(1); }
console.log('ALL UI-SECURITY TESTS PASSED');
