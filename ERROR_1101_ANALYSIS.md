# تحلیل: چرا این ورکر به ارور 1101 کلادفلر نمی‌خورد؟

> فایل بررسی‌شده: `worker.txt` (واریانت پروژه «نهان / Nahan»، نسخه 2.9.4 — 8836 خط)
> هدف: شناسایی مکانیزم‌هایی که باعث می‌شوند این ورکر هرگز ارور **1101 (Worker threw a JavaScript exception)** را تولید نکند، به‌عنوان مرجعی برای پورت همین تکنیک‌ها به `worker.js` اصلی ریپو.

---

## ارور 1101 دقیقاً چیست؟

ارور 1101 زمانی رخ می‌دهد که یک استثنای (Exception) **مدیریت‌نشده** از هندلر `fetch` (یا `scheduled`) به runtime کلادفلر برسد. یعنی هر `throw`، هر `TypeError` روی مقدار undefined، یا هر promise رد‌شده‌ی بدون catch که تا بالاترین لایه پیش برود، مستقیماً صفحه‌ی 1101 را به کاربر نشان می‌دهد.

استراتژی این فایل یک جمله است: **«هیچ استثنایی اجازه ندارد به runtime برسد»** — با سه لایه دفاعی تودرتو.

---

## لایه ۱ — تلهٔ سراسری دور کل `fetch` (مهم‌ترین تکنیک)

کل بدنه‌ی هندلر `fetch` داخل یک بلوک `try` است و `catch` آن به‌جای کرش، یک پاسخ ساده 404 برمی‌گرداند:

```js
// worker.txt:440-441 و worker.txt:932-934
async fetch(request, env, ctx) {
    try {
        // ... کل منطق مسیریابی، داشبورد، اشتراک، WebSocket ...
    } catch (err) {
        return new Response(null, { status: 404 });
    }
}
```

نکات کلیدی:

- حتی توابع سازنده‌ی کانفیگ که **خودشان catch داخلی ندارند** (مثل `buildUriProfile`، `buildYamlProfile`، `buildClashJsonProfile`، `buildSingBoxJsonProfile`) توسط همین تله گرفته می‌شوند؛ اگر `btoa` روی داده‌ی عجیب خراب شود یا `Math`/regex استثنا بدهد، خروجی فقط 404 است.
- خودِ بدنه‌ی `catch` عمداً مینیمال نوشته شده (فقط `new Response`) تا هیچ‌وقت خودش استثنا پرتاب نکند — یعنی تله‌ی نهایی نشکستنی است.
- هندلر `scheduled` (کرون آپدیت خودکار) هم دقیقاً همین الگو را دارد: `try { ... } catch (e) {}`.

نتیجه: **هیچ مسیر ورودی وجود ندارد که exception از آن به runtime برسد.**

## لایه ۲ — ضدکرش‌کردن لایه‌ی ذخیره‌سازی (D1)

شایع‌ترین منبع 1101 در پنل‌های مشابه، داده‌ی خراب در دیتابیس/KV است (`JSON.parse` روی مقدار ناقص). این فایل کل لایه‌ی دیتا را «بی‌خطر» کرده:

```js
// worker.txt:150-174 — هر سه تابع D1 استثنا را بلعیده و null/no-op برمی‌گردانند
async function d1Get(env, key) {
    ...
    try { ... } catch (e) {}   // ← خطا = null
    return null;
}
```

و در `loadSysConfig` (worker.txt:1075) اگر خواندن یا پارس کانفیگ شکست بخورد، با `.catch(() => { sysConfig = { ...SYSTEM_DEFAULTS }; })` به **پیش‌فرض‌های سیستمی** برمی‌گردد — یعنی ورکر با کانفیگ خراب هم بالا می‌آید و سرویس می‌دهد.

`migrateSlaveNodesToLinkedPanels` هم قبل از هر کاری فیلدها را نرمال می‌کند تا ساختارهای قدیمی باعث `undefined` نشوند.

## لایه ۳ — ایزوله‌سازی کامل خط لوله‌ی WebSocket (پروکسی VLESS/Trojan)

اتصالات پروکسی بیشترین ریسک استثنا را دارند (دیتای باینری خراب، هندشیک ناقص، قطعی سوکت). اینجا سه محافظ هست:

**الف)** خطاهای خود سوکت با listener خالی بلعیده می‌شوند:

```js
// worker.txt:6154
webSocket.addEventListener("error", () => {});
```

**ب)** پیام‌ها از طریق **زنجیره‌ی promise سریالی** پردازش می‌شوند و هر پیام `try/catch` مستقل دارد؛ خطای پارس هندشیک فقط اتصال را می‌بندد، نه اینکه isolate را بترکاند:

```js
// worker.txt:6160-6177
webSocket.addEventListener("message", (event) => {
    queue = queue.then(async () => {
        try {
            ... // parseSensorData یا dataWriter.write
        } catch (err) {
            webSocket.close();      // ← به‌جای throw
        }
    });
});
```

**ج)** داخل `parseSensorData`:
- کاربر نامعتبر → `return false` (نه throw) — worker.txt:6213/6296
- رزولوشن DoH داخل `try/catch` با fallback به خودِ hostname — worker.txt:6398
- اتصال خروجی `connect()` داخل `try/catch` با **حلقه‌ی failover روی proxy IPهای جایگزین** (تا ۳ تلاش با هش ثابت کاربر) و در نهایت `webSocket.close()` — worker.txt:6420-6470

## محافظت‌های عرضی (در همه‌جای کد پخش شده)

| تکنیک | مثال |
|---|---|
| Optional chaining + مقدار پیش‌فرض | `sysUsageCache?.users?.[idClean] \|\| { reqs: 0, dReqs: 0 }` ، `ctx?.waitUntil` ، `request.cf?.country \|\| "Unknown"` |
| بلعیدن خطای کارهای پس‌زمینه | هر fire-and-forget با `.catch(() => {})` بسته شده (`ctx?.waitUntil(fetch(...).catch(...))`) → **هیچ unhandled rejection باقی نمی‌ماند** |
| wrapper امن برای انکودینگ | `safeBtoa` (worker.txt:19-27) با try/catch و fallback |
| محدودسازی رشد حافظه | `if (configRegistry.size > 10000) { configRegistry.clear(); ... }` (worker.txt:443) — جلوگیری از OOM که خودش را شبیه 1101 نشان می‌دهد |
| catch در تک‌تک هندلرهای API | `handleAuth`، `handleConfigSync`، `handleUsersApi`، `handleStatsApi`، `handleUpdateApi`، `handleApiKeys`، `handleLogs`، `handleSyncPanel`، `handleTelegramWebhook` همگی `try/catch` سراسری دارند و خطا را به‌صورت JSON `{success:false}` برمی‌گردانند |
| عدم استثنا در startup | در سطح ماژول فقط تعریف ثابت و Map وجود دارد؛ هیچ fetch/throw در top-level نیست (1101 گاهی در فاز startup رخ می‌دهد) |
| چک کردن قبل از JSON.parse | همه‌ی `JSON.parse`ها داخل try/catch یا `.catch` هستند |

در کل فایل **بیش از ۵۰ بلوک catch** شمارش شده — دفاع لایه‌لایه.

## نکات جانبی (مرتبط ولی غیر-1101)

- `getAlpha()` / `getBeta()` / `getGamma()` کلمات `vless` / `trojan` / `clash` را با `String.fromCharCode` می‌سازند تا اسکنر کلمات کلیدی کلادفلر کد را فلگ/بلاک نکند (worker.txt:11-13).
- در `deployWorkerToCloudflare` فلگ `allow_eval_during_startup` ست می‌شود تا لودر obfuscate‌شده (`obfuscateCode`) در فاز startup قابل اجرا باشد.
- مسیرهای ناموجود و مسیرهای غیرمجاز به‌جای exception به صفحه‌ی استتار (`serveMaintenancePage`) یا 404 می‌روند.

---

## جمع‌بندی معماری دفاعی

```
درخواست / پیام WS
   │
   ├─ try/catch داخلی هر عملیات I/O  (D1، fetch، DoH، connect، JSON.parse)
   │        └─ شکست → مقدار fallback (null / پیش‌فرض / بستن سوکت)
   │
   ├─ try/catch سراسری هر handler  (auth، sync، users، stats، ...)
   │        └─ شکست → پاسخ JSON {success:false}
   │
   └─ try/catch سراسری fetch() و scheduled()   ← لایه‌ی نهایی و نشکستنی
            └─ شکست → Response(null, 404)   ← هرگز 1101
```

## چک‌لیست پورت این راهکار به `worker.js` اصلی

1. [ ] دور کردن کل بدنه‌ی `fetch` و `scheduled` با `try/catch` که پاسخ 404 برگرداند (کوچک‌ترین تغییر با بیشترین اثر).
2. [ ] افزودن `try/catch` خالی به `d1Get` / `d1Put` / `d1Init` و fallback به CONFIG پیش‌فرض در loader کانفیگ.
3. [ ] افزودن `addEventListener("error", () => {})` به سوکت WS و زنجیره‌ی `queue = queue.then(...)` با try/catch برای هر پیام.
4. [ ] بازبینی تک‌تک `await`های بدون catch — به‌خصوص `await request.json()` (اگر بدنه JSON نباشد SyntaxError می‌دهد → 1101) و `await remoteSocket.opened`.
5. [ ] بستن همه‌ی `ctx.waitUntil(...)` با `.catch(() => {})`.
6. [ ] افزودن optional chaining و default object روی همه‌ی دسترسی‌های `usage`/`cf`/`config`.
7. [ ] محدودکردن کش‌های in-memory (پاکسازی دوره‌ای) برای جلوگیری از خطای حافظه.
