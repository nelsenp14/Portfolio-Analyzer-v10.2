module.exports = async function handler(req, res) {
  var symbols = req.query.symbols;
  if (!symbols) return res.status(400).json({ error: "Missing symbols" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  var tickers = symbols.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
  if (!tickers.length) return res.status(400).json({ error: "No valid symbols" });

  var headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  var results = {};

  // Auth once
  var cookies = "";
  var crumb = "";
  try {
    var cookieRes = await fetch("https://fc.yahoo.com", { redirect: "manual", headers: headers });
    var rawCookies = cookieRes.headers.getSetCookie ? cookieRes.headers.getSetCookie() : [];
    if (!rawCookies.length) {
      var sc = cookieRes.headers.get("set-cookie") || "";
      rawCookies = sc.split(/,(?=[^ ])/);
    }
    cookies = rawCookies.map(function(c) { return c.split(";")[0].trim(); }).filter(Boolean).join("; ");
    if (cookies) {
      var crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
        headers: Object.assign({}, headers, { "Cookie": cookies })
      });
      crumb = await crumbRes.text();
      if (crumb && crumb.length > 50) crumb = "";
    }
  } catch(e) {}

  // Fetch all tickers in parallel (all at once)
  var promises = tickers.map(function(sym) {
    return (async function() {
      try {
        var chartUrl = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym) + "?range=5d&interval=1d";
        var chartRes = await fetch(chartUrl, { headers: headers });
        var chartData = await chartRes.json();
        var meta = chartData && chartData.chart && chartData.chart.result && chartData.chart.result[0] && chartData.chart.result[0].meta;
        if (!meta || !meta.regularMarketPrice) return;

        var item = {
          currentPrice: meta.regularMarketPrice,
          previousClose: meta.chartPreviousClose || meta.previousClose || 0,
          companyName: meta.shortName || meta.longName || sym,
          sector: "", industry: "", beta: 0, pe: 0,
          dividendYield: 0, annualDividendPerShare: 0, marketCap: ""
        };

        if (crumb && cookies) {
          try {
            var detailUrl = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/" +
              encodeURIComponent(sym) +
              "?modules=summaryProfile,summaryDetail,defaultKeyStatistics,calendarEvents&crumb=" +
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
              item.sector = profile.sector || "";
              item.industry = profile.industry || "";
              item.beta = (stats.beta && stats.beta.raw) || (detail.beta3Year && detail.beta3Year.raw) || 0;
              item.pe = (detail.trailingPE && detail.trailingPE.raw) || 0;
              var dy = (detail.dividendYield && detail.dividendYield.raw) ? detail.dividendYield.raw * 100 : 0;
              if (!dy && detail.yield && detail.yield.raw) dy = detail.yield.raw * 100;
              if (!dy && detail.trailingAnnualDividendYield && detail.trailingAnnualDividendYield.raw) dy = detail.trailingAnnualDividendYield.raw * 100;
              if (!dy && stats.yield && stats.yield.raw) dy = stats.yield.raw * 100;
              item.dividendYield = dy;
              var divRate = (detail.dividendRate && detail.dividendRate.raw) || 0;
              if (!divRate && detail.trailingAnnualDividendRate && detail.trailingAnnualDividendRate.raw) divRate = detail.trailingAnnualDividendRate.raw;
              item.annualDividendPerShare = divRate;
              var mc = (detail.marketCap && detail.marketCap.raw) || 0;
              item.marketCap = mc >= 1e12 ? (mc/1e12).toFixed(1)+"T" : mc >= 1e9 ? (mc/1e9).toFixed(1)+"B" : mc > 0 ? (mc/1e6).toFixed(0)+"M" : "";
              var cal = qr.calendarEvents || {};
              var earn = cal.earnings || {};
              if (earn.earningsDate && earn.earningsDate.length > 0) {
                item.earningsDate = earn.earningsDate[0].fmt || "";
              }
              if (earn.earningsAverage && earn.earningsAverage.raw != null) {
                item.epsEstimate = earn.earningsAverage.raw;
              }
            }
          } catch(e2) {}
        }

        results[sym] = item;
      } catch(e) {}
    })();
  });
  await Promise.all(promises);

  res.status(200).json(results);
};

module.exports.config = {
  api: { responseLimit: false },
  maxDuration: 60
};
