export async function onRequest(context) {
  const url = new URL(context.request.url);
  const symbol1 = url.searchParams.get('symbol1') || 'شیراز';
  const symbol2 = url.searchParams.get('symbol2') || 'شپدیس';

  try {
    const insCode1 = await getInsCode(symbol1);
    const insCode2 = await getInsCode(symbol2);

    if (!insCode1 || !insCode2) {
      return new Response(JSON.stringify({ error: 'یکی از نمادها یافت نشد' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const history1 = await getPriceHistory(insCode1);
    const history2 = await getPriceHistory(insCode2);

    const map1 = {};
    history1.forEach(item => { map1[item.dEven] = item.pClosing || item.pDrCotVal; });
    
    const map2 = {};
    history2.forEach(item => { map2[item.dEven] = item.pClosing || item.pDrCotVal; });

    const ratios = [];
    const dates = Object.keys(map1).filter(date => map2[date]).sort((a, b) => a - b);

    dates.forEach(date => {
      const dateStr = date.toString();
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1;
      const day = parseInt(dateStr.substring(6, 8));
      const timestamp = Math.floor(new Date(year, month, day).getTime() / 1000);

      ratios.push({
        time: timestamp,
        value: map1[date] / map2[date]
      });
    });

    return new Response(JSON.stringify({ ratios }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'خطا در ارتباط با سرور بورس' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

async function getInsCode(symbol) {
  const res = await fetch(`https://cdn.tsetmc.com/api/Instrument/GetInstrumentSearch/${encodeURIComponent(symbol)}`);
  const data = await res.json();
  return data.instrumentSearch?.[0]?.insCode || null;
}

async function getPriceHistory(insCode) {
  const res = await fetch(`https://cdn.tsetmc.com/api/ClosingPrice/GetClosingPriceDailyList/${insCode}/0`);
  const data = await res.json();
  return data.closingPrice || [];
}
