# -*- coding: utf-8 -*-
import io, re, sys

with io.open('new-subscription', 'r', encoding='utf-8') as f:
    s = f.read()
orig = s

def rep(old, new, count=1):
    global s
    if old not in s:
        print('MISSING:', old[:90].replace('\n', '\\n'))
        sys.exit(1)
    s = s.replace(old, new, count)

# ═══ ۱) HTML: حذف جدول نتایج و کادر کانفیگ بهترین آی‌پی ═══
rep('''            <div class="radar-table-wrap" id="radar-table-wrap">
                <table class="radar-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>IP</th>
                            <th id="radar-th-ping">تأخیر</th>
                            <th id="radar-th-jitter">جیتر</th>
                            <th id="radar-th-loss">لاس٪</th>
                        </tr>
                    </thead>
                    <tbody id="radar-results-body"></tbody>
                </table>
            </div>
            <div class="radar-best" id="radar-best">
                <div class="radar-best-label" id="radar-best-label">کانفیگ بهترین آی‌پی</div>
                <div class="radar-best-row">
                    <input type="text" class="radar-best-input en-font" id="radar-best-link" readonly value="">
                    <button class="ip-copy-btn" id="radar-copy-btn">
                        <i class="fa-solid fa-copy"></i> <span id="radar-copy-label">کپی</span>
                    </button>
                </div>
                <div class="radar-best-note" id="radar-best-note"></div>
            </div>
''',
'''            <div class="radar-status radar-status-ok" id="radar-status">آماده برای اسکن</div>
''', 0) if False else None

# نکته: radar-status را نگه می‌داریم؛ فقط جدول و best حذف می‌شوند
rep('''            <div class="radar-table-wrap" id="radar-table-wrap">
                <table class="radar-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>IP</th>
                            <th id="radar-th-ping">تأخیر</th>
                            <th id="radar-th-jitter">جیتر</th>
                            <th id="radar-th-loss">لاس٪</th>
                        </tr>
                    </thead>
                    <tbody id="radar-results-body"></tbody>
                </table>
            </div>
            <div class="radar-best" id="radar-best">
                <div class="radar-best-label" id="radar-best-label">کانفیگ بهترین آی‌پی</div>
                <div class="radar-best-row">
                    <input type="text" class="radar-best-input en-font" id="radar-best-link" readonly value="">
                    <button class="ip-copy-btn" id="radar-copy-btn">
                        <i class="fa-solid fa-copy"></i> <span id="radar-copy-label">کپی</span>
                    </button>
                </div>
                <div class="radar-best-note" id="radar-best-note"></div>
            </div>
''', '')

# ═══ ۲) CSS: حذف استایل‌های جدول و best ═══
c_start = s.index('        .radar-table-wrap {')
c_end = s.index('        .radar-start-btn {')
if c_start < c_end:
    s = s[:c_start] + s[c_end:]
else:
    # ترتیب متفاوت — حذف جداگانه
    print('unexpected css order'); sys.exit(1)
# .radar-best rules بعد از radar-start-btn مربوطه باقی مانده‌اند — پیدا و حذف
b_start = s.index('        .radar-best {')
b_end = s.index('\n', s.index('}', s.index('        .radar-best-input:focus')))
s = s[:b_start] + s[b_end + 1:]

# ═══ ۳) JS: حذف توابع نمایش و جایگزینی ارسال به پنل ═══
r_start = s.index('        function radarRenderResults(list) {')
r_end = s.index('        async function radarRun()', r_start)
s = s[:r_start] + s[r_end:]

rep('''                results.sort(function(a, b) { return a.score - b.score; });
                const top = results.slice(0, RADAR_KEEP);
                radarRenderResults(top);

                if (top.length > 0) {
                    statusEl.textContent = data.radarStatusDone.replace('{found}', results.length);
                    radarBuildBestConfig(top[0]);
                } else {
                    statusEl.textContent = data.radarStatusNoResult;
                }''',
'''                /* آی‌پی‌ها در صفحه نمایش داده نمی‌شوند — به پنل ارسال و
                   روی کانفیگ‌های همین کاربر اعمال می‌شوند */
                results.sort(function(a, b) { return a.score - b.score; });
                const top = results.slice(0, RADAR_KEEP).map(function(r) { return r.ip; });

                if (top.length === 0) {
                    statusEl.textContent = data.radarStatusNoResult;
                    return;
                }

                statusEl.textContent = data.radarStatusSaving;
                try {
                    const saveRes = await fetch(sanaeiClientData.subUrl.replace(/\\/$/, '') + '/radar-ips', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ ips: top })
                    });
                    const sj = await saveRes.json().catch(() => ({}));
                    if (saveRes.ok && sj.ok) {
                        statusEl.textContent = data.radarStatusSaved.replace('{count}', top.length);
                    } else {
                        statusEl.textContent = data.radarStatusSaveFail;
                    }
                } catch (e) {
                    statusEl.textContent = data.radarStatusSaveFail;
                }''')

# حذف listener دکمه‌ی کپی best
rep('''        document.getElementById("radar-copy-btn").addEventListener("click", function(e) {
            e.stopPropagation();
            const data = locales[currentLang] || locales.fa;
            const value = document.getElementById('radar-best-link').value;
            if (!value) return;
            const label = document.getElementById('radar-copy-label');
            navigator.clipboard.writeText(value).then(() => {
                label.textContent = data.actionCopied;
                this.style.background = "#22C55E";
                this.style.color = "#fff";
                setTimeout(() => {
                    label.textContent = data.copyBtnText;
                    this.style.background = "";
                    this.style.color = "";
                }, 2000);
            });
        });

''', '')

# خطوط زبانِ عناصر حذف‌شده
rep('''            document.getElementById("radar-best-label").innerText = data.radarBestLabel;
            document.getElementById("radar-copy-label").innerText = data.copyBtnText;
''', '')

# ═══ ۴) کلیدهای زبان: حذف کلیدهای جدول/best، افزودن کلیدهای ذخیره ═══
s = re.sub(r'[ \t]*radarThPing: "[^"]*", radarThJitter: "[^"]*", radarThLoss: "[^"]*",\s*\n', '', s)
s = re.sub(r'[ \t]*radarBestLabel: "[^"]*", radarBestNote: "[^"]*",\s*\n', '', s)

SAVE_KEYS = {
    'پایان اسکن - ': ('در حال ذخیره در پنل...', '{count} آی‌پی تمیز ذخیره و روی کانفیگ‌های شما اعمال شد', 'ذخیره‌ی آی‌پی‌ها در پنل ناموفق بود'),
    'Scan finished - ': ('Saving to panel...', '{count} clean IPs saved and applied to your configs', 'Failed to save IPs to the panel'),
    'Tarama bitti - ': ('Panele kaydediliyor...', '{count} temiz IP kaydedildi ve yapılandırmalarınıza uygulandı', 'IP\'ler panele kaydedilemedi'),
    'انتهى الفحص - ': ('جارٍ الحفظ في اللوحة...', 'تم حفظ {count} آي‌بي نظيف وتطبيقه على تكويناتك', 'فشل حفظ عناوين IP في اللوحة'),
}
lines = s.split('\n')
out = []
added = 0
for ln in lines:
    out.append(ln)
    if 'radarStatusDone:' in ln:
        for anchor, (saving, saved, fail) in SAVE_KEYS.items():
            if anchor in ln:
                indent = re.match(r'\s*', ln).group(0)
                out.append(indent + 'radarStatusSaving: "' + saving + '", radarStatusSaved: "' + saved + '", radarStatusSaveFail: "' + fail + '",')
                added += 1
                break
s = '\n'.join(out)
if added != 4:
    print('save keys added:', added); sys.exit(1)

# ═══ ۵) دسکتاپ: دو کارت آمار/تبلیغ هم‌اندازه ═══
rep('''            #screen-dashboard { display: grid; grid-template-columns: minmax(0,1.7fr) minmax(300px,.9fr); gap: 16px; align-items: start; }''',
'''            #screen-dashboard { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; align-items: stretch; }''')

with io.open('new-subscription', 'w', encoding='utf-8', newline='') as f:
    f.write(s)
print('OK, changed =', s != orig)
