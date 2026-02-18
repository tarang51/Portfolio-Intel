const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = 3001;

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// ── Smart NSE Ticker Mapper ───────────────────────────────────────────────────
// Maps common NSE tickers to their Yahoo Finance symbols.
// ETFs and indices need special suffixes — stocks are usually just TICKER.NS
// If a ticker isn't in this map, we automatically try TICKER.NS as fallback.

const TICKER_MAP = {
  // ── Index ETFs ──
  "NIFTYBEES":    "NIFTYBEES.NS",
  "JUNIORBEES":   "JUNIORBEES.NS",
  "BANKBEES":     "BANKBEES.NS",
  "SETFNIF50":    "SETFNIF50.NS",
  "MOM100":       "MOM100.NS",
  "MAFANG":       "MAFANG.NS",
  "ICICIB22":     "ICICIB22.NS",
  "ITBEES":       "ITBEES.NS",

  // ── Gold / Silver ETFs ──
  "GOLDBEES":     "GOLDBEES.NS",
  "GOLD1":        "GOLD1.NS",
  "SILVERBEES":   "SILVERBEES.NS",
  "GSEC10IETF":   "GSEC10IETF.NS",

  // ── Large Cap Stocks ──
  "RELIANCE":     "RELIANCE.NS",
  "TCS":          "TCS.NS",
  "INFY":         "INFY.NS",
  "HDFCBANK":     "HDFCBANK.NS",
  "ICICIBANK":    "ICICIBANK.NS",
  "KOTAKBANK":    "KOTAKBANK.NS",
  "SBIN":         "SBIN.NS",
  "AXISBANK":     "AXISBANK.NS",
  "LT":           "LT.NS",
  "WIPRO":        "WIPRO.NS",
  "HCLTECH":      "HCLTECH.NS",
  "TECHM":        "TECHM.NS",
  "SUNPHARMA":    "SUNPHARMA.NS",
  "DRREDDY":      "DRREDDY.NS",
  "CIPLA":        "CIPLA.NS",
  "DIVISLAB":     "DIVISLAB.NS",
  "HINDUNILVR":   "HINDUNILVR.NS",
  "ITC":          "ITC.NS",
  "NESTLEIND":    "NESTLEIND.NS",
  "BRITANNIA":    "BRITANNIA.NS",
  "MARUTI":       "MARUTI.NS",
  "BAJAJFINSV":   "BAJAJFINSV.NS",
  "BAJFINANCE":   "BAJFINANCE.NS",
  "HDFC":         "HDFC.NS",
  "ASIANPAINT":   "ASIANPAINT.NS",
  "ULTRACEMCO":   "ULTRACEMCO.NS",
  "TITAN":        "TITAN.NS",
  "POWERGRID":    "POWERGRID.NS",
  "NTPC":         "NTPC.NS",
  "ONGC":         "ONGC.NS",
  "COALINDIA":    "COALINDIA.NS",
  "ADANIPORTS":   "ADANIPORTS.NS",
  "ADANIENT":     "ADANIENT.NS",
  "ADANIGREEN":   "ADANIGREEN.NS",
  "TATAMOTORS":   "TATAMOTORS.NS",
  "TATASTEEL":    "TATASTEEL.NS",
  "HINDALCO":     "HINDALCO.NS",
  "JSWSTEEL":     "JSWSTEEL.NS",
  "VEDL":         "VEDL.NS",
  "GRASIM":       "GRASIM.NS",
  "BHARTIARTL":   "BHARTIARTL.NS",
  "INDIGO":       "INDIGO.NS",
  "IRCTC":        "IRCTC.NS",
  "DMART":        "DMART.NS",
  "ZOMATO":       "ZOMATO.NS",
  "PAYTM":        "PAYTM.NS",
  "NYKAA":        "NYKAA.NS",
  "POLICYBAZAAR": "POLICYBZR.NS",
  "TATAPOWER":    "TATAPOWER.NS",
  "RECLTD":       "RECLTD.NS",
  "PFC":          "PFC.NS",
  "HAL":          "HAL.NS",
  "BEL":          "BEL.NS",
  "HDFCLIFE":     "HDFCLIFE.NS",
  "SBILIFE":      "SBILIFE.NS",
  "LICI":         "LICI.NS",
  "PIDILITIND":   "PIDILITIND.NS",
  "BERGEPAINT":   "BERGEPAINT.NS",
  "MUTHOOTFIN":   "MUTHOOTFIN.NS",
  "CHOLAFIN":     "CHOLAFIN.NS",
  "MANKIND":      "MANKIND.NS",
  "MANKIND PHARMA": "MANKIND.NS",
  "SUPREMEIND":   "SUPREMEIND.NS",
  "POLYCAB":      "POLYCAB.NS",
  "DIXON":        "DIXON.NS",
  "AMBER":        "AMBER.NS",
  "VOLTAS":       "VOLTAS.NS",
  "HAVELLS":      "HAVELLS.NS",
  "ABB":          "ABB.NS",
  "SIEMENS":      "SIEMENS.NS",
  "CUMMINSIND":   "CUMMINSIND.NS",
  "MOTHERSON":    "MOTHERSON.NS",
  "BOSCHLTD":     "BOSCHLTD.NS",
  "MRF":          "MRF.NS",
  "APOLLOTYRE":   "APOLLOTYRE.NS",
  "BALKRISIND":   "BALKRISIND.NS",
  "SUNDRMFAST":   "SUNDRMFAST.NS",
  "PERSISTENT":   "PERSISTENT.NS",
  "LTIM":         "LTIM.NS",
  "MPHASIS":      "MPHASIS.NS",
  "COFORGE":      "COFORGE.NS",
  "TATAELXSI":    "TATAELXSI.NS",
  "KPIT":         "KPIT.NS",
  "IDFCFIRSTB":   "IDFCFIRSTB.NS",
  "BANDHANBNK":   "BANDHANBNK.NS",
  "FEDERALBNK":   "FEDERALBNK.NS",
  "INDUSINDBK":   "INDUSINDBK.NS",
  "YESBANK":      "YESBANK.NS",
  "RBLBANK":      "RBLBANK.NS",
  "CANFINHOME":   "CANFINHOME.NS",
  "LICHSGFIN":    "LICHSGFIN.NS",
};

// Convert NSE ticker → Yahoo Finance symbol
function toYahooSymbol(ticker) {
  const upper = ticker.toUpperCase().trim();
  if (TICKER_MAP[upper]) return TICKER_MAP[upper];
  // Fallback: try appending .NS (works for most NSE stocks)
  return upper + ".NS";
}

// ── Live Price Endpoint ───────────────────────────────────────────────────────
app.get("/api/price/:ticker", async (req, res) => {
  const { ticker } = req.params;
  const yahooSymbol = toYahooSymbol(ticker);

  try {
    // Yahoo Finance v8 quote endpoint — no API key needed
    // Try multiple Yahoo Finance endpoints with browser-like headers
    const urls = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=7d`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=7d`,
    ];
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Referer": "https://finance.yahoo.com/",
      "Origin": "https://finance.yahoo.com",
      "Cache-Control": "no-cache",
    };

    let response, data, result;
    for (const url of urls) {
      try {
        response = await fetch(url, { headers });
        if (response.ok) {
          data = await response.json();
          result = data?.chart?.result?.[0];
          if (result) break;
        }
      } catch (_) {}
    }

    if (!result) {
      return res.status(404).json({ error: `No data found for ${ticker} (tried ${yahooSymbol})` });
    }

    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice || meta.previousClose;
    const prevClose = meta.previousClose || meta.chartPreviousClose;
    const change = currentPrice - prevClose;
    const changePct = (change / prevClose) * 100;

    // Last 7 days closing prices for sparkline
    const closes = result.indicators?.quote?.[0]?.close || [];
    const timestamps = result.timestamp || [];
    const history = closes
      .map((c, i) => ({ price: c, time: timestamps[i] }))
      .filter(x => x.price !== null && x.price !== undefined)
      .slice(-7)
      .map(x => x.price);

    res.json({
      ticker,
      yahooSymbol,
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      previousClose: parseFloat(prevClose.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      changePct: parseFloat(changePct.toFixed(2)),
      currency: meta.currency || "INR",
      history,                // array of last 7 closes for sparkline
      lastUpdated: new Date().toISOString(),
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Batch Price Endpoint (fetch all portfolio tickers at once) ────────────────
app.post("/api/prices", async (req, res) => {
  const { tickers } = req.body;
  if (!tickers || !Array.isArray(tickers)) {
    return res.status(400).json({ error: "Pass { tickers: ['RELIANCE', 'TCS', ...] }" });
  }

  const results = {};
  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const yahooSymbol = toYahooSymbol(ticker);
        const urls = [
          `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=7d`,
          `https://query2.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=7d`,
        ];
        const headers = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://finance.yahoo.com/",
          "Origin": "https://finance.yahoo.com",
          "Cache-Control": "no-cache",
        };

        let data, result;
        for (const url of urls) {
          try {
            const r = await fetch(url, { headers });
            if (r.ok) {
              data = await r.json();
              result = data?.chart?.result?.[0];
              if (result) break;
            }
          } catch (_) {}
        }
        if (!result) throw new Error("No data from Yahoo Finance");

        const meta = result.meta;
        const currentPrice = meta.regularMarketPrice || meta.previousClose;
        const prevClose = meta.previousClose || meta.chartPreviousClose;
        const change = currentPrice - prevClose;
        const changePct = (change / prevClose) * 100;

        const closes = result.indicators?.quote?.[0]?.close || [];
        const history = closes
          .filter(c => c !== null && c !== undefined)
          .slice(-7);

        results[ticker] = {
          currentPrice: parseFloat(currentPrice.toFixed(2)),
          previousClose: parseFloat(prevClose.toFixed(2)),
          change: parseFloat(change.toFixed(2)),
          changePct: parseFloat(changePct.toFixed(2)),
          history,
          yahooSymbol,
          error: null,
        };
      } catch (err) {
        results[ticker] = { error: err.message, currentPrice: null };
      }
    })
  );

  res.json(results);
});

// ── Gemini AI Endpoint ────────────────────────────────────────────────────────
app.post("/api/claude", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.includes("PASTE-YOUR-KEY")) {
    return res.status(500).json({
      error: { message: "Gemini API key not set in .env file. Get a free key at aistudio.google.com" }
    });
  }

  try {
    const messages = req.body.messages || [];
    const userMessage = messages.map(m => m.content).join("\n");

    const prompt = userMessage +
      "\n\nCRITICAL: Respond ONLY with a single compact JSON object on one line. Keep all string values under 12 words. No markdown, no backticks, no newlines inside strings, no extra text. Just raw JSON.";
      "Just the raw JSON.";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
          }
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || "Gemini API error";
      return res.status(response.status).json({ error: { message: errMsg } });
    }

    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    text = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) text = jsonMatch[0];
    text = text.replace(/("(?:[^"\\]|\\.)*")/g, (match) =>
      match.replace(/[\n\r]/g, " ")
    );

    res.json({ content: [{ type: "text", text }] });

  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`\n✅ Portfolio Intel proxy running at http://localhost:${PORT}`);
  console.log(`   📈 Live NSE prices via Yahoo Finance (no API key needed)`);
  console.log(`   🤖 AI analysis via Google Gemini (free tier)`);
  console.log(`   Your React app at http://localhost:3000 will use this proxy.\n`);
});
