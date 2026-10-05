export async function onRequest(context) {
  const url = new URL(context.request.url);
  const s1 = url.searchParams.get('symbol1') || 'شیراز';
  const s2 = url.searchParams.get('symbol2') || 'شپدیس';

  try {
    // دریافت کد نماد از API brsapi.ir
    const code1 = await getSymbolCode(s1);
    const code2 = await getSymbolCode(s2);

    if (!code1 || !code2) {
      return new Response(JSON.stringify({ error: 'نماد پیدا نشد' }), { status: 404 });
    }

    // دریافت تاریخچه قیمت
    const h1 = await getHistory(code1);
    const h2 = await getHistory(code2);

    if (!h1 || !h2 || h1.length === 0 || h2.length === 0) {
      return new Response(JSON.stringify({ error: 'داده تاریخی خالی است' }), { status: 404 });
    }

    const map1 = {}; const map2 = {};
    h1.forEach(item => { map1[item.date] = item.close; });
    h2.forEach(item => { map2[item.date] = item.close; });

    const dates = Object.keys(map1).filter(d => map2[d]).sort((a,b) => a-b);
    const ratios = [];

    dates.forEach(date => {
      let timestamp;
      try {
        if (date.includes('/')) {
          const p = date.split('/');
          timestamp = Math.floor(new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2])).getTime() / 1000);
        } else {
          timestamp = Math.floor(new Date(date).getTime() / 1000);
        }
      } catch(e) { return; }
      if (!isNaN(timestamp) && timestamp > 0) {
        ratios.push({ time: timestamp, value: map1[date] / map2[date] });
      }
    });

    return new Response(JSON.stringify({ ratios }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'خطا: ' + error.message }), { status: 500 });
  }
}

async function getSymbolCode(symbol) {
  const res = await fetch(`https://api.brsapi.ir/api/v1/Symbol/GetSymbolList?search=${encodeURIComponent(symbol)}`);
  const data = await res.json();
  if (data && data.data && data.data.length > 0) {
    return data.data[0].insCode || data.data[0].symbolCode;
  }
  return null;
}

async function getHistory(code) {
  const res = await fetch(`https://api.brsapi.ir/api/v1/Symbol/GetDailyHistory?insCode=${code}`);
  const data = await res.json();
  if (data && data.data) {
    return data.data.map(item => ({
      date: item.date,
      close: item.pClosing || item.pDrCotVal
    }));
  }
  return [];
}
