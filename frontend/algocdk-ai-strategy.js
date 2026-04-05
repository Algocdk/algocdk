/**
 * AlgoCDK AI Strategy — Multi-Pattern Intelligence Engine
 * --------------------------------------------------------
 * Load this file via the Strategy Lab "Load File" button on the chart page.
 * The engine scores every candle across 12 pattern detectors, combines them
 * with trend/momentum/volatility filters, and emits BUY / SELL signals.
 *
 * Compatible with the AlgoCDK backtest engine (engulfing proxy is replaced
 * by this file's own generateSignals export).
 */

({
  name: 'AlgoCDK AI Strategy',
  version: '2.0',
  author: 'AlgoCDK',
  description: 'Multi-pattern AI engine: candlestick patterns + trend + momentum + volatility scoring',

  // ── Default parameters (editable via Strategy Lab params panel) ──────────
  defaultParams: {
    slPct:        1.5,   // Stop-loss %
    tpPct:        3.0,   // Take-profit %
    lot:          100,   // Lot size in $
    minScore:     3,     // Minimum confluence score to trigger a trade (1-10)
    atrPeriod:    14,    // ATR period for volatility filter
    rsiPeriod:    14,    // RSI period
    emaPeriod:    50,    // Trend EMA period
    volumeFilter: false, // Require above-average volume (set true if volume data available)
  },

  // ── Helpers ──────────────────────────────────────────────────────────────
  _ema(data, period) {
    const k = 2 / (period + 1);
    let ema = data[0].close;
    for (let i = 1; i < data.length; i++) ema = data[i].close * k + ema * (1 - k);
    return ema;
  },
  _emaArr(data, period) {
    const k = 2 / (period + 1);
    const out = new Array(data.length).fill(null);
    out[0] = data[0].close;
    for (let i = 1; i < data.length; i++) out[i] = data[i].close * k + out[i - 1] * (1 - k);
    return out;
  },
  _sma(arr, period, end) {
    if (end < period) return null;
    let s = 0;
    for (let i = end - period; i < end; i++) s += arr[i];
    return s / period;
  },
  _atr(data, period, i) {
    if (i < period) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tr = Math.max(
        data[j].high - data[j].low,
        Math.abs(data[j].high - data[j - 1].close),
        Math.abs(data[j].low  - data[j - 1].close)
      );
      sum += tr;
    }
    return sum / period;
  },
  _rsi(data, period, i) {
    if (i < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let j = i - period; j < i; j++) {
      const d = data[j].close - data[j - 1].close;
      if (d > 0) gains += d; else losses -= d;
    }
    const rs = losses === 0 ? 100 : gains / losses;
    return 100 - 100 / (1 + rs);
  },
  _body(c)    { return Math.abs(c.close - c.open); },
  _range(c)   { return c.high - c.low || 0.0001; },
  _isBull(c)  { return c.close > c.open; },
  _isBear(c)  { return c.close < c.open; },
  _upperWick(c) { return c.high - Math.max(c.open, c.close); },
  _lowerWick(c) { return Math.min(c.open, c.close) - c.low; },

  // ── Pattern detectors — each returns +score (bull), -score (bear), 0 (none)
  _patternEngulfing(d, i) {
    if (i < 1) return 0;
    const p = d[i - 1], c = d[i];
    if (this._isBear(p) && this._isBull(c) && c.open < p.close && c.close > p.open) return 2;
    if (this._isBull(p) && this._isBear(c) && c.open > p.close && c.close < p.open) return -2;
    return 0;
  },
  _patternHammer(d, i) {
    const c = d[i];
    const body = this._body(c), range = this._range(c);
    const lw = this._lowerWick(c), uw = this._upperWick(c);
    if (body / range < 0.35 && lw > body * 2 && uw < body * 0.5) return 2;   // hammer
    if (body / range < 0.35 && uw > body * 2 && lw < body * 0.5) return -2;  // shooting star
    return 0;
  },
  _patternDoji(d, i) {
    const c = d[i];
    const body = this._body(c), range = this._range(c);
    if (body / range < 0.1) {
      // Dragonfly doji (long lower wick) = bullish
      if (this._lowerWick(c) > range * 0.6) return 1;
      // Gravestone doji (long upper wick) = bearish
      if (this._upperWick(c) > range * 0.6) return -1;
    }
    return 0;
  },
  _patternMorningStar(d, i) {
    if (i < 2) return 0;
    const a = d[i - 2], b = d[i - 1], c = d[i];
    if (this._isBear(a) && this._body(b) < this._body(a) * 0.3 && this._isBull(c) && c.close > (a.open + a.close) / 2) return 3;
    if (this._isBull(a) && this._body(b) < this._body(a) * 0.3 && this._isBear(c) && c.close < (a.open + a.close) / 2) return -3;
    return 0;
  },
  _patternThreeSoldiers(d, i) {
    if (i < 2) return 0;
    const a = d[i - 2], b = d[i - 1], c = d[i];
    if (this._isBull(a) && this._isBull(b) && this._isBull(c) &&
        b.open > a.open && b.close > a.close &&
        c.open > b.open && c.close > b.close) return 3;
    if (this._isBear(a) && this._isBear(b) && this._isBear(c) &&
        b.open < a.open && b.close < a.close &&
        c.open < b.open && c.close < b.close) return -3;
    return 0;
  },
  _patternPinBar(d, i) {
    const c = d[i];
    const body = this._body(c), range = this._range(c);
    const lw = this._lowerWick(c), uw = this._upperWick(c);
    if (lw > range * 0.6 && body < range * 0.25) return 2;   // bullish pin
    if (uw > range * 0.6 && body < range * 0.25) return -2;  // bearish pin
    return 0;
  },
  _patternInsideBar(d, i) {
    if (i < 1) return 0;
    const p = d[i - 1], c = d[i];
    if (c.high < p.high && c.low > p.low) {
      // Inside bar breakout direction = parent candle direction
      return this._isBull(p) ? 1 : -1;
    }
    return 0;
  },
  _patternTweezer(d, i) {
    if (i < 1) return 0;
    const p = d[i - 1], c = d[i];
    const tol = this._range(c) * 0.05;
    if (Math.abs(p.low - c.low) < tol && this._isBear(p) && this._isBull(c)) return 2;
    if (Math.abs(p.high - c.high) < tol && this._isBull(p) && this._isBear(c)) return -2;
    return 0;
  },
  _patternBreakout(d, i, period) {
    if (i < period) return 0;
    const highs = d.slice(i - period, i).map(c => c.high);
    const lows  = d.slice(i - period, i).map(c => c.low);
    const highest = Math.max(...highs), lowest = Math.min(...lows);
    if (d[i].close > highest) return 2;
    if (d[i].close < lowest)  return -2;
    return 0;
  },
  _patternDoubleTop(d, i) {
    if (i < 10) return 0;
    const slice = d.slice(i - 10, i + 1);
    const highs = slice.map(c => c.high);
    const maxH = Math.max(...highs);
    const peaks = highs.filter(h => Math.abs(h - maxH) / maxH < 0.003);
    if (peaks.length >= 2 && this._isBear(d[i])) return -2;
    return 0;
  },
  _patternDoubleBottom(d, i) {
    if (i < 10) return 0;
    const slice = d.slice(i - 10, i + 1);
    const lows = slice.map(c => c.low);
    const minL = Math.min(...lows);
    const troughs = lows.filter(l => Math.abs(l - minL) / minL < 0.003);
    if (troughs.length >= 2 && this._isBull(d[i])) return 2;
    return 0;
  },
  _patternMACD(d, i) {
    if (i < 35) return 0;
    const closes = d.map(c => c.close);
    const ema12 = this._sma(closes, 12, i) || 0;
    const ema26 = this._sma(closes, 26, i) || 0;
    const macd  = ema12 - ema26;
    const ema12p = this._sma(closes, 12, i - 1) || 0;
    const ema26p = this._sma(closes, 26, i - 1) || 0;
    const macdP = ema12p - ema26p;
    if (macdP < 0 && macd > 0) return 2;   // bullish crossover
    if (macdP > 0 && macd < 0) return -2;  // bearish crossover
    return 0;
  },

  // ── Main signal generator ─────────────────────────────────────────────────
  // Returns array of { candleIndex, signal, score, patterns, price }
  generateSignals(data, params) {
    const p = Object.assign({}, this.defaultParams, params || {});
    const minScore = p.minScore || 3;
    const emaArr   = this._emaArr(data, p.emaPeriod);
    const signals  = [];

    for (let i = Math.max(35, p.emaPeriod); i < data.length - 1; i++) {
      const c   = data[i];
      const atr = this._atr(data, p.atrPeriod, i);
      const rsi = this._rsi(data, p.rsiPeriod, i);
      const ema = emaArr[i];
      if (!atr || !ema) continue;

      // ── Collect pattern scores ──────────────────────────────────────────
      const scores = [
        this._patternEngulfing(data, i),
        this._patternHammer(data, i),
        this._patternDoji(data, i),
        this._patternMorningStar(data, i),
        this._patternThreeSoldiers(data, i),
        this._patternPinBar(data, i),
        this._patternInsideBar(data, i),
        this._patternTweezer(data, i),
        this._patternBreakout(data, i, 20),
        this._patternDoubleTop(data, i),
        this._patternDoubleBottom(data, i),
        this._patternMACD(data, i),
      ];

      const bullScore = scores.filter(s => s > 0).reduce((a, b) => a + b, 0);
      const bearScore = Math.abs(scores.filter(s => s < 0).reduce((a, b) => a + b, 0));

      // ── Trend filter: price vs EMA ──────────────────────────────────────
      const aboveEMA = c.close > ema;
      const belowEMA = c.close < ema;

      // ── Momentum filter: RSI ────────────────────────────────────────────
      const rsiBull = rsi < 65;   // not overbought
      const rsiBear = rsi > 35;   // not oversold

      // ── Volatility filter: ATR must be meaningful ───────────────────────
      const atrOk = atr > 0;

      // ── Final decision ──────────────────────────────────────────────────
      let signal = null, finalScore = 0;

      if (bullScore >= minScore && aboveEMA && rsiBull && atrOk) {
        signal = 'buy';
        finalScore = bullScore;
      } else if (bearScore >= minScore && belowEMA && rsiBear && atrOk) {
        signal = 'sell';
        finalScore = bearScore;
      }

      if (signal) {
        signals.push({
          candleIndex: i,
          signal,
          score: finalScore,
          price: data[i + 1].open,
          rsi: Math.round(rsi),
          ema: +ema.toFixed(5),
        });
      }
    }
    return signals;
  },

  // ── AlgoCDK backtest engine hook ─────────────────────────────────────────
  // Returns 'buy' | 'sell' | null for candle i, or { signal, score } object
  getSignalAt(data, i, params) {
    const p = Object.assign({}, this.defaultParams, params || {});
    const emaArr = this._emaArr(data, p.emaPeriod);
    const atr    = this._atr(data, p.atrPeriod, i);
    const rsi    = this._rsi(data, p.rsiPeriod, i);
    const ema    = emaArr[i];
    if (!atr || !ema || i < 35) return null;

    const scores = [
      this._patternEngulfing(data, i),
      this._patternHammer(data, i),
      this._patternDoji(data, i),
      this._patternMorningStar(data, i),
      this._patternThreeSoldiers(data, i),
      this._patternPinBar(data, i),
      this._patternInsideBar(data, i),
      this._patternTweezer(data, i),
      this._patternBreakout(data, i, 20),
      this._patternDoubleTop(data, i),
      this._patternDoubleBottom(data, i),
      this._patternMACD(data, i),
    ];

    const bull = scores.filter(s => s > 0).reduce((a, b) => a + b, 0);
    const bear = Math.abs(scores.filter(s => s < 0).reduce((a, b) => a + b, 0));
    const min  = p.minScore || 3;
    const c    = data[i];

    if (bull >= min && c.close > ema && rsi < 65) return { signal: 'buy',  score: bull };
    if (bear >= min && c.close < ema && rsi > 35) return { signal: 'sell', score: bear };
    return null;
  },
})
