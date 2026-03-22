module.exports = async function handler(req, res) {
  var symbol = req.query.symbol;
  var range = req.query.range || "1mo";
  if (!symbol) return res.status(400).json({ error: "Missing symbol" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  var headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  var validRanges = { "5d": "5m", "1mo": "1h", "3mo": "1d", "6mo": "1d", "1y": "1d", "3y": "1wk", "5y": "1wk" };
  var interval = validRanges[range] || "1d";

  try {
    var url = "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol) + "?range=" + range + "&interval=" + interval;
    var r = await fetch(url, { headers: headers });
    var data = await r.json();
    var result = data && data.chart && data.chart.result && data.chart.result[0];
    if (!result) return res.status(200).json({ error: "No data" });

    var timestamps = result.timestamp || [];
    var closes = (result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close) || [];
    var meta = result.meta || {};

    var points = [];
    for (var i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        points.push({ t: timestamps[i] * 1000, c: Math.round(closes[i] * 100) / 100 });
      }
    }

    res.status(200).json({
      symbol: symbol,
      range: range,
      currency: meta.currency || "USD",
      points: points
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
