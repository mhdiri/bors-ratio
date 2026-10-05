/**
 * TradingView Datafeed for Tehran Stock Exchange
 * Source: cdn.tsetmc.com (public API)
 * Supports Ratio Charts (Symbol1/Symbol2)
 */

const TSE_PROXY = 'https://cdn.tsetmc.com';

/* ═══════════════════════════════════════════════════════════
   Datafeed Object — مطابق استاندارد TradingView UDF
   ═══════════════════════════════════════════════════════════ */
const Datafeed = {
  /* ────── تنظیمات اولیه ────── */
  onReady: function(callback) {
    setTimeout(function() {
      callback({
        supported_resolutions: ['1D', '1W', '1M'],
        exchanges: [
          { value: 'TSE', name: 'Tehran Stock Exchange', desc: 'بورس تهران' }
        ],
        symbols_types: [
          { name: 'stock', value: 'stock' }
        ],
        supports_marks: false,
        supports_timescale_marks: false,
        supports_time: true
      });
    }, 0);
  },

  /* ────── جستجوی نماد ────── */
  searchSymbols: function(userInput, exchange, symbolType, onResultReadyCallback) {
    searchTSE(userInput).then(function(list) {
      const results = list.map(function(item) {
        return {
          symbol: item.symbol,
          full_name: item.symbol,
          description: item.name || item.symbol,
          exchange: 'TSE',
          ticker: item.symbol,
          type: 'stock'
        };
      });
      onResultReadyCallback(results);
    }).catch(function() {
      onResultReadyCallback([]);
    });
  },

  /* ────── اطلاعات نماد ────── */
  resolveSymbol: function(symbolName, onResolve, onError) {
    // پشتیبانی از نسبت: "شیراز/شپدیس"
    const parts = symbolName.split('/');
    const isRatio = parts.length === 2;

    getInsCode(parts[0]).then(function(code1) {
      if(isRatio) {
        return getInsCode(parts[1]).then(function(code2) {
          if(!code1 || !code2) throw new Error('Symbol not found');
          onResolve(buildSymbolInfo(symbolName, true));
        });
      }
      if(!code1) throw new Error('Symbol not found');
      onResolve(buildSymbolInfo(symbolName, false));
    }).catch(function(err) {
      onError(err.message);
    });
  },

  /* ────── دریافت کندل‌ها ────── */
  getBars: function(symbolInfo, resolution, periodParams, onResult, onError) {
    const from = periodParams.from;
    const to = periodParams.to;
    const firstDataRequest = periodParams.firstDataRequest;

    fetchBars(symbolInfo.name, resolution).then(function(bars) {
      // فیلتر بر اساس بازه درخواستی
      const filtered = bars.filter(function(b) {
        return b.time >= from && b.time <= to;
      });

      if(!filtered.length) {
        onResult([], { noData: false });
        return;
      }

      // آیا داده قدیمی‌تر موجود است؟
      const hasMore = bars.length > 0 && bars[0].time < from;

      onResult(filtered, { noData: !hasMore });
    }).catch(function(err) {
      console.error('[Datafeed] getBars error:', err);
      onError(err.message);
    });
  },

  /* ────── اشتراک لحظه‌ای (اختیاری) ────── */
  subscribeBars: function(symbolInfo, resolution, onRealtimeCallback, subscriberUID, onResetCacheNeededCallback) {
    // داده لحظه‌ای از بورس تهران در دسترس نیست؛ از polling استفاده می‌کنیم
    const interval = setInterval(function() {
      fetchBars(symbolInfo.name, resolution).then(function(bars) {
        if(bars.length) {
          onRealtimeCallback(bars[bars.length - 1]);
        }
      });
    }, 60000); // هر ۶۰ ثانیه

    subscriptions[subscriberUID] = interval;
  },

  unsubscribeBars: function(subscriberUID) {
    if(subscriptions[subscriberUID]) {
      clearInterval(subscriptions[subscriberUID]);
      delete subscriptions[subscriberUID];
    }
  },

  /* ────── زمان سرور ────── */
  getServerTime: function(callback) {
    callback(Math.floor(Date.now() / 1000));
  }
};

/* ═══════════════════════════════════════════════════════════
   Helper Functions
   ═══════════════════════════════════════════════════════════ */

const subscriptions = {};
const symbolCache = {};
const barsCache = {};

/* ساخت اطلاعات نماد */
function buildSymbolInfo(name, isRatio) {
  return {
    name: name,
    full_name: name,
    description: isRatio ? 'Ratio Chart' : name,
    type: 'stock',
    session: '0900-1230',
    timezone: 'Asia/Tehran',
    exchange: 'TSE',
    minmov: 1,
    pricescale: 10000,
    has_intraday: false,
    has_daily: true,
    has_weekly_and_monthly: true,
    supported_resolutions: ['1D', '1W', '1M'],
    volume_precision: 0,
    data_status: 'streaming',
    format: 'price'
  };
}

/* جستجوی نماد در لیست بازار */
async function searchTSE(query) {
  try {
    const res = await fetch(TSE_PROXY + '/api/ClosingPrice/GetMarketWatch?market=0&paperTypes%5B0%5D=1&paperTypes%5B1%5D=2&paperTypes%5B2%5D=3&paperTypes%5B3%5D=4&paperTypes%5B4%5D=5&paperTypes%5B5%5D=6&paperTypes%5B6%5D=7&paperTypes%5B7%5D=8&paperTypes%5B8%5D=9&withBestLimits=false&hEven=0&RefID=0');
    const data = await res.json();
    const list = data.marketwatch || data.marketWatch || [];
    if(!query) return list.slice(0, 30);
    return list.filter(function(x) {
      const sym = (x.lVal18AFC || '').trim();
      const name = (x.lVal30 || '').trim();
      return sym.indexOf(query) > -1 || name.indexOf(query) > -1;
    }).slice(0, 30);
  } catch(e) {
    console.error('[TSE] searchTSE error:', e);
    return [];
  }
}

/* دریافت InsCode از نماد */
async function getInsCode(symbol) {
  symbol = symbol.trim();
  if(symbolCache[symbol]) return symbolCache[symbol];

  try {
    // اگر نماد از قبل در لیست بازار موجود است
    const res = await fetch(TSE_PROXY + '/api/Instrument/GetInstrumentSearch/' + encodeURIComponent(symbol));
    const data = await res.json();
    const code = data.instrumentSearch && data.instrumentSearch[0] ? data.instrumentSearch[0].insCode : null;
    if(code) symbolCache[symbol] = code;
    return code;
  } catch(e) {
    console.error('[TSE] getInsCode error:', e);
    return null;
  }
}

/* دریافت تاریخچه OHLC برای یک نماد */
async function getHistory(insCode) {
  try {
    const res = await fetch(TSE_PROXY + '/api/ClosingPrice/GetClosingPriceDailyList/' + insCode + '/0');
    const data = await res.json();
    return data.closingPriceDaily || data.closingPrice || [];
  } catch(e) {
    console.error('[TSE] getHistory error:', e);
    return [];
  }
}

/* دریافت و ساخت کندل‌های نهایی (نسبت یا تک‌نماد) */
async function fetchBars(symbolName, resolution) {
  const cacheKey = symbolName + '_' + resolution;
  if(barsCache[cacheKey]) return barsCache[cacheKey];

  const parts = symbolName.split('/');
  const isRatio = parts.length === 2;

  const code1 = await getInsCode(parts[0]);
  if(!code1) return [];

  let h1 = await getHistory(code1);
  if(!h1.length) return [];

  let bars;

  if(isRatio) {
    const code2 = await getInsCode(parts[1]);
    if(!code2) return [];
    const h2 = await getHistory(code2);

    bars = buildRatioBars(h1, h2);
  } else {
    bars = buildSingleBars(h1);
  }

  // تجمیع بر اساس تایم‌فریم
  if(resolution === '1W') bars = aggregateWeekly(bars);
  else if(resolution === '1M') bars = aggregateMonthly(bars);

  barsCache[cacheKey] = bars;
  return bars;
}

/* ساخت کندل از یک نماد */
function buildSingleBars(h) {
  const bars = [];
  const seen = {};
  for(let i = 0; i < h.length; i++) {
    const x = h[i];
    const c = x.pClosing || x.pDrCotVal;
    if(!c || c <= 0) continue;
    const ts = dateToTs(x.dEven);
    if(ts === null || seen[ts]) continue;
    seen[ts] = true;
    bars.push({
      time: ts * 1000,
      open: x.priceFirst || c,
      high: x.pMax || c,
      low: x.pMin || c,
      close: c,
      volume: x.qTotTran5J || 0
    });
  }
  bars.sort(function(a, b) { return a.time - b.time; });
  return bars;
}

/* ساخت کندل نسبت بین دو نماد */
function buildRatioBars(h1, h2) {
  const m1 = {}, m2 = {};
  h1.forEach(function(x) {
    const c = x.pClosing || x.pDrCotVal;
    if(c > 0) m1[String(x.dEven)] = {
      o: x.priceFirst || c,
      h: x.pMax || c,
      l: x.pMin || c,
      c: c
    };
  });
  h2.forEach(function(x) {
    const c = x.pClosing || x.pDrCotVal;
    if(c > 0) m2[String(x.dEven)] = {
      o: x.priceFirst || c,
      h: x.pMax || c,
      l: x.pMin || c,
      c: c
    };
  });

  const dates = Object.keys(m1).filter(function(d) { return m2[d]; }).sort();
  const bars = [];
  let prevClose = null;

  for(let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const ts = dateToTs(d);
    if(ts === null) continue;

    const rOpen = prevClose !== null ? prevClose : m1[d].o / m2[d].o;
    const rClose = m1[d].c / m2[d].c;
    const rHigh = Math.max(rOpen, rClose, m1[d].h / m2[d].h);
    const rLow = Math.min(rOpen, rClose, m1[d].l / m2[d].l);

    bars.push({
      time: ts * 1000,
      open: rOpen,
      high: rHigh,
      low: rLow,
      close: rClose,
      volume: 0
    });

    prevClose = rClose;
  }
  return bars;
}

/* تبدیل تاریخ میلادی YYYYMMDD به Unix timestamp (ثانیه) */
function dateToTs(s) {
  s = String(s);
  if(s.length !== 8) return null;
  const y = +s.substring(0, 4);
  const m = +s.substring(4, 6);
  const d = +s.substring(6, 8);
  if(y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000);
}

/* تجمیع هفتگی */
function aggregateWeekly(bars) {
  const out = [];
  let bucket = null;
  let bucketKey = null;

  for(let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const d = new Date(b.time);
    const day = d.getUTCDay() || 7;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - day + 1);
    monday.setUTCHours(0, 0, 0, 0);
    const key = monday.getTime();

    if(bucketKey === null || key !== bucketKey) {
      if(bucket) out.push(bucket);
      bucket = {
        time: key,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume
      };
      bucketKey = key;
    } else {
      if(b.high > bucket.high) bucket.high = b.high;
      if(b.low < bucket.low) bucket.low = b.low;
      bucket.close = b.close;
      bucket.volume += b.volume;
    }
  }
  if(bucket) out.push(bucket);
  return out;
}

/* تجمیع ماهانه */
function aggregateMonthly(bars) {
  const out = [];
  let bucket = null;
  let bucketKey = null;

  for(let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const d = new Date(b.time);
    const key = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);

    if(bucketKey === null || key !== bucketKey) {
      if(bucket) out.push(bucket);
      bucket = {
        time: key,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume
      };
      bucketKey = key;
    } else {
      if(b.high > bucket.high) bucket.high = b.high;
      if(b.low < bucket.low) bucket.low = b.low;
      bucket.close = b.close;
      bucket.volume += b.volume;
    }
  }
  if(bucket) out.push(bucket);
  return out;
}

/* در دسترس قرار دادن Datafeed */
window.TSEDatafeed = Datafeed;
