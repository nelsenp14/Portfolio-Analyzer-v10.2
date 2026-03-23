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
    var validRanges = { "5d": "15m", "1mo": "1h", "3mo": "1d", "6mo": "1d", "1y": "1d", "3y": "1wk", "5y": "1wk" };
    var interval = validRanges[range] || "1d";
    try {
      var cUrl;
      if (isCryptoSym) {
        // For crypto: use period1/period2 with query1 — most reliable for full history
        var rangeDays = {"5d":5,"1mo":30,"3mo":90,"6mo":182,"1y":365,"3y":1095,"5y":1826};
        var days = rangeDays[range] || 365;
        var now = Math.floor(Date.now() / 1000);
        var start = now - (days * 86400);
        var cryptoInterval = days <= 5 ? "15m" : days <= 30 ? "1h" : days <= 365 ? "1d" : "1wk";
        cUrl = "https://query1.finance.yahoo.com/v8/finance/chart/" +
          encodeURIComponent(symbol) + "?period1=" + start + "&period2=" + now +
          "&interval=" + cryptoInterval + "&includePrePost=false";
      } else {
        cUrl = "https://query1.finance.yahoo.com/v8/finance/chart/" +
          encodeURIComponent(symbol) + "?range=" + range + "&interval=" + interval;
      }
      var cRes = await fetch(cUrl, { headers: headers });
      var cData = await cRes.json();
      var cResult = cData && cData.chart && cData.chart.result && cData.chart.result[0];
      // Fallback: try query2 if query1 fails
      if (!cResult) {
        var fb = cUrl.replace("query1", "query2");
        var fbRes = await fetch(fb, { headers: headers });
        var fbData = await fbRes.json();
        cResult = fbData && fbData.chart && fbData.chart.result && fbData.chart.result[0];
      }
      // Fallback 2: for crypto try range=max
      if (!cResult && isCryptoSym) {
        var fb2 = "https://query1.finance.yahoo.com/v8/finance/chart/" +
          encodeURIComponent(symbol) + "?range=max&interval=1wk";
        var fb2Res = await fetch(fb2, { headers: headers });
        var fb2Data = await fb2Res.json();
        cResult = fb2Data && fb2Data.chart && fb2Data.chart.result && fb2Data.chart.result[0];
      }
      if (!cResult) return res.status(200).json({ error: "No data", debug: "all_fetches_failed" });
      var timestamps = cResult.timestamp || [];
      var quote = (cResult.indicators && cResult.indicators.quote && cResult.indicators.quote[0]) || {};
      var closes = quote.close || [];
      var highs = quote.high || [];
      var lows = quote.low || [];
      var volumes = quote.volume || [];
      var cmeta = cResult.meta || {};
      var curP = cmeta.regularMarketPrice || 0;
      var points = [];
      for (var ci = 0; ci < timestamps.length; ci++) {
        var px = closes[ci];
        if (px != null && px > 0) {
          points.push({ t: timestamps[ci] * 1000, c: px, v: volumes[ci] || 0 });
        }
      }
      // Fallback to high/low avg if close is empty
      if (points.length < 3 && highs.length > 0) {
        points = [];
        for (var ci3 = 0; ci3 < timestamps.length; ci3++) {
          var h = highs[ci3], l = lows[ci3];
          if (h != null && l != null && h > 0 && l > 0) {
            points.push({ t: timestamps[ci3] * 1000, c: (h + l) / 2, v: volumes[ci3] || 0 });
          }
        }
      }
      // Sanity check against known price
      if (points.length > 0 && curP > 0) {
        var lastC = points[points.length - 1].c;
        var pctOff = Math.abs(lastC - curP) / curP;
        if (pctOff > 0.5) {
          var sf = curP / lastC;
          for (var si = 0; si < points.length; si++) {
            points[si] = { t: points[si].t, c: points[si].c * sf, v: points[si].v };
          }
        }
      }
      // Downsample if huge
      if (points.length > 500) {
        var step = Math.ceil(points.length / 500);
        points = points.filter(function(pt, idx) { return idx % step === 0 || idx === points.length - 1; });
      }
      return res.status(200).json({
        symbol: symbol, range: range, points: points,
        currentPrice: curP, totalPoints: timestamps.length
      });
    } catch (ce) {
      return res.status(500).json({ error: ce.message });
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
