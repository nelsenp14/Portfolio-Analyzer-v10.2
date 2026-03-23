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
    var validRanges = { "5d": "15m", "1mo": "1h", "3mo": "1d", "6mo": "1d", "1y": "1d", "3y": "1wk", "5y": "1wk" };
    var interval = validRanges[range] || "1d";
    try {
      var cUrl = "https://query1.finance.yahoo.com/v8/finance/chart/" +
        encodeURIComponent(symbol) + "?range=" + range + "&interval=" + interval +
        "&includeAdjustedClose=true";
      var cRes = await fetch(cUrl, { headers: headers });
      var cData = await cRes.json();
      var cResult = cData && cData.chart && cData.chart.result && cData.chart.result[0];
      if (!cResult && (range === "3y" || range === "5y")) {
        var fbUrl = "https://query1.finance.yahoo.com/v8/finance/chart/" +
          encodeURIComponent(symbol) + "?range=max&interval=1wk&includeAdjustedClose=true";
        var fbRes = await fetch(fbUrl, { headers: headers });
        var fbData = await fbRes.json();
        cResult = fbData && fbData.chart && fbData.chart.result && fbData.chart.result[0];
      }
      if (!cResult) return res.status(200).json({ error: "No data" });
      var timestamps = cResult.timestamp || [];
      var quote = (cResult.indicators && cResult.indicators.quote && cResult.indicators.quote[0]) || {};
      var closes = quote.close || [];
      var volumes = quote.volume || [];
      var adjArr = (cResult.indicators && cResult.indicators.adjclose &&
        cResult.indicators.adjclose[0] && cResult.indicators.adjclose[0].adjclose) || [];
      var useAdj = adjArr.length === closes.length && adjArr.length > 0;
      var priceArr = useAdj ? adjArr : closes;
      var cmeta = cResult.meta || {};
      var curP = cmeta.regularMarketPrice || 0;
      var points = [];
      for (var ci = 0; ci < timestamps.length; ci++) {
        var px = priceArr[ci];
        if (px != null && px > 0) points.push({ t: timestamps[ci] * 1000, c: px, v: volumes[ci] || 0 });
      }
      if (points.length > 0 && curP > 0) {
        var lastP = points[points.length - 1].c;
        var ratio = lastP / curP;
        if (ratio < 0.2 || ratio > 5) {
          var altArr = useAdj ? closes : adjArr;
          if (altArr.length > 0) {
            points = [];
            for (var ci2 = 0; ci2 < timestamps.length; ci2++) {
              if (altArr[ci2] != null && altArr[ci2] > 0)
                points.push({ t: timestamps[ci2] * 1000, c: altArr[ci2], v: volumes[ci2] || 0 });
            }
          }
        }
      }
      if (points.length > 0 && (range === "3y" || range === "5y")) {
        var cutMs = range === "3y" ? 3 * 365.25 * 86400000 : 5 * 365.25 * 86400000;
        var cutoff = Date.now() - cutMs;
        points = points.filter(function(pt) { return pt.t >= cutoff; });
      }
      return res.status(200).json({ symbol: symbol, range: range, points: points });
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
