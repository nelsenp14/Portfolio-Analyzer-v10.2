module.exports = async function handler(req, res) {
  var symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: "Missing symbol" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  var headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  // Chart mode: return historical price data
  if (req.query.mode === "chart") {
    var range = req.query.range || "1mo";
    var isCryptoSym = symbol.indexOf("-USD") > -1 || symbol.indexOf("-EUR") > -1 || symbol.indexOf("-GBP") > -1;
    try {
      // Simple approach: for crypto 3y/5y use max, for everything else use range directly
      var useRange = range;
      var useInterval = {"5d":"15m","1mo":"1h","3mo":"1d","6mo":"1d","1y":"1d","3y":"1wk","5y":"1wk"}[range] || "1d";
      if (range === "max") {
        useRange = "max";
        useInterval = "1wk";
      } else if (isCryptoSym && (range === "3y" || range === "5y")) {
        useRange = "max";
        useInterval = "1wk";
      }
      var cUrl = "https://query1.finance.yahoo.com/v8/finance/chart/" +
        encodeURIComponent(symbol) + "?range=" + useRange + "&interval=" + useInterval;
      var cRes = await fetch(cUrl, { headers: headers });
      var cData = await cRes.json();
      var cResult = cData && cData.chart && cData.chart.result && cData.chart.result[0];
      if (!cResult) return res.status(200).json({ error: "No data" });
      var timestamps = cResult.timestamp || [];
      var quote = (cResult.indicators && cResult.indicators.quote && cResult.indicators.quote[0]) || {};
      var closes = quote.close || [];
      var volumes = quote.volume || [];
      var cmeta = cResult.meta || {};
      var curP = cmeta.regularMarketPrice || 0;
      var points = [];
      for (var ci = 0; ci < timestamps.length; ci++) {
        if (closes[ci] != null && closes[ci] > 0)
          points.push({ t: timestamps[ci] * 1000, c: closes[ci], v: volumes[ci] || 0 });
      }
      // Sanity check
      if (points.length > 0 && curP > 0) {
        var lastC = points[points.length - 1].c;
        var pctOff = Math.abs(lastC - curP) / curP;
        if (pctOff > 0.5) {
          var sf = curP / lastC;
          points = points.map(function(pt) { return { t: pt.t, c: pt.c * sf, v: pt.v }; });
        }
      }
      // Trim max results to 3y/5y window
      if (useRange === "max" && range !== "max" && points.length > 0) {
        var cutDays = range === "3y" ? 1095 : 1826;
        var cutoff = Date.now() - (cutDays * 86400000);
        var trimmed = points.filter(function(pt) { return pt.t >= cutoff; });
        if (trimmed.length > 3) points = trimmed;
      }
      // Downsample
      if (points.length > 500) {
        var step = Math.ceil(points.length / 500);
        points = points.filter(function(pt, idx) { return idx % step === 0 || idx === points.length - 1; });
      }
      return res.status(200).json({ symbol: symbol, range: range, points: points, currentPrice: curP });
    } catch (ce) {
      return res.status(500).json({ error: ce.message });
    }
  }

  // Market cap mode: get raw market cap from chart meta (no auth needed)
  if (req.query.mode === "mcap") {
    try {
      var mcUrl = "https://query1.finance.yahoo.com/v8/finance/chart/" +
        encodeURIComponent(symbol) + "?range=1d&interval=1d";
      var mcRes = await fetch(mcUrl, { headers: headers });
      var mcData = await mcRes.json();
      var mcMeta = mcData && mcData.chart && mcData.chart.result && mcData.chart.result[0] && mcData.chart.result[0].meta;
      // Try to get market cap from regularMarketPrice * sharesOutstanding (if available)
      var price2 = mcMeta ? mcMeta.regularMarketPrice || 0 : 0;
      // Return what we have — frontend will use batch data if available
      return res.status(200).json({ symbol: symbol, price: price2 });
    } catch(e5) {
      return res.status(200).json({ symbol: symbol, price: 0 });
    }
  }

  try {
    // Get price from chart endpoint (no auth needed)
    var chartUrl = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + "?range=5d&interval=1d";
    var chartRes = await fetch(chartUrl, { headers: headers });
    var chartData = await chartRes.json();
    var meta = chartData && chartData.chart && chartData.chart.result && chartData.chart.result[0] && chartData.chart.result[0].meta;

    if (!meta || !meta.regularMarketPrice) {
      return res.status(200).json({ error: "No price data for " + symbol });
    }

    var result = {
      currentPrice: meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose || meta.previousClose || 0,
      companyName: meta.shortName || meta.longName || symbol,
      volume: meta.regularMarketVolume || 0,
      sector: "",
      industry: "",
      beta: 0,
      pe: 0,
      dividendYield: 0,
      annualDividendPerShare: 0,
      marketCap: ""
    };

    // Try to get details via crumb auth
    try {
      var cookieRes = await fetch("https://fc.yahoo.com", { redirect: "manual", headers: headers });
      var rawCookies = cookieRes.headers.getSetCookie ? cookieRes.headers.getSetCookie() : [];
      if (!rawCookies.length) {
        var sc = cookieRes.headers.get("set-cookie") || "";
        rawCookies = sc.split(/,(?=[^ ])/);
      }
      var cookies = rawCookies.map(function(c) { return c.split(";")[0].trim(); }).filter(Boolean).join("; ");

      if (cookies) {
        var crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
          headers: Object.assign({}, headers, { "Cookie": cookies })
        });
        var crumb = await crumbRes.text();

        if (crumb && crumb.length < 50) {
          var detailUrl = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/" +
            encodeURIComponent(symbol) +
            "?modules=summaryProfile,summaryDetail,defaultKeyStatistics&crumb=" +
            encodeURIComponent(crumb);
          var detailRes = await fetch(detailUrl, {
            headers: Object.assign({}, headers, { "Cookie": cookies })
          });
          var detailData = await detailRes.json();
          var qr = detailData && detailData.quoteSummary && detailData.quoteSummary.result && detailData.quoteSummary.result[0];

          if (qr) {
            var profile = qr.summaryProfile || {};
            var detail = qr.summaryDetail || {};
            var stats = qr.defaultKeyStatistics || {};
            result.sector = profile.sector || "";
            result.industry = profile.industry || "";
            result.beta = (stats.beta && stats.beta.raw) || (detail.beta3Year && detail.beta3Year.raw) || 0;
            result.pe = (detail.trailingPE && detail.trailingPE.raw) || 0;
            var dy = (detail.dividendYield && detail.dividendYield.raw) ? detail.dividendYield.raw * 100 : 0;
            if (!dy && detail.yield && detail.yield.raw) dy = detail.yield.raw * 100;
            if (!dy && detail.trailingAnnualDividendYield && detail.trailingAnnualDividendYield.raw) dy = detail.trailingAnnualDividendYield.raw * 100;
            if (!dy && stats.yield && stats.yield.raw) dy = stats.yield.raw * 100;
            result.dividendYield = dy;
            var divRate = (detail.dividendRate && detail.dividendRate.raw) || 0;
            if (!divRate && detail.trailingAnnualDividendRate && detail.trailingAnnualDividendRate.raw) divRate = detail.trailingAnnualDividendRate.raw;
            result.annualDividendPerShare = divRate;
            var mc = (detail.marketCap && detail.marketCap.raw) || 0;
            result.marketCap = mc >= 1e12 ? (mc/1e12).toFixed(1)+"T" : mc >= 1e9 ? (mc/1e9).toFixed(1)+"B" : mc > 0 ? (mc/1e6).toFixed(0)+"M" : "";
          }
        }
      }
    } catch(e2) {
      // Details failed, still return price
    }

    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
