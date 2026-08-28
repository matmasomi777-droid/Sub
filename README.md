# پنل مدیریت کانفیگ روی Cloudflare Workers

<div dir="rtl">

پنلی تک‌فایل برای ساخت، مدیریت و توزیع کانفیگ‌های **VLESS / Trojan / Shadowsocks / VMess** روی لبه‌ی شبکه‌ی کلاودفلر — بدون سرور، بدون npm، بدون هزینه.

> **نام پروژه:** Panel Core • **نسخه:** 2.0.0 • **زبان:** JavaScript (Workers) • **رابط:** فارسی/RTL

---

## ✨ معرفی

این پروژه یک ورکر Cloudflare است که سه کار انجام می‌دهد:

1. **هسته‌ی تونل** — اتصال VLESS و Trojan روی WebSocket را واقعاً می‌پذیرد و ترافیک را با `cloudflare:sockets` به مقصد می‌رساند.
2. **پنل مدیریت** — رابط کاربری کامل (تک‌صفحه‌ای، فارسی، تم تاریک/روشن) که **از گیت‌هاب خوانده می‌شود** (مثل نهان): فایل‌های `ui/index.html`، `ui/style.css`، `ui/app.js`.
3. **سرویس اشتراک** — لینک ساب‌اسکریپشن با ۶ فرمت خروجی و تشخیص خودکار کلاینت.

### چرا این معماری؟
فایل‌های UI جدا از موتور هستند؛ یعنی می‌توانید ظاهر پنل را عوض کنید **بدون دست زدن به ورکر** — کافی است فایل‌های css/html را در مخزن گیت‌هاب تغییر دهید (قابلیت **FR** در تنظیمات).

---

## 🚀 نصب

### روش ۱ — داشبورد کلاودفلر (بدون ترمینال)

1. وارد <https://dash.cloudflare.com> شوید
2. **Workers & Pages → Create application → Create Worker**
3. نام را `panel` بگذارید → **Deploy**
4. روی ورکر کلیک کنید → **Edit code**
5. کل محتوای ادیتور را پاک کنید و **تمام فایل [`worker.js`](./worker.js)** را جایگذاری کنید (`Ctrl+A` → `Ctrl+V`)
6. **Deploy** را بزنید و آدرس `https://panel.<account>.workers.dev` را باز کنید

> رمز پیش‌فرض: **`simorgh`**

### روش ۲ — Wrangler (یک خط)

```bash
npx wrangler deploy worker.js --name panel --compatibility-date 2026-01-15
```

یا با فایل [`wrangler.toml`](./wrangler.toml):

```bash
npx wrangler login
npx wrangler deploy
```

### مرحله‌ی مهم: بارگذاری UI از گیت‌هاب

رابط کاربری از گیت‌هاب خوانده می‌شود:

1. یک مخزن بسازید و چهار فایل پروژه را در آن بگذارید:
   ```
   ui/index.html
   ui/style.css
   ui/app.js
   ```
2. در پنل وارد شوید → **پروتکل و کانفیگ → Fragment و FR**
3. مقدار `fr.repo` را به `username/repo` تغییر دهید و ذخیره کنید
4. صفحه را رفرش کنید (دکمه‌ی «بازخوانی» در **تنظیمات و پشتیبان → فایل‌های UI**)

> اگر گیت‌هاب در دسترس نباشد، ورکر پیام «بارگذاری رابط کاربری ناموفق بود» نشان می‌دهد. برای تست محلی می‌توانید فایل‌ها را در مخزن خودتان میزبانی کنید.

### مرحله‌ی مهم‌تر: ذخیره‌سازی پایدار (KV)

بدون KV، کاربران و تنظیمات با سرد شدن ورکر **ریست می‌شوند**:

```bash
npx wrangler kv namespace create KV_PERSIST
```

سپس در `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "KV"
id = "<KV_ID>"
```

یا از داشبورد: **Worker → Settings → Bindings → Add → KV Namespace → Variable name: `KV`**

متغیرهای اختیاری:

| متغیر | توضیح |
|---|---|
`MASTER_KEY` | رمز ورود پنل (بر ترتیب اولویت از تنظیمات داخلی) |

---

## 🧭 استفاده

### ۱) ساخت کاربر
**کاربران → کاربر جدید** → نام، سهمیه و انقضا را بدهید. UUID و رمز خودکار ساخته می‌شوند.

هر کاربر می‌تواند تنظیمات اختصاصی داشته باشد: حالت (Alpha/Beta/Both)، پورت‌ها، IPهای پاک، Proxy IP، Node، NAT64، Panel URL، محدودیت اتصال/IP/کانفیگ، سرعت و بلاک محتوا.

### ۲) گرفتن لینک ساب
**اشتراک** → کاربر را انتخاب کنید → کپی لینک یا QR.

```
https://panel.<account>.workers.dev/sub/<uuid>
```

| کلاینت | فرمت خودکار |
|---|---|
v2rayNG / v2rayN / Shadowrocket | Base64
Hiddify / Karing / Happ / Sing-box | Sing-box JSON
Clash Meta / Mihomo / FlClash | Clash Meta JSON
Clash | YAML
V2RayN (JSON) | V2Ray JSON |

تحمیل صریح فرمت: `?format=base64|raw|clash|meta|singbox|v2ray`

### ۳) افزودن کاربر در کلاینت
- **v2rayNG:** آیکون + → «کپی از کلیپ‌بورد» (لینک ساب را کپی کنید) → آیکون ⋮ → «به‌روزرسانی اشتراک»
- **Hiddify:** افزودن پروفایل → «لینک اشتراک» را بچسبانید
- **Clash Meta:** Profiles → لینک را وارد کنید

### ۴) صفحه‌ی وضعیت کاربر
```
https://panel.<account>.workers.dev/status/<username>
```
مصرف، باقیمانده و تاریخ انقضا را بدون ورود نشان می‌دهد.

---

## ⚙️ قابلیت‌ها

| بخش | امکانات |
|---|---|
**پروتکل** | VLESS (Alpha) • Trojan با SHA-224 (Beta) • Both • Shadowsocks • VMess • تقسیم مساوی چندپروتکله
**ترنسپورت** | WebSocket • gRPC • XHTTP • TCP Fast Open • Mux
**امنیت لایه‌ی انتقال** | TLS • uTLS fingerprint (randomized و…) • ECH • ALPN
**ضد فیلتر** | Fragment بسته (Shadowrocket/Happ/Custom) • Noise • جانک تصادفی مسیر • NAT64
**شبکه** | Clean IP با نام‌گذاری `ip#name` • Proxy IP با failover • Backup/Custom Relay • استخر per-ISP • GeoIP • race dial • DoH اختصاصی + پروکسی `/dns-query`
**کاربران** | سهمیه کل/روزانه • انقضا با غیرفعال‌سازی خودکار • محدودیت اتصال/IP/کانفیگ • speed limit • ریست مصرف
**اشتراک** | ۶ فرمت • تشخیص UA • کانفیگ فیک مصرف/انقضا • خط کانال تلگرام • converter API • قواعد روتینگ DOMAIN/IP-CIDR/GEOIP/GEOSITE • گروه‌بندی کشور
**ربات تلگرام** | ارسال واقعی اعلان (ورود، کاربر جدید، هشدارها) + ۲۰+ فرمان مدیریتی
**مانیتورینگ** | مصرف آپلود/دانلود هر کاربر • سری روزانه/ماهانه/سالانه • شمارش درخواست • uptime • نسخه/بیلد
**به‌روزرسانی** | بررسی واقعی از GitHub Releases • مقایسه نسخه • استقرار • rollback • انتشار به نودها
**چندپنلی** | Hub & Spoke • کلید per-node • همگام‌سازی • login signal
**امنیت پنل** | توکن JWT-مانند (HMAC-SHA256، ۲۴ ساعت) • 2FA واقعی (TOTP) • rate limit ۵ در ۱۰ دقیقه • چرخش مسیر ورود • Disguise با ۴ سایت پوششی • CSP/XFO/nosniff/CORS • Panic Mode • Kill Switch
**سیستمی** | کلیدهای API (تا ۱۰) • لاگ ۵۰ رویدادی • Backup/Restore • ریست کارخانه‌ای • health check دامنه

---

## 🔧 عیب‌یابی: «کانفیگ وصل نمی‌شود»

به‌ترتیب این موارد را بررسی کنید:

| مشکل | راه‌حل |
|---|---|
**SNI/Host اشتباه** | در **پروتکل و کانفیگ** فیلدهای `SNI` و `Host` را **خالی** بگذارید تا دامنه‌ی خود ورکر استفاده شود. اگر مقداری مثل `discordapp.com` باشد، کلاودفلر ترافیک را به سایت دیگری می‌فرستد و کانفیگ کار نمی‌کند.
**دامنه‌ی workers.dev فیلتر است** | به ورکر یک **دامنه‌ی اختصاصی** وصل کنید (Settings → Domains & Routes) و همان دامنه را در فیلد SNI بگذارید، یا از Clean IP به‌عنوان آدرس + دامنه‌ی خودتان به‌عنوان Host استفاده کنید.
**پروتکل خاموش است** | در تنظیمات، VLESS یا Trojan روشن باشد؛ اگر Shadowsocks/VMess فعال است بدانید که این دو در هسته‌ی تونل پیاده نشده‌اند (فقط در ساب تولید می‌شوند) — برای اتصال واقعی از VLESS یا Trojan استفاده کنید.
**UDP لازم دارید** | هسته‌ی فعلی فقط TCP را تونل می‌کند (دانلود و وب‌کامل کار می‌کند، بعضی بازی‌ها/تماس‌ها نه).
**مقصد فیلتر است** | در تنظیمات `Proxy IP` را پر کنید؛ خروجی از طریق آن relay می‌شود.
**Panic Mode فعال است** | دکمه‌ی قرمز `Panic` در نوار بالا را خاموش کنید.
**کاربر منقضی/غیرفعال** | در بخش کاربران وضعیت و سهمیه را بررسی کنید.

تست سلامت: `https://panel.<account>.workers.dev/health`

---

## 🗂 ساختار پروژه

```
worker.js        موتور: هسته‌ی تونل + API + سرویس اشتراک + امنیت
ui/index.html    پوسته‌ی پنل (اسپرایت آیکون + جای تزریق CSS/JS)
ui/style.css     سیستم طراحی (تم تاریک/روشن، RTL، ریسپانسیو)
ui/app.js        منطق سمت کلاینت (۱۲ نما، فرم‌های اسکیمامحور)
wrangler.toml    کانفیگ استقرار
DEPLOY.md        راهنمای استقرار گام‌به‌گام
src/             پنل نمایشی React/Vite (نمونه‌ی بصری، اختیاری)
```

> پوشه‌ی `src/` یک اپ نمایشی React برای پیش‌نمایش و مدیریت فایل‌ها است؛ **اجرا شدن پنل واقعی فقط به `worker.js` + فایل‌های `ui/` نیاز دارد.**

---

## 📡 API

| متد | مسیر | توضیح |
|---|---|---|
`POST` | `/api/login` | ورود `{password, totp}` → توکن JWT-مانند
`GET` | `/api/state` | وضعیت کامل (هدر `Authorization: Bearer`)
`PUT` | `/api/settings` | ذخیره‌ی تنظیمات (merge عمیق)
`POST` | `/api/users` | ساخت کاربر یا `{id, op: "update\|toggle\|reset\|delete"}`
`POST` | `/api/usage` | ثبت مصرف `{"uuid","up","down"}`
`GET/POST/DELETE` | `/api/keys` | مدیریت کلیدهای API
`GET/POST/DELETE` | `/api/panels` | پنل‌های لینک‌شده
`POST` | `/api/action` | `panic`، `rotate-path`، `2fa-secret`، `pw-change`، `ui-refresh`، `domain-health`، `tg-test`، `update-check/deploy/rollback`، `factory`، `restore`
`GET` | `/sub/<uuid>` | اشتراک
`GET` | `/status/<name>` | صفحه‌ی وضعیت کاربر
`GET` | `/dns-query?name=&type=` | پروکسی DoH برای کلاینت‌ها
`GET` | `/health` | سلامت ورکر

```bash
curl https://panel.<account>.workers.dev/health

curl -X POST https://panel.<account>.workers.dev/api/login \
  -H "content-type: application/json" -d '{"password":"simorgh"}'
```

---

## ⚠️ محدودیت‌ها و نکات

- هسته‌ی تونل فقط **TCP** را پشتیبانی می‌کند (UDP نه).
- **Shadowsocks و VMess** فقط در ساب تولید می‌شوند و توسط هسته‌ی تونل پذیرفته نمی‌شوند.
- مصرف ثبت‌شده تقریبی است (در بستن هر اتصال به‌روزرسانی می‌شود).
- استفاده از این پروژه برای دور زدن تحریم/فیلترینگ مسئولیت خود شماست؛ لطفاً از قوانین محلی پیروی کنید.

## 📄 مجوز

MIT

</div>
