export async function onRequest(context) {
  const url = new URL(context.request.url);
  const s1 = url.searchParams.get('symbol1') || 'شیراز';
  const s2 = url.searchParams.get('symbol2') || 'شپدیس';

  try {
    const insCode1 = await getInsCode(s1);
    const insCode2 = await getInsCode(s2);

    if (!insCode1 || !insCode2) {
      return new Response(JSON.stringify({ error: 'شناسه یکی از نمادها پیدا نشد' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const h1 = await getHistory(insCode1);
    const h2 = await getHistory(insCode2);

    if (!h1.length || !h2.length) {
      return new Response(JSON.stringify({ error: 'داده تاریخی خالی است' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    // ساخت نقشه تاریخ به قیمت پایانی
    const map1 = {}; const map2 = {};
    h1.forEach(item => { map1[item.date] = item.close; });
    h2.forEach(item => { map2[item.date] = item.close; });

    // پیدا کردن تاریخ‌های مشترک و محاسبه نسبت
    const dates = Object.keys(map1).filter(d => map2[d]).sort((a, b) => a - b);
    const ratios = [];

    dates.forEach(date => {
      let timestamp;
      try {
        // تبدیل تاریخ شمسی (YYYYMMDD) به timestamp
        const year = parseInt(date.substring(0, 4)) + 621; // تبدیل تقریبی شمسی به میلادی
        const month = parseInt(date.substring(4, 6)) - 1;
        const day = parseInt(date.substring(6, 8));
        timestamp = Math.floor(new Date(year, month, day).getTime() / 1000);
      } catch (e) {
        return;
      }
      if (!isNaN(timestamp) && timestamp > 0) {
        ratios.push({ time: timestamp, value: map1[date] / map2[date] });
      }
    });

    return new Response(JSON.stringify({ ratios }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'خطا: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// تابع کمکی برای دریافت InsCode از طریق APIهای مختلف
async function getInsCode(symbol) {
  // روش اول: cdn.tsetmc.com (بدون واسط، ممکن است بلاک شود)
  try {
    const res = await fetch(`https://cdn.tsetmc.com/api/Instrument/GetInstrumentSearch/${encodeURIComponent(symbol)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (res.ok) {
      const data = await res.json();
      const code = data.instrumentSearch?.[0]?.insCode;
      if (code) return code;
    }
  } catch (e) {}

  // روش دوم: webgw.tse.ir (گیتوی رسمی)
  try {
    const res = await fetch(`https://webgw.tse.ir/InstrumentProvider/api/v1/Symbol/GetSymbolList?search=${encodeURIComponent(symbol)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (res.ok) {
      const data = await res.json();
      const code = data?.data?.[0]?.insCode || data?.data?.[0]?.symbolCode;
      if (code) return code;
    }
  } catch (e) {}

  return null;
}

// تابع کمکی برای دریافت تاریخچه قیمت
async function getHistory(insCode) {
  // روش اول: cdn.tsetmc.com
  try {
    const res = await fetch(`https://cdn.tsetmc.com/api/ClosingPrice/GetClosingPriceDailyList/${insCode}/0`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (res.ok) {
      const data = await res.json();
      const list = data.closingPriceDaily || data.closingPrice || [];
      if (list.length) {
        return list.map(item => ({
          date: String(item.dEven || item.date),
          close: item.pClosing || item.pDrCotVal || item.close
        }));
      }
    }
  } catch (e) {}

  // روش دوم: webgw.tse.ir
  try {
    const res = await fetch(`https://webgw.tse.ir/InstrumentProvider/api/v1/ClosingPrice/GetClosingPriceDailyList/${insCode}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (res.ok) {
      const data = await res.json();
      const list = data?.data || [];
      if (list.length) {
        return list.map(item => ({
          date: String(item.dEven || item.date),
          close: item.pClosing || item.pDrCotVal || item.close
        }));
      }
    }
  } catch (e) {}

  return [];
}
