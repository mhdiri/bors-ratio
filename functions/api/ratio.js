export async function onRequest(context) {
  const url = new URL(context.request.url);
  const s1 = url.searchParams.get('symbol1') || 'شیراز';
  const s2 = url.searchParams.get('symbol2') || 'شپدیس';

  try {
    // دریافت داده از API رایگان codebazan.ir (بدون نیاز به پروکسی)
    const res1 = await fetch(`https://api.codebazan.ir/bours/?type=تاریخی&symbol=${encodeURIComponent(s1)}`);
    const res2 = await fetch(`https://api.codebazan.ir/bours/?type=تاریخی&symbol=${encodeURIComponent(s2)}`);
    
    const data1 = await res1.json();
    const data2 = await res2.json();

    if (!data1 || !data2) {
      return new Response(JSON.stringify({ error: 'داده‌ای یافت نشد' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    // استخراج قیمت‌های پایانی
    const map1 = {};
    const map2 = {};

    // فرمت داده‌های codebazan.ir ممکن است متفاوت باشد، اینجا فرض بر این است که آرایه‌ای از آبجکت‌هاست
    const arr1 = Array.isArray(data1) ? data1 : (data1.data || []);
    const arr2 = Array.isArray(data2) ? data2 : (data2.data || []);

    arr1.forEach(item => {
      const date = item.date || item[0];
      const price = item.close || item.pClosing || item[5];
      if (date && price) map1[date] = parseFloat(price);
    });

    arr2.forEach(item => {
      const date = item.date || item[0];
      const price = item.close || item.pClosing || item[5];
      if (date && price) map2[date] = parseFloat(price);
    });

    // محاسبه نسبت در تاریخ‌های مشترک
    const ratios = [];
    const dates = Object.keys(map1).filter(date => map2[date]).sort((a, b) => a - b);

    dates.forEach(date => {
      // تبدیل تاریخ به فرمت Unix Timestamp برای نمودار
      let timestamp;
      try {
        // اگر تاریخ به فرمت YYYYMMDD باشد
        if (date.length === 8 && !isNaN(date)) {
          const year = parseInt(date.substring(0, 4));
          const month = parseInt(date.substring(4, 6)) - 1;
          const day = parseInt(date.substring(6, 8));
          timestamp = Math.floor(new Date(year, month, day).getTime() / 1000);
        } else {
          timestamp = Math.floor(new Date(date).getTime() / 1000);
        }
      } catch (e) {
        return; // از تاریخ‌های نامعتبر صرف نظر کن
      }

      ratios.push({
        time: timestamp,
        value: map1[date] / map2[date]
      });
    });

    return new Response(JSON.stringify({ ratios }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'خطای داخلی: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
