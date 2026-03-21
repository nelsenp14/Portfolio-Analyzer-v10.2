const yahooFinance = require("yahoo-finance2").default;

module.exports = async function handler(req, res) {
  var symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: "Missing symbol" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  try {
    var quote = await yahooFinance.quoteSummary(symbol, {
      modules: ["summaryProfile", "summaryDetail", "defaultKeyStatistics"]
    });

    var profile = quote.summaryProfile || {};
    var detail = quote.summaryDetail || {};
    var stats = quote.defaultKeyStatistics || {};

    res.status(200).json({
      sector: profile.sector || "",
      industry: profile.industry || "",
      beta: stats.beta || 0,
      pe: detail.trailingPE || 0,
      dividendYield: detail.dividendYield ? detail.dividendYield * 100 : 0,
      annualDividendPerShare: detail.dividendRate || 0,
      marketCap: detail.marketCap ? (detail.marketCap >= 1e12 ? (detail.marketCap/1e12).toFixed(1)+"T" : detail.marketCap >= 1e9 ? (detail.marketCap/1e9).toFixed(1)+"B" : (detail.marketCap/1e6).toFixed(0)+"M") : ""
    });
  } catch (e) {
    res.status(200).json({
      sector: "",
      industry: "",
      beta: 0,
      pe: 0,
      dividendYield: 0,
      annualDividendPerShare: 0,
      marketCap: ""
    });
  }
};
