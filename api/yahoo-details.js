module.exports = async function handler(req, res) {
  var symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: "Missing symbol" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  try {
    var url = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/" +
      encodeURIComponent(symbol) +
      "?modules=summaryProfile,summaryDetail,defaultKeyStatistics";
    var r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    var data = await r.json();
    var result = data && data.quoteSummary && data.quoteSummary.result && data.quoteSummary.result[0];
    if (!result) return res.status(200).json({});

    var profile = result.summaryProfile || {};
    var detail = result.summaryDetail || {};
    var stats = result.defaultKeyStatistics || {};

    res.status(200).json({
      sector: profile.sector || "",
      industry: profile.industry || "",
      beta: (stats.beta && stats.beta.raw) || 0,
      pe: (detail.trailingPE && detail.trailingPE.raw) || 0,
      dividendYield: (detail.dividendYield && detail.dividendYield.raw) ? detail.dividendYield.raw * 100 : 0,
      annualDividendPerShare: (detail.dividendRate && detail.dividendRate.raw) || 0,
      marketCap: (detail.marketCap && detail.marketCap.fmt) || ""
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
