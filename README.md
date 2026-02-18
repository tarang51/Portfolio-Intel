# 📈 Portfolio Intel

An AI-powered Indian stock portfolio tracker with live NSE/BSE prices and market sentiment analysis.

![Portfolio Intel](https://img.shields.io/badge/Built%20with-React-61DAFB?style=flat&logo=react) ![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=flat&logo=node.js) ![Gemini](https://img.shields.io/badge/AI-Google%20Gemini-4285F4?style=flat&logo=google)

---

## ✨ Features

- 📊 **Live NSE/BSE prices** — auto-fetched from Yahoo Finance, refreshes every 5 minutes
- 🤖 **AI sentiment analysis** — powered by Google Gemini (free tier)
- 🎯 **Price projections** — 3-month and 12-month targets per holding
- ⚠️ **Risk assessment** — key drivers, risks, and personalised recommendations
- 📈 **Sparkline charts** — real 7-day price history per position
- 💾 **Persistent storage** — portfolio saves in your browser automatically
- ₹ **Indian number formatting** — lakhs, crores, proper INR display

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 |
| Backend | Node.js + Express |
| AI Analysis | Google Gemini 2.5 Flash (free) |
| Market Data | Yahoo Finance (no API key needed) |
| Styling | Inline CSS (no external UI library) |

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org) v18 or higher
- A free [Google Gemini API key](https://aistudio.google.com)

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/portfolio-intel.git
cd portfolio-intel

# 2. Install dependencies
npm install

# 3. Set up your API key
cp .env.example .env
# Open .env and paste your Gemini API key
```

### Running the App

You need **two terminals open simultaneously:**

**Terminal 1 — Start the proxy server:**
```bash
node server.js
```

**Terminal 2 — Start the React app:**
```bash
npm start
```

Your browser will open at `http://localhost:3000` automatically.

---

## 📁 Project Structure

```
portfolio-intel/
├── src/
│   ├── App.js          ← Main React app
│   └── index.js        ← Entry point
├── public/
│   └── index.html
├── server.js           ← Express proxy + Yahoo Finance price API
├── .env.example        ← Copy this to .env and add your key
├── .env                ← Your API key (never commit this!)
├── package.json
└── SETUP-GUIDE.html    ← Detailed setup instructions
```

---

## 🔧 Adding Your Stocks

1. Click **+ Add Position** in the app
2. Type your **NSE ticker** (e.g. `RELIANCE`, `TCS`, `HDFCBANK`)
3. Tab out of the ticker field — **current price is fetched automatically**
4. Enter your average buy price and number of shares
5. Click **Add Position**

No need to remember Yahoo Finance suffixes — the app handles `.NS` mapping automatically for 80+ popular NSE tickers.

---

## 📡 API Endpoints (server.js)

| Endpoint | Method | Description |
|---|---|---|
| `/api/price/:ticker` | GET | Live price for one NSE ticker |
| `/api/prices` | POST | Batch live prices for multiple tickers |
| `/api/claude` | POST | Gemini AI analysis proxy |
| `/health` | GET | Server health check |

---

## ⚠️ Disclaimer

AI analysis is for **informational purposes only**. This is not SEBI-registered investment advice. Always do your own research before making investment decisions.

---

## 📄 License

MIT License — free to use and modify.
