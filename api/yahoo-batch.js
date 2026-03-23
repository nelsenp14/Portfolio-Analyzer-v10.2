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
          volume: meta.regularMarketVolume || 0,
          sector: "", industry: "", beta: 0, pe: 0,
          dividendYield: 0, annualDividendPerShare: 0, marketCap: ""
        };

        if (crumb && cookies) {
          try {
            var detailUrl = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/" +
              encodeURIComponent(sym) +
              "?modules=summaryProfile,summaryDetail,defaultKeyStatistics,calendarEvents,earnings,recommendationTrend,financialData,topHoldings,fundProfile&crumb=" +
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
              
              // Return raw lastDividendValue for frontend frequency detection
              var lastDiv = (detail.lastDividendValue && detail.lastDividendValue.raw) || 
                           (stats.lastDividendValue && stats.lastDividendValue.raw) || 0;
              if (lastDiv > 0) item.lastDividendValue = lastDiv;
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
              if (cal.exDividendDate && cal.exDividendDate.fmt) {
                item.exDividendDate = cal.exDividendDate.fmt;
              }
              if (cal.dividendDate && cal.dividendDate.fmt) {
                item.dividendDate = cal.dividendDate.fmt;
              }
              if (detail.exDividendDate && detail.exDividendDate.fmt && !item.exDividendDate) {
                item.exDividendDate = detail.exDividendDate.fmt;
              }
              // Historical EPS from earnings module
              var earningsModule = qr.earnings || {};
              var earningsChart = earningsModule.earningsChart || {};
              var quarterly = earningsChart.quarterly || [];
              if (quarterly.length > 0) {
                var last = quarterly[quarterly.length - 1];
                item.lastEpsActual = (last.actual && last.actual.raw != null) ? last.actual.raw : null;
                item.lastEpsEstimate = (last.estimate && last.estimate.raw != null) ? last.estimate.raw : null;
                item.lastEpsDate = last.date || "";
              }
              // All quarterly EPS for bar chart
              if (quarterly.length > 0) {
                item.quarterlyEps = quarterly.map(function(q) {
                  return { date: q.date || "", actual: (q.actual && q.actual.raw != null) ? q.actual.raw : null, estimate: (q.estimate && q.estimate.raw != null) ? q.estimate.raw : null };
                });
              }
              // Quarterly revenue/earnings from financialsChart
              var finChart = earningsModule.financialsChart || {};
              var qRevEarn = finChart.quarterly || [];
              if (qRevEarn.length > 0) {
                item.quarterlyFinancials = qRevEarn.map(function(q) {
                  return { date: q.date || "", revenue: (q.revenue && q.revenue.raw) || 0, earnings: (q.earnings && q.earnings.raw) || 0 };
                });
              }
              // 52-week high/low
              item.fiftyTwoWeekHigh = (detail.fiftyTwoWeekHigh && detail.fiftyTwoWeekHigh.raw) || 0;
              item.fiftyTwoWeekLow = (detail.fiftyTwoWeekLow && detail.fiftyTwoWeekLow.raw) || 0;
              // Forward PE
              item.forwardPE = (stats.forwardPE && stats.forwardPE.raw) || (detail.forwardPE && detail.forwardPE.raw) || 0;
              // Analyst recommendation
              var recTrend = qr.recommendationTrend || {};
              var recArr = recTrend.trend || [];
              if (recArr.length > 0) {
                var r0 = recArr[0];
                item.analystBuy = (r0.strongBuy || 0) + (r0.buy || 0);
                item.analystHold = r0.hold || 0;
                item.analystSell = (r0.sell || 0) + (r0.strongSell || 0);
              }
              // Target price
              var finData = qr.financialData || {};
              item.targetMeanPrice = (finData.targetMeanPrice && finData.targetMeanPrice.raw) || 0;
              item.analystCount = (finData.numberOfAnalystOpinions && finData.numberOfAnalystOpinions.raw) || 0;
              item.recommendation = finData.recommendationKey || "";
              // ETF-specific fields
              var fundProf = qr.fundProfile || {};
              item.expenseRatio = (fundProf.feesExpensesInvestment && fundProf.feesExpensesInvestment.annualReportExpenseRatio && fundProf.feesExpensesInvestment.annualReportExpenseRatio.raw != null) ? fundProf.feesExpensesInvestment.annualReportExpenseRatio.raw : (stats.annualReportExpenseRatio && stats.annualReportExpenseRatio.raw != null) ? stats.annualReportExpenseRatio.raw : 0;
              var ta = (stats.totalAssets && stats.totalAssets.raw) || (detail.totalAssets && detail.totalAssets.raw) || 0;
              item.totalAssets = ta >= 1e12 ? (ta/1e12).toFixed(1)+"T" : ta >= 1e9 ? (ta/1e9).toFixed(1)+"B" : ta >= 1e6 ? (ta/1e6).toFixed(0)+"M" : "";
              item.totalAssetsRaw = ta;
              var topH = qr.topHoldings || {};
              var hArr = topH.holdings || [];
              item.holdingsCount = hArr.length;
              if (hArr.length > 0) {
                var topItem = hArr[0];
                item.topHolding = topItem.symbol || topItem.holdingName || "";
                item.topHoldingPct = (topItem.holdingPercent && topItem.holdingPercent.raw != null) ? (topItem.holdingPercent.raw * 100).toFixed(1) : "";
              }
              // Fallback: try to get total holdings count from fundProfile
              if (!item.holdingsCount) {
                var fph = qr.fundProfile || {};
                if (fph.feesExpensesInvestment && fph.feesExpensesInvestment.totalNetAssets) {
                  item.holdingsCount = 0; // we know it's an ETF but no count available
                }
              }
              // Crypto-specific fields
              item.circulatingSupply = (detail.circulatingSupply && detail.circulatingSupply.raw) || (stats.circulatingSupply && stats.circulatingSupply.raw) || 0;
              item.allTimeHigh = item.fiftyTwoWeekHigh || 0;
              var mcRaw = (detail.marketCap && detail.marketCap.raw) || 0;
              item.marketCapRaw = mcRaw;
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
