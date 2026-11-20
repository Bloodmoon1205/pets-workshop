// فحص موقع: يصوّره على جوال وكمبيوتر ويطبع فحوصات تلقائية.
// الاستعمال: node check.js path/to/index.html OUTPUT_DIR
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const [file, outDir = '.'] = process.argv.slice(2);
  if (!file) { console.error('الاستعمال: node check.js index.html OUTPUT_DIR'); process.exit(1); }
  fs.mkdirSync(outDir, { recursive: true });
  const url = file.startsWith('http') ? file : 'file://' + path.resolve(file);
  const browser = await chromium.launch();
  const results = [];
  const add = (name, ok, note = '') => results.push({ name, ok, note });

  // جوال
  const phone = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
  const errors = [];
  phone.on('pageerror', e => errors.push(e.message));
  phone.on('requestfailed', r => errors.push('فشل تحميل: ' + r.url()));
  await phone.goto(url, { waitUntil: 'networkidle' });
  await phone.screenshot({ path: path.join(outDir, 'mobile-first-screen.png') }); // أول شي يشوفه الزائر، والزر الثابت في مكانه الصح
  await phone.screenshot({ path: path.join(outDir, 'mobile.png'), fullPage: true }); // الصفحة كاملة (الزر الثابت يطلع في نصها، عادي)

  const info = await phone.evaluate(() => {
    const html = document.documentElement;
    const imgs = [...document.images];
    const links = [...document.querySelectorAll('a[href]')];
    const small = [...document.querySelectorAll('a, button')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.height < 40 || r.width < 40);
    });
    return {
      dir: html.getAttribute('dir'),
      lang: html.getAttribute('lang'),
      title: document.title,
      desc: document.querySelector('meta[name=description]')?.content || '',
      viewport: !!document.querySelector('meta[name=viewport]'),
      h1: document.querySelectorAll('h1').length,
      overflow: html.scrollWidth - html.clientWidth,
      noAlt: imgs.filter(i => !i.hasAttribute('alt')).length,
      emptyLinks: links.filter(a => ['#', ''].includes(a.getAttribute('href'))).length,
      waLinks: links.map(a => decodeURIComponent(a.getAttribute('href'))).filter(h => /wa\.me|whatsapp/.test(h)),
      missing: [...new Set((document.title + ' ' + document.body.innerText + ' ' +
        links.map(a => decodeURIComponent(a.getAttribute('href'))).join(' ')).match(/\[ناقص[^\]]*\]/g) || [])],
      smallTargets: small.length,
      fontSize: parseFloat(getComputedStyle(document.body).fontSize),
    };
  });

  add('اتجاه عربي dir="rtl"', info.dir === 'rtl', info.dir || 'مو موجود');
  add('لغة lang="ar"', info.lang === 'ar', info.lang || 'مو موجود');
  add('عنوان الصفحة title', !!info.title, info.title);
  add('وصف لجوجل description', info.desc.length >= 50, `${info.desc.length} حرف (الأفضل 50 إلى 160)`);
  add('مضبوط للجوال viewport', info.viewport);
  add('عنوان h1 واحد بس', info.h1 === 1, `${info.h1} عنوان`);
  add('ما فيه سكرول جانبي في الجوال', info.overflow <= 0, info.overflow > 0 ? `أعرض بـ ${info.overflow}px` : '');
  add('كل الصور فيها وصف alt', info.noAlt === 0, info.noAlt ? `${info.noAlt} صورة بدون وصف` : '');
  add('ما فيه روابط فاضية', info.emptyLinks === 0, info.emptyLinks ? `${info.emptyLinks} رابط يروح لـ #` : '');
  const badWa = info.waLinks.filter(h => !/^https:\/\/wa\.me\/968\d{8}(\?.*)?$/.test(h));
  add('زر واتساب موجود', info.waLinks.length > 0);
  add('رابط الواتساب صحيح (wa.me/968 + 8 أرقام)', info.waLinks.length > 0 && badWa.length === 0,
    badWa.length ? `${badWa.length} رابط خربان: ${badWa[0]}` : '');
  add('حجم النص 16px أو أكثر', info.fontSize >= 16, `${info.fontSize}px`);
  add('الأزرار كبيرة كفاية للإصبع (40px)', info.smallTargets === 0, info.smallTargets ? `${info.smallTargets} زر صغير` : '');
  add('ما فيه معلومات ناقصة', info.missing.length === 0, info.missing.join('، '));
  add('ما فيه أخطاء في التحميل', errors.length === 0, errors.slice(0, 3).join(' | '));

  // كمبيوتر
  const desk = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await desk.goto(url, { waitUntil: 'networkidle' });
  await desk.screenshot({ path: path.join(outDir, 'desktop.png'), fullPage: true });
  await browser.close();

  for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.note ? ' — ' + r.note : ''}`);
  const bad = results.filter(r => !r.ok).length;
  console.log(`\n${bad === 0 ? 'كل الفحوصات التلقائية نجحت.' : bad + ' فحص فيه مشكلة.'} الصور في: ${path.resolve(outDir)}`);
  console.log('تذكير: شوف mobile-first-screen.png وmobile.png وdesktop.png بعينك قبل ما تقول جاهز.');
})();
