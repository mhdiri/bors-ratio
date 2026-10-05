export async function onRequest(context) {
  const url = new URL(context.request.url);
  const s1 = url.searchParams.get('symbol1') || 'شیراز';
  const s2 = url.searchParams.get('symbol2') || 'شپدیس';

  try {
    // دریافت داده از API رایگان codebazan.ir
    const res1 = await fetch(`https://api.codebazan.ir/bours/?type=تاریخی&symbol=${encodeURIComponent(s1)}`);
    const text1 = await res1.text();
    let data1;
    try { data1 = JSON.parse(text1); } catch(e) { return new Response(JSON.stringify({error: 'خطای API سهم ۱: ' + text1.substring(0, 100)}), {status: 500}); }

    const res2 = await fetch(`https://api.codebazan.ir/bours/?type=تاریخی&symbol=${encodeURIComponent(s2)}`);
    const text2 = await res2.text();
    let data2;
    try { data2 = JSON.parse(text2); } catch(e) { return new Response(JSON.stringify({error: 'خطای API سهم ۲: ' + text2.substring(0, 100)}), {status: 500}); }

    const arr1 = Array.isArray(data1) ? data1 : (data1.result || data1.data || data1.bours || data1.history || []);
    const arr2 = Array.isArray(data2) ? data2 : (data2.result || data2.data || data2.bours || data2.history || []);

    if (arr1.length === 0 || arr2.length === 0) {
      return new Response(JSON.stringify({ error: 'داده خالی برگشت. نمونه: ' + JSON.stringify(arr1.length ? arr1[0] : data1).substring(0, 100) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const map1 = {}; 
    const map2 = {};
    
    arr1.forEach(item => {
      let date, price;
      if (Array.isArray(item)) { date = item[0]; price = item[4] || item[5] || item[1]; } 
      else { date = item.date || item.Date || item[0]; price = item.close || item.pClosing || item.Close || item[1] || item[4]; }
      if (date && price) map1[String(date)] = parseFloat(price);
    });

    arr2.forEach(item => {
      let date, price;
      if (Array.isArray(item)) { date = item[0]; price = item[4] || item[5] || item[1]; } 
      else { date = item.date || item.Date || item[0]; price = item.close || item.pClosing || item.Close || item[1] || item[4]; }
      if (date && price) map2[String(date)] = parseFloat(price);
    });

    const ratios = [];
    const dates = Object.keys(map1).filter(date => map2[date]).sort((a, b) => a - b);

    dates.forEach(date => {
      let timestamp;
      try {
        if (date.includes('/')) {
          const p = date.split('/');
          timestamp = Math.floor(new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2])).getTime() / 1000);
        } else if (date.includes('-')) {
          const p = date.split('-');
          timestamp = Math.floor(new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2])).getTime() / 1000);
        } else if (date.length === 8) {
          timestamp = Math.floor(new Date(parseInt(date.substring(0,4)), parseInt(date.substring(4,6))-1, parseInt(date.substring(6,8))).getTime() / 1000);
        } else {
          timestamp = Math.floor(new Date(date).getTime() / 1000);
        }
      } catch (e) { return; }

      if (!isNaN(timestamp) && timestamp > 0) {
        ratios.push({ time: timestamp, value: map1[date] / map2[date] });
      }
    });

    return new Response(JSON.stringify({ ratios }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'خطای شبکه: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
