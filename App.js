import { useState, useEffect, useCallback } from "react";

// ── Default portfolio (user can clear and add their own) ──────────────────────
const INITIAL_PORTFOLIO = [
  { id: 1, ticker: "RELIANCE",  name: "Reliance Industries Ltd",   type: "Stock", shares: 10, avgCost: 2400.0, currentPrice: 2500.0 },
  { id: 2, ticker: "TCS",       name: "Tata Consultancy Services", type: "Stock", shares: 5,  avgCost: 3500.0, currentPrice: 3700.0 },
  { id: 3, ticker: "NIFTYBEES", name: "Nippon Nifty BeES ETF",     type: "ETF",   shares: 50, avgCost: 220.0,  currentPrice: 240.0  },
  { id: 4, ticker: "GOLDBEES",  name: "Nippon Gold BeES ETF",      type: "ETF",   shares: 20, avgCost: 55.0,   currentPrice: 62.0   },
];

const SENTIMENT_COLORS = {
  Bullish: "#00e5a0",
  "Mildly Bullish": "#7dffcc",
  Neutral: "#f0c040",
  "Mildly Bearish": "#ff9966",
  Bearish: "#ff4d6d",
};

// ── INR Formatter (Indian numbering: lakhs/crores) ────────────────────────────
const formatINR = (num, compact = false) => {
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  if (compact) {
    if (abs >= 1e7) return sign + "₹" + (abs / 1e7).toFixed(2) + "Cr";
    if (abs >= 1e5) return sign + "₹" + (abs / 1e5).toFixed(2) + "L";
  }
  const [integer, decimal] = abs.toFixed(2).split(".");
  let fmt = "";
  const len = integer.length;
  if (len <= 3) {
    fmt = integer;
  } else {
    fmt = integer.slice(-3);
    let rem = integer.slice(0, len - 3);
    while (rem.length > 2) {
      fmt = rem.slice(-2) + "," + fmt;
      rem = rem.slice(0, rem.length - 2);
    }
    fmt = rem + "," + fmt;
  }
  return sign + "₹" + fmt + "." + decimal;
};

// ── Proxy API helper ──────────────────────────────────────────────────────────
const callClaude = async (messages) => {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Server error " + res.status);
  }
  const data = await res.json();
  const text = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
  return JSON.parse(text);
};

// ── Live Price Fetcher ────────────────────────────────────────────────────────
const fetchLivePrices = async (tickers) => {
  const res = await fetch("/api/prices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers }),
  });
  if (!res.ok) throw new Error("Price fetch failed");
  return res.json();
};

const fetchSinglePrice = async (ticker) => {
  const res = await fetch("/api/price/" + ticker);
  if (!res.ok) throw new Error("Could not fetch price for " + ticker);
  return res.json();
};

// ── Mini UI Components ────────────────────────────────────────────────────────
function LoadingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: "50%", background: "#00e5a0",
          animation: "pulse 1.2s ease-in-out infinite",
          animationDelay: i * 0.2 + "s", display: "inline-block"
        }} />
      ))}
    </span>
  );
}

function SentimentBadge({ sentiment }) {
  const color = SENTIMENT_COLORS[sentiment] || "#f0c040";
  return (
    <span style={{
      background: color + "20", border: "1px solid " + color + "60",
      color, borderRadius: 20, padding: "2px 10px",
      fontSize: 11, fontWeight: 700, fontFamily: "monospace"
    }}>{sentiment}</span>
  );
}

function GaugeBar({ value }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct > 66 ? "#00e5a0" : pct > 33 ? "#f0c040" : "#ff4d6d";
  return (
    <div style={{ width: "100%", height: 4, background: "#1e2535", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ width: pct + "%", height: "100%", background: color, borderRadius: 2, transition: "width 1s ease" }} />
    </div>
  );
}

function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null;
  const w = 80, h = 32;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => (i / (data.length - 1)) * w + "," + (h - ((v - min) / range) * h)).join(" ");
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// ── Add / Edit Position Modal ─────────────────────────────────────────────────
function PositionModal({ onSave, onClose, existing }) {
  const [ticker, setTicker] = useState(existing?.ticker || "");
  const [name, setName] = useState(existing?.name || "");
  const [shares, setShares] = useState(existing?.shares?.toString() || "");
  const [avgCost, setAvgCost] = useState(existing?.avgCost?.toString() || "");
  const [currentPrice, setCurrentPrice] = useState(existing?.currentPrice?.toString() || "");
  const [type, setType] = useState(existing?.type || "Stock");
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [fetchMsg, setFetchMsg] = useState("");

  const inputStyle = {
    width: "100%", background: "#141e30", border: "1px solid #1e2d45",
    color: "#e8f0ff", borderRadius: 8, padding: "10px 14px",
    fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit"
  };

  // Auto-fetch live price when ticker loses focus
  const handleTickerBlur = async () => {
    if (!ticker || existing) return;
    setFetchingPrice(true);
    setFetchMsg("Fetching live price...");
    try {
      const data = await fetchSinglePrice(ticker.toUpperCase());
      if (data.currentPrice) {
        setCurrentPrice(data.currentPrice.toString());
        setFetchMsg("✅ Live price fetched: ₹" + data.currentPrice.toLocaleString("en-IN"));
        setTimeout(() => setFetchMsg(""), 3000);
      }
    } catch (e) {
      setFetchMsg("⚠ Could not fetch price. Enter manually.");
    }
    setFetchingPrice(false);
  };

  const handleSave = () => {
    if (!ticker || !shares || !avgCost || !currentPrice) return;
    onSave({
      id: existing?.id || Date.now(),
      ticker: ticker.toUpperCase(),
      name: name || ticker.toUpperCase(),
      type,
      shares: parseFloat(shares),
      avgCost: parseFloat(avgCost),
      currentPrice: parseFloat(currentPrice),
    });
    onClose();
  };

  const fields = [
    { label: "Ticker Symbol (NSE)", val: ticker, set: setTicker, placeholder: "e.g. RELIANCE", onBlur: handleTickerBlur },
    { label: "Company / Fund Name", val: name, set: setName, placeholder: "e.g. Reliance Industries Ltd" },
    { label: "Shares / Units", val: shares, set: setShares, placeholder: "e.g. 5", t: "number" },
    { label: "Avg Buy Price (₹)", val: avgCost, set: setAvgCost, placeholder: "e.g. 1379.00", t: "number" },
    { label: "Current Market Price (₹) — auto-filled from NSE", val: currentPrice, set: setCurrentPrice, placeholder: fetchingPrice ? "Fetching live price..." : "e.g. 1437.00", t: "number" },
  ];

  // Live P&L preview
  const previewPnl = shares && avgCost && currentPrice
    ? ((parseFloat(currentPrice) - parseFloat(avgCost)) * parseFloat(shares))
    : null;
  const previewPct = shares && avgCost && currentPrice
    ? ((parseFloat(currentPrice) - parseFloat(avgCost)) / parseFloat(avgCost) * 100)
    : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000b", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)" }}>
      <div style={{ background: "#0f1623", border: "1px solid #1e2d45", borderRadius: 16, padding: 32, width: 420, fontFamily: "inherit" }}>
        <h3 style={{ color: "#e8f0ff", margin: "0 0 6px", fontSize: 18 }}>
          {existing ? "Edit Position" : "Add Position"}
        </h3>
        <p style={{ color: "#3d5070", fontSize: 12, margin: "0 0 20px" }}>
          Just enter the NSE ticker — current price is fetched automatically ⚡
        </p>

        {fields.map(({ label, val, set, placeholder, t, onBlur }) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <label style={{ color: "#7a8fb5", fontSize: 12, display: "block", marginBottom: 5 }}>{label}</label>
            <input
              value={val} onChange={e => set(e.target.value)}
              onBlur={onBlur}
              type={t || "text"} placeholder={placeholder} style={inputStyle}
            />
          </div>
        ))}
        {fetchMsg && (
          <div style={{
            background: fetchMsg.includes("✅") ? "#00e5a010" : "#ff966610",
            border: "1px solid " + (fetchMsg.includes("✅") ? "#00e5a030" : "#ff966630"),
            borderRadius: 8, padding: "8px 14px", marginBottom: 12,
            color: fetchMsg.includes("✅") ? "#00e5a0" : "#ff9966", fontSize: 12
          }}>{fetchMsg}</div>
        )}

        {/* Live P&L Preview */}
        {previewPnl !== null && (
          <div style={{
            background: previewPnl >= 0 ? "#00e5a010" : "#ff4d6d10",
            border: "1px solid " + (previewPnl >= 0 ? "#00e5a030" : "#ff4d6d30"),
            borderRadius: 10, padding: "12px 16px", marginBottom: 16,
            display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <span style={{ color: "#7a8fb5", fontSize: 12 }}>P&L Preview</span>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: previewPnl >= 0 ? "#00e5a0" : "#ff4d6d", fontFamily: "monospace", fontSize: 14, fontWeight: 700 }}>
                {previewPnl >= 0 ? "+" : ""}{formatINR(previewPnl)}
              </div>
              <div style={{ color: previewPnl >= 0 ? "#00a870" : "#cc3355", fontSize: 11 }}>
                {previewPct >= 0 ? "▲ +" : "▼ "}{previewPct.toFixed(2)}%
              </div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 22 }}>
          <label style={{ color: "#7a8fb5", fontSize: 12, display: "block", marginBottom: 6 }}>Type</label>
          <div style={{ display: "flex", gap: 8 }}>
            {["Stock", "ETF"].map(t => (
              <button key={t} onClick={() => setType(t)} style={{
                flex: 1, padding: 10, borderRadius: 8, cursor: "pointer",
                background: type === t ? "#00e5a020" : "#141e30",
                border: "1px solid " + (type === t ? "#00e5a0" : "#1e2d45"),
                color: type === t ? "#00e5a0" : "#7a8fb5",
                fontSize: 13, fontWeight: 600, fontFamily: "inherit"
              }}>{t}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: 12, borderRadius: 8, cursor: "pointer",
            background: "transparent", border: "1px solid #1e2d45",
            color: "#7a8fb5", fontSize: 14, fontFamily: "inherit"
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            flex: 1, padding: 12, borderRadius: 8, cursor: "pointer",
            background: "#00e5a0", border: "none",
            color: "#0a0f1a", fontSize: 14, fontWeight: 700, fontFamily: "inherit"
          }}>{existing ? "Save Changes" : "Add Position"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Update Price Modal ────────────────────────────────────────────────────────
function UpdatePriceModal({ item, onUpdate, onClose }) {
  const [price, setPrice] = useState(item.currentPrice.toString());

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000b", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)" }}>
      <div style={{ background: "#0f1623", border: "1px solid #1e2d45", borderRadius: 14, padding: 28, width: 340, fontFamily: "inherit" }}>
        <h3 style={{ color: "#e8f0ff", margin: "0 0 6px", fontSize: 17 }}>Update Price</h3>
        <p style={{ color: "#4a5e7a", margin: "0 0 20px", fontSize: 13 }}>{item.ticker} · {item.name}</p>
        <label style={{ color: "#7a8fb5", fontSize: 12, display: "block", marginBottom: 6 }}>Current Market Price (₹)</label>
        <input
          value={price} onChange={e => setPrice(e.target.value)}
          type="number" placeholder="e.g. 1437.00"
          style={{ width: "100%", background: "#141e30", border: "1px solid #1e2d45", color: "#e8f0ff", borderRadius: 8, padding: "10px 14px", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "monospace", marginBottom: 20 }}
          autoFocus
        />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 8, cursor: "pointer", background: "transparent", border: "1px solid #1e2d45", color: "#7a8fb5", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
          <button onClick={() => { onUpdate(parseFloat(price)); onClose(); }} style={{ flex: 1, padding: 10, borderRadius: 8, cursor: "pointer", background: "#00e5a0", border: "none", color: "#0a0f1a", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>Update</button>
        </div>
      </div>
    </div>
  );
}

// ── Analysis Panel ────────────────────────────────────────────────────────────
function AnalysisPanel({ item, onClose }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const price = item.currentPrice;
  const pnl = (price - item.avgCost) * item.shares;
  const pnlPct = ((price - item.avgCost) / item.avgCost) * 100;

  useEffect(() => {
    setLoading(true);
    setError(null);
    callClaude([{
      role: "user",
      content:
        "You are a financial analyst for Indian equity markets (NSE/BSE). Analyse " + item.ticker +
        " (" + item.name + ", " + item.type + ") as of February 2026.\n\n" +
        "Current market price: ₹" + price.toFixed(2) + "\n" +
        "Investor avg buy price: ₹" + item.avgCost.toFixed(2) + "\n" +
        "Shares held: " + item.shares + "\n" +
        "Unrealised P&L: " + (pnl >= 0 ? "+" : "") + formatINR(pnl) + " (" + pnlPct.toFixed(1) + "%)\n\n" +
        "Consider: RBI monetary policy, SEBI regulations, FII/DII flows, Indian GDP outlook, sector-specific Indian market factors.\n\n" +
        "Respond ONLY with valid JSON (no markdown, no backticks). Price targets in ₹ as plain numbers:\n" +
        '{"sentiment":"Bullish","sentimentScore":72,"currentOutlook":"2-3 sentence Indian market context","keyDrivers":["d1","d2","d3"],"risks":["r1","r2"],"shortTermTarget":1550,"longTermTarget":1800,"analystConsensus":"Buy","confidenceLevel":75,"recommendation":"1-2 sentence personalised advice for this investor"}'
    }])
      .then(r => { setAnalysis(r); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [item]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0008", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(8px)" }}>
      <div style={{
        background: "#0b1220", border: "1px solid #1e2d45", borderRadius: 20,
        padding: 36, width: 580, maxHeight: "88vh", overflowY: "auto",
        fontFamily: "inherit", boxShadow: "0 40px 80px #000a"
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
              <span style={{ background: "#00e5a015", border: "1px solid #00e5a030", color: "#00e5a0", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{item.type}</span>
              {analysis && <SentimentBadge sentiment={analysis.sentiment} />}
            </div>
            <h2 style={{ color: "#e8f0ff", margin: 0, fontSize: 24 }}>{item.ticker}</h2>
            <p style={{ color: "#4a5e7a", margin: "2px 0 0", fontSize: 13 }}>{item.name}</p>
          </div>
          <button onClick={onClose} style={{ background: "#1e2535", border: "none", color: "#7a8fb5", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18 }}>×</button>
        </div>

        {/* Price cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Current Price", val: formatINR(price), color: "#e8f0ff" },
            { label: "Avg Buy Price", val: formatINR(item.avgCost), color: "#7aadff" },
            { label: "Unrealised P&L", val: (pnl >= 0 ? "+" : "") + formatINR(pnl, true), color: pnl >= 0 ? "#00e5a0" : "#ff4d6d" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: "#0f1623", borderRadius: 10, padding: "14px 16px", border: "1px solid #1e2d45" }}>
              <div style={{ color: "#4a5e7a", fontSize: 11, marginBottom: 4 }}>{label}</div>
              <div style={{ color, fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ background: "#0f1623", borderRadius: 10, padding: "12px 16px", border: "1px solid #1e2d45", marginBottom: 20, display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#4a5e7a", fontSize: 12 }}>Total Return</span>
          <span style={{ color: pnlPct >= 0 ? "#00e5a0" : "#ff4d6d", fontFamily: "monospace", fontSize: 14, fontWeight: 700 }}>
            {pnlPct >= 0 ? "▲ +" : "▼ "}{pnlPct.toFixed(2)}%
          </span>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <LoadingDots />
            <p style={{ color: "#4a5e7a", marginTop: 16, fontSize: 13 }}>Fetching AI analysis for Indian markets…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: "#ff4d6d10", border: "1px solid #ff4d6d30", borderRadius: 12, padding: 20 }}>
            <p style={{ color: "#ff4d6d", margin: 0, fontSize: 13, fontWeight: 600 }}>⚠ {error}</p>
            <div style={{ color: "#7a8fb5", marginTop: 10, fontSize: 12, lineHeight: 1.8 }}>
              Make sure both terminals are running:<br />
              <strong style={{ color: "#c8d8f0" }}>Terminal 1:</strong>{" "}
              <code style={{ background: "#1e2535", padding: "1px 6px", borderRadius: 3 }}>node server.js</code><br />
              <strong style={{ color: "#c8d8f0" }}>Terminal 2:</strong>{" "}
              <code style={{ background: "#1e2535", padding: "1px 6px", borderRadius: 3 }}>npm start</code><br />
              Check your API key in <code style={{ background: "#1e2535", padding: "1px 6px", borderRadius: 3 }}>.env</code>
            </div>
          </div>
        )}

        {/* Analysis */}
        {!loading && !error && analysis && (
          <>
            <div style={{ background: "#0f1623", borderRadius: 12, padding: 20, border: "1px solid #1e2d45", marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: "#7a8fb5", fontSize: 12 }}>Sentiment Score</span>
                <span style={{ color: "#e8f0ff", fontSize: 12, fontFamily: "monospace" }}>{analysis.sentimentScore}/100</span>
              </div>
              <GaugeBar value={analysis.sentimentScore} />
            </div>

            <div style={{ background: "#0f1623", borderRadius: 12, padding: 20, border: "1px solid #1e2d45", marginBottom: 14 }}>
              <h4 style={{ color: "#7a8fb5", fontSize: 11, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>Market Outlook</h4>
              <p style={{ color: "#c8d8f0", fontSize: 13, lineHeight: 1.7, margin: 0 }}>{analysis.currentOutlook}</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              {[{ label: "3-Month Target", val: analysis.shortTermTarget }, { label: "12-Month Target", val: analysis.longTermTarget }].map(({ label, val }) => {
                const upside = ((val - price) / price * 100).toFixed(1);
                const isUp = val >= price;
                return (
                  <div key={label} style={{ background: "#0f1623", borderRadius: 12, padding: 18, border: "1px solid " + (isUp ? "#00e5a030" : "#ff4d6d30") }}>
                    <div style={{ color: "#4a5e7a", fontSize: 11, marginBottom: 6 }}>{label}</div>
                    <div style={{ color: "#e8f0ff", fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>{formatINR(Number(val))}</div>
                    <div style={{ color: isUp ? "#00e5a0" : "#ff4d6d", fontSize: 12, marginTop: 2 }}>{isUp ? "▲" : "▼"} {Math.abs(upside)}% from current</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div style={{ background: "#0f1623", borderRadius: 12, padding: 18, border: "1px solid #00e5a020" }}>
                <h4 style={{ color: "#00e5a0", fontSize: 11, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>Key Drivers</h4>
                {(analysis.keyDrivers || []).map((d, i) => (
                  <div key={i} style={{ color: "#c8d8f0", fontSize: 12, marginBottom: 6, display: "flex", gap: 8 }}>
                    <span style={{ color: "#00e5a0" }}>↑</span>{d}
                  </div>
                ))}
              </div>
              <div style={{ background: "#0f1623", borderRadius: 12, padding: 18, border: "1px solid #ff4d6d20" }}>
                <h4 style={{ color: "#ff4d6d", fontSize: 11, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>Key Risks</h4>
                {(analysis.risks || []).map((r, i) => (
                  <div key={i} style={{ color: "#c8d8f0", fontSize: 12, marginBottom: 6, display: "flex", gap: 8 }}>
                    <span style={{ color: "#ff4d6d" }}>⚠</span>{r}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "#00e5a010", borderRadius: 12, padding: 20, border: "1px solid #00e5a030" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h4 style={{ color: "#00e5a0", fontSize: 11, margin: 0, textTransform: "uppercase", letterSpacing: 1 }}>AI Recommendation</h4>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ background: "#0f1623", border: "1px solid #1e2d45", color: "#7a8fb5", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>Consensus: {analysis.analystConsensus}</span>
                  <span style={{ background: "#0f1623", border: "1px solid #1e2d45", color: "#7a8fb5", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>{analysis.confidenceLevel}% confidence</span>
                </div>
              </div>
              <p style={{ color: "#c8d8f0", fontSize: 13, lineHeight: 1.7, margin: 0 }}>{analysis.recommendation}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [portfolio, setPortfolio] = useState(() => {
    try {
      const s = localStorage.getItem("portfolio_inr_v4");
      return s ? JSON.parse(s) : INITIAL_PORTFOLIO;
    } catch { return INITIAL_PORTFOLIO; }
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [updatePriceItem, setUpdatePriceItem] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [filter, setFilter] = useState("All");
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryLoaded, setSummaryLoaded] = useState(false);

  useEffect(() => {
    localStorage.setItem("portfolio_inr_v4", JSON.stringify(portfolio));
  }, [portfolio]);

  const [pricesLoading, setPricesLoading] = useState(false);
  const [priceError, setPriceError] = useState(null);
  const [lastPriceUpdate, setLastPriceUpdate] = useState(null);

  // Fetch live prices for all portfolio tickers from Yahoo Finance
  const refreshPrices = useCallback(async () => {
    if (!portfolio.length) return;
    setPricesLoading(true);
    setPriceError(null);
    try {
      const tickers = portfolio.map(item => item.ticker);
      const prices = await fetchLivePrices(tickers);
      setPortfolio(prev => prev.map(item => {
        const live = prices[item.ticker];
        if (live && live.currentPrice && !live.error) {
          return {
            ...item,
            currentPrice: live.currentPrice,
            priceChange: live.change,
            priceChangePct: live.changePct,
            sparkHistory: live.history,
          };
        }
        return item;
      }));
      setLastPriceUpdate(new Date());
    } catch (e) {
      setPriceError("Could not fetch live prices. Using last known prices.");
    }
    setPricesLoading(false);
  }, [portfolio.length]);

  // Auto-fetch prices on load and every 5 minutes
  useEffect(() => {
    refreshPrices();
    const interval = setInterval(refreshPrices, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getSparkData = (item) => {
    // Use real history from Yahoo Finance if available
    if (item.sparkHistory && item.sparkHistory.length >= 2) return item.sparkHistory;
    // Fallback to simulated data
    const p = item.currentPrice;
    const avg = item.avgCost;
    return Array.from({ length: 7 }, (_, i) => {
      if (i === 6) return p;
      const seed = item.ticker.charCodeAt(0) + i * 7;
      const noise = ((seed * 9301 + 49297) % 233280 / 233280 - 0.5) * p * 0.04;
      return avg + ((p - avg) * (i / 6)) + noise;
    });
  };

  const totalValue = portfolio.reduce((s, item) => s + item.currentPrice * item.shares, 0);
  const totalCost = portfolio.reduce((s, item) => s + item.avgCost * item.shares, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const filtered = filter === "All" ? portfolio : portfolio.filter(i => i.type === filter);

  const loadSummary = useCallback(async () => {
    if (!portfolio.length) return;
    setSummaryLoading(true);
    const holdings = portfolio.map(item => {
      const pnl = ((item.currentPrice - item.avgCost) / item.avgCost * 100).toFixed(1);
      return item.ticker + " (" + item.type + "): " + item.shares + " @ ₹" + item.avgCost + ", CMP ₹" + item.currentPrice + ", P&L " + pnl + "%";
    }).join("\n");
    try {
      const result = await callClaude([{
        role: "user",
        content:
          "You are a portfolio analyst for Indian equity markets. Portfolio as of Feb 2026:\n\n" +
          holdings + "\n\nTotal value: " + formatINR(totalValue, true) +
          ", P&L: " + (totalPnlPct >= 0 ? "+" : "") + totalPnlPct.toFixed(1) + "%\n\n" +
          "Consider: Nifty/Sensex, RBI policy, FII/DII activity, Union Budget, rupee movement.\n\n" +
          'JSON only (no markdown): {"overallSentiment":"Bullish","diversificationScore":65,"riskLevel":"Moderate","summary":"2-3 sentences","topOpportunity":"1 sentence","topRisk":"1 sentence","marketContext":"1-2 sentences"}'
      }]);
      setSummary(result);
    } catch (e) {
      console.error("Summary error:", e.message);
    }
    setSummaryLoading(false);
    setSummaryLoaded(true);
  }, [portfolio, totalValue, totalPnlPct]);

  useEffect(() => { loadSummary(); }, []);

  const handleAdd = (item) => setPortfolio(p => [...p, item]);
  const handleEdit = (item) => setPortfolio(p => p.map(x => x.id === item.id ? item : x));
  const handleUpdatePrice = (id, price) => setPortfolio(p => p.map(x => x.id === id ? { ...x, currentPrice: price } : x));
  const handleDelete = (id) => setPortfolio(p => p.filter(x => x.id !== id));

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #070d17; font-family: -apple-system, 'Segoe UI', sans-serif; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0b1220; }
        ::-webkit-scrollbar-thumb { background: #1e2d45; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .row-hover:hover { background: #0f1c30 !important; }
        .card-hover:hover { border-color: #2e4060 !important; transform: translateY(-1px); }
        .btn-sm { border: none; border-radius: 6px; padding: 5px 9px; cursor: pointer; font-size: 11px; font-family: inherit; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#070d17", color: "#e8f0ff", padding: "0 24px 48px" }}>

        {/* ── Header ── */}
        <div style={{ maxWidth: 1140, margin: "0 auto", borderBottom: "1px solid #1e2535", padding: "28px 0 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -0.5, background: "linear-gradient(120deg,#e8f0ff 30%,#00e5a0)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>PORTFOLIO INTEL</h1>
            <p style={{ color: "#3d5070", margin: "3px 0 0", fontSize: 11, fontFamily: "monospace" }}>AI-POWERED TRACKER · NSE/BSE · ₹ INR</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {lastPriceUpdate && (
              <span style={{ color: "#2d4060", fontSize: 10, fontFamily: "monospace" }}>
                LIVE · {lastPriceUpdate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {priceError && (
              <span style={{ color: "#ff9966", fontSize: 10 }}>⚠ {priceError}</span>
            )}
            <button onClick={refreshPrices} disabled={pricesLoading} style={{ background: "transparent", border: "1px solid #00e5a040", color: pricesLoading ? "#3d5070" : "#00e5a0", borderRadius: 10, padding: "10px 16px", cursor: pricesLoading ? "default" : "pointer", fontSize: 12, fontFamily: "inherit" }}>
              {pricesLoading ? "⏳ Fetching..." : "↻ Live Prices"}
            </button>
            <button onClick={loadSummary} disabled={summaryLoading} style={{ background: "transparent", border: "1px solid #1e2535", color: summaryLoading ? "#3d5070" : "#7a8fb5", borderRadius: 10, padding: "10px 16px", cursor: summaryLoading ? "default" : "pointer", fontSize: 12, fontFamily: "inherit" }}>
              {summaryLoading ? "Analysing..." : "🤖 AI Analysis"}
            </button>
            <button onClick={() => setShowAdd(true)} style={{ background: "#00e5a0", border: "none", color: "#0a0f1a", borderRadius: 10, padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
              + Add Position
            </button>
          </div>
        </div>

        <div style={{ maxWidth: 1140, margin: "0 auto" }}>

          {/* ── Summary Cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, padding: "24px 0 18px", animation: "fadeInUp .4s ease" }}>
            {[
              { label: "Portfolio Value", val: formatINR(totalValue, true), color: "#e8f0ff", sub: portfolio.length + " positions" },
              { label: "Total P&L", val: (totalPnl >= 0 ? "+" : "") + formatINR(Math.abs(totalPnl), true), color: totalPnl >= 0 ? "#00e5a0" : "#ff4d6d", sub: (totalPnlPct >= 0 ? "+" : "") + totalPnlPct.toFixed(2) + "% total return" },
              { label: "Cost Basis", val: formatINR(totalCost, true), color: "#7aadff", sub: "Total invested" },
              { label: "AI Sentiment", val: summaryLoading ? <LoadingDots /> : (summary?.overallSentiment || "—"), color: summary ? (SENTIMENT_COLORS[summary.overallSentiment] || "#f0c040") : "#f0c040", sub: summary ? "Risk: " + summary.riskLevel + " · Div: " + summary.diversificationScore + "/100" : "Analysing…" },
            ].map(({ label, val, color, sub }) => (
              <div key={label} className="card-hover" style={{ background: "#0b1422", border: "1px solid #1a2535", borderRadius: 14, padding: "20px 22px", transition: "all .2s" }}>
                <div style={{ color: "#3d5070", fontSize: 10, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                <div style={{ color, fontSize: 20, fontWeight: 700, fontFamily: "monospace", marginBottom: 4 }}>{val}</div>
                <div style={{ color: "#3d5070", fontSize: 11 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* ── AI Summary ── */}
          {summaryLoaded && summary && (
            <div style={{ background: "#0b1422", border: "1px solid #1a2535", borderRadius: 14, padding: 22, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, animation: "fadeInUp .5s ease" }}>
              <div>
                <div style={{ color: "#3d5070", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Portfolio Health</div>
                <p style={{ color: "#c8d8f0", fontSize: 12, lineHeight: 1.7, margin: 0 }}>{summary.summary}</p>
              </div>
              <div>
                <div style={{ color: "#3d5070", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Indian Market Context</div>
                <p style={{ color: "#c8d8f0", fontSize: 12, lineHeight: 1.7, margin: 0 }}>{summary.marketContext}</p>
              </div>
              <div>
                <div style={{ color: "#00e5a0", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>▲ Top Opportunity</div>
                <p style={{ color: "#c8d8f0", fontSize: 12, lineHeight: 1.6, margin: "0 0 12px" }}>{summary.topOpportunity}</p>
                <div style={{ color: "#ff9966", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>⚠ Watch Out For</div>
                <p style={{ color: "#c8d8f0", fontSize: 12, lineHeight: 1.6, margin: 0 }}>{summary.topRisk}</p>
              </div>
            </div>
          )}

          {/* ── Filter Tabs ── */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
            {["All", "Stock", "ETF"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 18px", borderRadius: 20, cursor: "pointer", background: filter === f ? "#00e5a020" : "transparent", border: "1px solid " + (filter === f ? "#00e5a060" : "#1a2535"), color: filter === f ? "#00e5a0" : "#4a5e7a", fontSize: 12, fontWeight: 600, fontFamily: "inherit", transition: "all .15s" }}>{f}</button>
            ))}
            <div style={{ flex: 1 }} />
            <span style={{ color: "#2d4060", fontSize: 11, fontFamily: "monospace" }}>{filtered.length} POSITIONS</span>
          </div>

          {/* ── Holdings Table ── */}
          <div style={{ background: "#0b1422", border: "1px solid #1a2535", borderRadius: 14, overflow: "hidden", animation: "fadeInUp .4s ease .1s both" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1.2fr 0.8fr 1.1fr", padding: "14px 24px", borderBottom: "1px solid #111b28", color: "#2d4060", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>
              <span>Asset</span><span>CMP (₹)</span><span>Qty</span><span>Value</span><span>P&L</span><span>Trend</span><span>Actions</span>
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#3d5070" }}>No positions yet. Click "+ Add Position" to get started.</div>
            ) : filtered.map((item, idx) => {
              const price = item.currentPrice;
              const value = price * item.shares;
              const pnl = (price - item.avgCost) * item.shares;
              const pnlPct = ((price - item.avgCost) / item.avgCost) * 100;
              const isUp = pnl >= 0;
              const sparkData = getSparkData(item);

              return (
                <div key={item.id} className="row-hover" onClick={() => setSelectedItem(item)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1.2fr 0.8fr 1.1fr", padding: "16px 24px", cursor: "pointer", borderBottom: idx < filtered.length - 1 ? "1px solid #0e1825" : "none", transition: "background .15s", animation: "fadeInUp .4s ease " + idx * 0.04 + "s both" }}>

                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{ color: "#e8f0ff", fontWeight: 700, fontSize: 15 }}>{item.ticker}</span>
                      <span style={{ background: item.type === "ETF" ? "#7aadff15" : "#b87dff15", border: "1px solid " + (item.type === "ETF" ? "#7aadff30" : "#b87dff30"), color: item.type === "ETF" ? "#7aadff" : "#b87dff", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{item.type}</span>
                    </div>
                    <span style={{ color: "#3d5070", fontSize: 11 }}>{item.name}</span>
                  </div>

                  {/* CMP — click to update */}
                  <div style={{ alignSelf: "center" }}>
                    <div style={{ color: "#e8f0ff", fontFamily: "monospace", fontSize: 13 }}>{formatINR(price)}</div>
                    <div
                      onClick={e => { e.stopPropagation(); setUpdatePriceItem(item); }}
                      style={{ color: "#2d4060", fontSize: 10, cursor: "pointer", marginTop: 2 }}
                      title="Click to update price"
                    >✏ update</div>
                  </div>

                  <div style={{ color: "#7a8fb5", fontFamily: "monospace", fontSize: 13, alignSelf: "center" }}>{item.shares}</div>
                  <div style={{ color: "#e8f0ff", fontFamily: "monospace", fontSize: 13, alignSelf: "center" }}>{formatINR(value, true)}</div>

                  <div style={{ alignSelf: "center" }}>
                    <div style={{ color: isUp ? "#00e5a0" : "#ff4d6d", fontFamily: "monospace", fontSize: 13 }}>{isUp ? "+" : ""}{formatINR(pnl, true)}</div>
                    <div style={{ color: isUp ? "#00a870" : "#cc3355", fontSize: 11 }}>{isUp ? "▲" : "▼"} {Math.abs(pnlPct).toFixed(1)}%</div>
                    {item.priceChangePct !== undefined && (
                      <div style={{ color: item.priceChangePct >= 0 ? "#00e5a080" : "#ff4d6d80", fontSize: 10, marginTop: 1 }}>
                        Today: {item.priceChangePct >= 0 ? "+" : ""}{item.priceChangePct?.toFixed(2)}%
                      </div>
                    )}
                  </div>

                  <div style={{ alignSelf: "center" }}>
                    <Sparkline data={sparkData} color={isUp ? "#00e5a0" : "#ff4d6d"} />
                  </div>

                  <div style={{ alignSelf: "center", display: "flex", gap: 5 }} onClick={e => e.stopPropagation()}>
                    <button className="btn-sm" onClick={() => setSelectedItem(item)} style={{ background: "#00e5a010", border: "1px solid #00e5a030", color: "#00e5a0", fontWeight: 600 }}>Analyse</button>
                    <button className="btn-sm" onClick={() => setEditItem(item)} style={{ background: "#7aadff10", border: "1px solid #7aadff30", color: "#7aadff" }}>✏</button>
                    <button className="btn-sm" onClick={() => handleDelete(item.id)} style={{ background: "#ff4d6d10", border: "1px solid #ff4d6d20", color: "#ff4d6d" }}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>

          <p style={{ color: "#1e2d45", fontSize: 10, marginTop: 16, textAlign: "center", fontFamily: "monospace" }}>
            AI ANALYSIS IS FOR INFORMATIONAL PURPOSES ONLY · NOT SEBI REGISTERED INVESTMENT ADVICE
          </p>
        </div>
      </div>

      {showAdd && <PositionModal onSave={handleAdd} onClose={() => setShowAdd(false)} />}
      {editItem && <PositionModal existing={editItem} onSave={handleEdit} onClose={() => setEditItem(null)} />}
      {updatePriceItem && <UpdatePriceModal item={updatePriceItem} onUpdate={(p) => handleUpdatePrice(updatePriceItem.id, p)} onClose={() => setUpdatePriceItem(null)} />}
      {selectedItem && <AnalysisPanel item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </>
  );
}
