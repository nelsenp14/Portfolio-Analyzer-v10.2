const yahooFinance = require("yahoo-finance2").default;

module.exports = async function handler(req, res) {
  var symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: "Missing symbol" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  try {
    var quote = await yahooFinance.quote(symbol);
    res.status(200).json({
      chart: {
        result: [{
          meta: {
            regularMarketPrice: quote.regularMarketPrice || 0,
            shortName: quote.shortName || "",
            longName: quote.longName || ""
          }
        }]
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
