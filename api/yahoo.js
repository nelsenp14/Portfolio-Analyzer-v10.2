module.exports = async function handler(req, res) {
  var symbol = req.query.symbol;
  if (!symbol) {
    return res.status(400).json({ error: "Missing symbol" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  try {
    var url = "https://query2.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + "?range=5d&interval=1d&includePrePost=false";
    var r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    var data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
