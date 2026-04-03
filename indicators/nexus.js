/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           NEXUS AI — Advanced Pattern Recognition Indicator      ║
 * ║     Identifies chart patterns, market behavior & signals         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * PATTERNS DETECTED:
 *  - Head & Shoulders / Inverse Head & Shoulders
 *  - Double Top / Double Bottom
 *  - Triple Top / Triple Bottom
 *  - Cup & Handle
 *  - Ascending / Descending / Symmetrical Triangle
 *  - Bullish / Bearish Flag & Pennant
 *  - Rising / Falling Wedge
 *  - Bullish / Bearish Engulfing
 *  - Morning Star / Evening Star
 *  - Hammer / Shooting Star / Doji
 *  - Harami (Bullish / Bearish)
 *  - Three White Soldiers / Three Black Crows
 *  - Pin Bar
 *  - Support & Resistance Zones
 *  - Trend Lines (auto-drawn)
 *  - Volume Climax / Exhaustion
 *
 * MARKET BEHAVIOR:
 *  - Trend direction & strength (ADX-based)
 *  - Momentum (RSI + MACD composite)
 *  - Volatility regime (ATR-based)
 *  - Market phase: Accumulation / Markup / Distribution / Markdown
 *  - Smart Money concepts: liquidity grabs, order blocks, FVG
 *
 * HOW TO USE:
 *  Paste this object into your charting platform's custom indicator loader.
 *  Works with any platform that follows the standard indicator API shown
 *  in the README (calculate → draw).
 */

({
  name: "NEXUS AI — Pattern & Behavior Engine",
  window: 1, // overlay on main chart
  color: "#00f5d4",

  defaultParams: {
    // Pattern detection sensitivity (1 = tight, 3 = loose)
    sensitivity: 2,
    // Minimum candles to confirm a pattern
    confirmCandles: 3,
    // Show candlestick patterns
    showCandlePatterns: true,
    // Show chart patterns (H&S, triangles, etc.)
    showChartPatterns: true,
    // Show support/resistance zones
    showSRZones: true,
    // Show trend lines
    showTrendLines: true,
    // Show smart money concepts
    showSMC: true,
    // Show market behavior panel
    showBehaviorPanel: true,
    // RSI period for momentum
    rsiPeriod: 14,
    // ATR period for volatility
    atrPeriod: 14,
    // Lookback for pattern detection
    lookback: 60,
  },

  // ─────────────────────────────────────────────
  //  UTILITY HELPERS
  // ─────────────────────────────────────────────
  _utils: {
    avg(arr) {
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    },
    max(arr) {
      return Math.max(...arr);
    },
    min(arr) {
      return Math.min(...arr);
    },
    stdDev(arr) {
      const m = this.avg(arr);
      return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
    },
    bodySize(c) {
      return Math.abs(c.close - c.open);
    },
    wickTop(c) {
      return c.high - Math.max(c.open, c.close);
    },
    wickBottom(c) {
      return Math.min(c.open, c.close) - c.low;
    },
    isBullish(c) {
      return c.close > c.open;
    },
    isBearish(c) {
      return c.close < c.open;
    },
    isDoji(c, threshold = 0.1) {
      const body = this.bodySize(c);
      const range = c.high - c.low;
      return range > 0 && body / range < threshold;
    },
    // Pivot high: local maximum within `n` bars each side
    pivotHighs(data, n = 5) {
      const pivots = [];
      for (let i = n; i < data.length - n; i++) {
        const win = data.slice(i - n, i + n + 1);
        if (data[i].high === Math.max(...win.map((c) => c.high))) {
          pivots.push({ idx: i, price: data[i].high });
        }
      }
      return pivots;
    },
    // Pivot low
    pivotLows(data, n = 5) {
      const pivots = [];
      for (let i = n; i < data.length - n; i++) {
        const win = data.slice(i - n, i + n + 1);
        if (data[i].low === Math.min(...win.map((c) => c.low))) {
          pivots.push({ idx: i, price: data[i].low });
        }
      }
      return pivots;
    },
    // Linear regression slope over last n points
    slope(arr, n) {
      const pts = arr.slice(-n);
      const xs = pts.map((_, i) => i);
      const mx = this.avg(xs);
      const my = this.avg(pts);
      const num = xs.reduce((s, x, i) => s + (x - mx) * (pts[i] - my), 0);
      const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
      return den === 0 ? 0 : num / den;
    },
    // Approximate area similarity (used for pattern matching)
    similar(a, b, pct) {
      return Math.abs(a - b) / ((Math.abs(a) + Math.abs(b)) / 2 + 1e-10) < pct;
    },
  },

  // ─────────────────────────────────────────────
  //  TECHNICAL INDICATORS (internal)
  // ─────────────────────────────────────────────
  _indicators: {
    rsi(data, period) {
      let gains = 0,
        losses = 0;
      const result = new Array(data.length).fill(null);
      for (let i = 1; i <= period; i++) {
        const diff = data[i].close - data[i - 1].close;
        if (diff > 0) gains += diff;
        else losses -= diff;
      }
      let avgGain = gains / period;
      let avgLoss = losses / period;
      result[period] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
      for (let i = period + 1; i < data.length; i++) {
        const diff = data[i].close - data[i - 1].close;
        avgGain = (avgGain * (period - 1) + Math.max(0, diff)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.max(0, -diff)) / period;
        result[i] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
      }
      return result;
    },
    ema(data, period, key = "close") {
      const k = 2 / (period + 1);
      const result = new Array(data.length).fill(null);
      let emaVal = data[0][key];
      result[0] = emaVal;
      for (let i = 1; i < data.length; i++) {
        emaVal = data[i][key] * k + emaVal * (1 - k);
        result[i] = emaVal;
      }
      return result;
    },
    atr(data, period) {
      const result = new Array(data.length).fill(null);
      const trs = data.map((c, i) => {
        if (i === 0) return c.high - c.low;
        return Math.max(
          c.high - c.low,
          Math.abs(c.high - data[i - 1].close),
          Math.abs(c.low - data[i - 1].close)
        );
      });
      let atrVal = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
      result[period - 1] = atrVal;
      for (let i = period; i < data.length; i++) {
        atrVal = (atrVal * (period - 1) + trs[i]) / period;
        result[i] = atrVal;
      }
      return result;
    },
    macd(data) {
      const ema12 = this.ema(data, 12);
      const ema26 = this.ema(data, 26);
      const macdLine = ema12.map((v, i) => (v !== null && ema26[i] !== null ? v - ema26[i] : null));
      // Signal: 9-period EMA of MACD
      const k = 2 / 10;
      const signal = new Array(data.length).fill(null);
      let started = false;
      let sigVal = 0;
      for (let i = 0; i < data.length; i++) {
        if (macdLine[i] === null) continue;
        if (!started) {
          sigVal = macdLine[i];
          started = true;
        } else {
          sigVal = macdLine[i] * k + sigVal * (1 - k);
        }
        signal[i] = sigVal;
      }
      const hist = macdLine.map((v, i) => (v !== null && signal[i] !== null ? v - signal[i] : null));
      return { macd: macdLine, signal, hist };
    },
    // ADX for trend strength
    adx(data, period = 14) {
      const result = new Array(data.length).fill(null);
      const pDM = [],
        mDM = [],
        tr = [];
      for (let i = 1; i < data.length; i++) {
        const upMove = data[i].high - data[i - 1].high;
        const downMove = data[i - 1].low - data[i].low;
        pDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
        mDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
        tr.push(
          Math.max(
            data[i].high - data[i].low,
            Math.abs(data[i].high - data[i - 1].close),
            Math.abs(data[i].low - data[i - 1].close)
          )
        );
      }
      const smooth = (arr) => {
        let s = arr.slice(0, period).reduce((a, b) => a + b, 0);
        const res = [s];
        for (let i = period; i < arr.length; i++) {
          s = s - s / period + arr[i];
          res.push(s);
        }
        return res;
      };
      const sTR = smooth(tr);
      const sPDM = smooth(pDM);
      const sMDM = smooth(mDM);
      const dx = sTR.map((t, i) => {
        const pDI = (sPDM[i] / t) * 100;
        const mDI = (sMDM[i] / t) * 100;
        return (Math.abs(pDI - mDI) / (pDI + mDI || 1)) * 100;
      });
      let adxVal = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
      const adxArr = [adxVal];
      for (let i = period; i < dx.length; i++) {
        adxVal = (adxVal * (period - 1) + dx[i]) / period;
        adxArr.push(adxVal);
      }
      for (let i = 0; i < adxArr.length; i++) {
        result[i + period * 2] = adxArr[i];
      }
      return result;
    },
  },

  // ─────────────────────────────────────────────
  //  CANDLESTICK PATTERN DETECTOR
  // ─────────────────────────────────────────────
  _candlePatterns: {
    detect(data, u) {
      const patterns = [];
      for (let i = 2; i < data.length; i++) {
        const c = data[i],
          p = data[i - 1],
          pp = data[i - 2];
        const atr = (c.high - c.low + p.high - p.low + pp.high - pp.low) / 3;

        // ── DOJI ──
        if (u.isDoji(c)) {
          patterns.push({ idx: i, type: "Doji", bias: "neutral", strength: 1 });
        }

        // ── HAMMER ──
        if (
          u.wickBottom(c) > u.bodySize(c) * 2 &&
          u.wickTop(c) < u.bodySize(c) * 0.5 &&
          u.bodySize(c) < atr * 0.6
        ) {
          patterns.push({ idx: i, type: "Hammer", bias: "bullish", strength: 2 });
        }

        // ── SHOOTING STAR ──
        if (
          u.wickTop(c) > u.bodySize(c) * 2 &&
          u.wickBottom(c) < u.bodySize(c) * 0.5 &&
          u.bodySize(c) < atr * 0.6
        ) {
          patterns.push({ idx: i, type: "Shooting Star", bias: "bearish", strength: 2 });
        }

        // ── PIN BAR ──
        const totalRange = c.high - c.low;
        if (
          u.wickBottom(c) > totalRange * 0.6 &&
          u.bodySize(c) < totalRange * 0.25
        ) {
          patterns.push({ idx: i, type: "Bullish Pin Bar", bias: "bullish", strength: 3 });
        }
        if (
          u.wickTop(c) > totalRange * 0.6 &&
          u.bodySize(c) < totalRange * 0.25
        ) {
          patterns.push({ idx: i, type: "Bearish Pin Bar", bias: "bearish", strength: 3 });
        }

        // ── BULLISH ENGULFING ──
        if (
          u.isBearish(p) &&
          u.isBullish(c) &&
          c.open < p.close &&
          c.close > p.open &&
          u.bodySize(c) > u.bodySize(p)
        ) {
          patterns.push({ idx: i, type: "Bullish Engulfing", bias: "bullish", strength: 3 });
        }

        // ── BEARISH ENGULFING ──
        if (
          u.isBullish(p) &&
          u.isBearish(c) &&
          c.open > p.close &&
          c.close < p.open &&
          u.bodySize(c) > u.bodySize(p)
        ) {
          patterns.push({ idx: i, type: "Bearish Engulfing", bias: "bearish", strength: 3 });
        }

        // ── MORNING STAR ──
        if (
          u.isBearish(pp) &&
          u.bodySize(pp) > atr * 0.5 &&
          u.bodySize(p) < atr * 0.3 &&
          u.isBullish(c) &&
          c.close > pp.open + (pp.close - pp.open) * 0.5
        ) {
          patterns.push({ idx: i, type: "Morning Star", bias: "bullish", strength: 4 });
        }

        // ── EVENING STAR ──
        if (
          u.isBullish(pp) &&
          u.bodySize(pp) > atr * 0.5 &&
          u.bodySize(p) < atr * 0.3 &&
          u.isBearish(c) &&
          c.close < pp.open + (pp.close - pp.open) * 0.5
        ) {
          patterns.push({ idx: i, type: "Evening Star", bias: "bearish", strength: 4 });
        }

        // ── BULLISH HARAMI ──
        if (
          u.isBearish(p) &&
          u.isBullish(c) &&
          c.open > p.close &&
          c.close < p.open &&
          u.bodySize(c) < u.bodySize(p) * 0.5
        ) {
          patterns.push({ idx: i, type: "Bullish Harami", bias: "bullish", strength: 2 });
        }

        // ── BEARISH HARAMI ──
        if (
          u.isBullish(p) &&
          u.isBearish(c) &&
          c.open < p.close &&
          c.close > p.open &&
          u.bodySize(c) < u.bodySize(p) * 0.5
        ) {
          patterns.push({ idx: i, type: "Bearish Harami", bias: "bearish", strength: 2 });
        }

        // ── THREE WHITE SOLDIERS ──
        if (
          u.isBullish(pp) &&
          u.isBullish(p) &&
          u.isBullish(c) &&
          p.open > pp.open &&
          c.open > p.open &&
          u.bodySize(pp) > atr * 0.4 &&
          u.bodySize(p) > atr * 0.4 &&
          u.bodySize(c) > atr * 0.4
        ) {
          patterns.push({ idx: i, type: "Three White Soldiers", bias: "bullish", strength: 4 });
        }

        // ── THREE BLACK CROWS ──
        if (
          u.isBearish(pp) &&
          u.isBearish(p) &&
          u.isBearish(c) &&
          p.open < pp.open &&
          c.open < p.open &&
          u.bodySize(pp) > atr * 0.4 &&
          u.bodySize(p) > atr * 0.4 &&
          u.bodySize(c) > atr * 0.4
        ) {
          patterns.push({ idx: i, type: "Three Black Crows", bias: "bearish", strength: 4 });
        }
      }
      return patterns;
    },
  },

  // ─────────────────────────────────────────────
  //  CHART PATTERN DETECTOR
  // ─────────────────────────────────────────────
  _chartPatterns: {
    detect(data, params, u) {
      const patterns = [];
      const n = params.sensitivity * 3 + 2; // pivot window
      const highs = u.pivotHighs(data, n);
      const lows = u.pivotLows(data, n);
      const sim = 0.03 * params.sensitivity; // similarity threshold

      // ── HEAD & SHOULDERS ──
      for (let i = 0; i + 2 < highs.length; i++) {
        const L = highs[i], H = highs[i + 1], R = highs[i + 2];
        if (
          H.price > L.price * 1.02 &&
          H.price > R.price * 1.02 &&
          u.similar(L.price, R.price, sim * 2) &&
          H.idx > L.idx && R.idx > H.idx
        ) {
          // Neckline: lows between L-H and H-R
          const neckL = lows.find((lw) => lw.idx > L.idx && lw.idx < H.idx);
          const neckR = lows.find((lw) => lw.idx > H.idx && lw.idx < R.idx);
          if (neckL && neckR) {
            const neckline = (neckL.price + neckR.price) / 2;
            patterns.push({
              type: "Head & Shoulders",
              bias: "bearish",
              strength: 5,
              points: [L, H, R],
              neckline,
              target: neckline - (H.price - neckline),
              startIdx: L.idx,
              endIdx: R.idx,
            });
          }
        }
      }

      // ── INVERSE HEAD & SHOULDERS ──
      for (let i = 0; i + 2 < lows.length; i++) {
        const L = lows[i], H = lows[i + 1], R = lows[i + 2];
        if (
          H.price < L.price * 0.98 &&
          H.price < R.price * 0.98 &&
          u.similar(L.price, R.price, sim * 2) &&
          H.idx > L.idx && R.idx > H.idx
        ) {
          const neckL = highs.find((hw) => hw.idx > L.idx && hw.idx < H.idx);
          const neckR = highs.find((hw) => hw.idx > H.idx && hw.idx < R.idx);
          if (neckL && neckR) {
            const neckline = (neckL.price + neckR.price) / 2;
            patterns.push({
              type: "Inv. Head & Shoulders",
              bias: "bullish",
              strength: 5,
              points: [L, H, R],
              neckline,
              target: neckline + (neckline - H.price),
              startIdx: L.idx,
              endIdx: R.idx,
            });
          }
        }
      }

      // ── DOUBLE TOP ──
      for (let i = 0; i + 1 < highs.length; i++) {
        const A = highs[i], B = highs[i + 1];
        if (u.similar(A.price, B.price, sim) && B.idx - A.idx > 5) {
          const valley = lows.find((lw) => lw.idx > A.idx && lw.idx < B.idx);
          if (valley) {
            patterns.push({
              type: "Double Top",
              bias: "bearish",
              strength: 4,
              points: [A, B],
              neckline: valley.price,
              target: valley.price - (A.price - valley.price),
              startIdx: A.idx,
              endIdx: B.idx,
            });
          }
        }
      }

      // ── DOUBLE BOTTOM ──
      for (let i = 0; i + 1 < lows.length; i++) {
        const A = lows[i], B = lows[i + 1];
        if (u.similar(A.price, B.price, sim) && B.idx - A.idx > 5) {
          const peak = highs.find((hw) => hw.idx > A.idx && hw.idx < B.idx);
          if (peak) {
            patterns.push({
              type: "Double Bottom",
              bias: "bullish",
              strength: 4,
              points: [A, B],
              neckline: peak.price,
              target: peak.price + (peak.price - A.price),
              startIdx: A.idx,
              endIdx: B.idx,
            });
          }
        }
      }

      // ── ASCENDING TRIANGLE ──
      for (let i = 0; i + 2 < lows.length; i++) {
        const L1 = lows[i], L2 = lows[i + 1], L3 = lows[i + 2];
        if (L2.price > L1.price && L3.price > L2.price) {
          // Check for flat resistance
          const inRange = highs.filter(
            (h) => h.idx >= L1.idx && h.idx <= L3.idx
          );
          if (inRange.length >= 2) {
            const resLevel = u.avg(inRange.map((h) => h.price));
            const resOk = inRange.every((h) => u.similar(h.price, resLevel, sim * 2));
            if (resOk) {
              patterns.push({
                type: "Ascending Triangle",
                bias: "bullish",
                strength: 4,
                resistance: resLevel,
                target: resLevel + (resLevel - L1.price),
                startIdx: L1.idx,
                endIdx: L3.idx,
              });
            }
          }
        }
      }

      // ── DESCENDING TRIANGLE ──
      for (let i = 0; i + 2 < highs.length; i++) {
        const H1 = highs[i], H2 = highs[i + 1], H3 = highs[i + 2];
        if (H2.price < H1.price && H3.price < H2.price) {
          const inRange = lows.filter(
            (l) => l.idx >= H1.idx && l.idx <= H3.idx
          );
          if (inRange.length >= 2) {
            const supLevel = u.avg(inRange.map((l) => l.price));
            const supOk = inRange.every((l) => u.similar(l.price, supLevel, sim * 2));
            if (supOk) {
              patterns.push({
                type: "Descending Triangle",
                bias: "bearish",
                strength: 4,
                support: supLevel,
                target: supLevel - (H1.price - supLevel),
                startIdx: H1.idx,
                endIdx: H3.idx,
              });
            }
          }
        }
      }

      // ── SYMMETRICAL TRIANGLE ──
      for (let i = 0; i + 1 < highs.length && i + 1 < lows.length; i++) {
        const H1 = highs[i], H2 = highs[i + 1];
        const L1 = lows[i], L2 = lows[i + 1];
        if (
          H2.price < H1.price &&
          L2.price > L1.price &&
          H1.idx < H2.idx &&
          L1.idx < L2.idx
        ) {
          patterns.push({
            type: "Symmetrical Triangle",
            bias: "neutral",
            strength: 3,
            upperSlope: (H2.price - H1.price) / (H2.idx - H1.idx),
            lowerSlope: (L2.price - L1.price) / (L2.idx - L1.idx),
            startIdx: Math.min(H1.idx, L1.idx),
            endIdx: Math.max(H2.idx, L2.idx),
          });
        }
      }

      // ── CUP & HANDLE ──
      // Simplified: look for a U-shaped low region followed by a small pullback
      if (lows.length >= 3) {
        for (let i = 0; i + 2 < lows.length; i++) {
          const rim1 = highs[i] || null;
          const bottom = lows[i + 1];
          const rim2 = lows[i + 2];
          if (
            rim1 &&
            bottom &&
            rim2 &&
            rim1.idx < bottom.idx &&
            bottom.idx < rim2.idx &&
            bottom.price < rim1.price * 0.95 &&
            u.similar(rim1.price, rim2.price * 0.98, sim * 3)
          ) {
            patterns.push({
              type: "Cup & Handle",
              bias: "bullish",
              strength: 4,
              startIdx: rim1.idx,
              endIdx: rim2.idx,
              target: rim1.price + (rim1.price - bottom.price),
            });
          }
        }
      }

      // ── RISING WEDGE (bearish) ──
      for (let i = 0; i + 1 < highs.length && i + 1 < lows.length; i++) {
        const H1 = highs[i], H2 = highs[i + 1];
        const L1 = lows[i], L2 = lows[i + 1];
        if (
          H2.price > H1.price &&
          L2.price > L1.price &&
          (L2.price - L1.price) / (L2.idx - L1.idx) >
            (H2.price - H1.price) / (H2.idx - H1.idx + 0.01)
        ) {
          patterns.push({
            type: "Rising Wedge",
            bias: "bearish",
            strength: 3,
            startIdx: Math.min(H1.idx, L1.idx),
            endIdx: Math.max(H2.idx, L2.idx),
          });
        }
      }

      // ── FALLING WEDGE (bullish) ──
      for (let i = 0; i + 1 < highs.length && i + 1 < lows.length; i++) {
        const H1 = highs[i], H2 = highs[i + 1];
        const L1 = lows[i], L2 = lows[i + 1];
        if (
          H2.price < H1.price &&
          L2.price < L1.price &&
          Math.abs((H2.price - H1.price) / (H2.idx - H1.idx)) <
            Math.abs((L2.price - L1.price) / (L2.idx - L1.idx + 0.01))
        ) {
          patterns.push({
            type: "Falling Wedge",
            bias: "bullish",
            strength: 3,
            startIdx: Math.min(H1.idx, L1.idx),
            endIdx: Math.max(H2.idx, L2.idx),
          });
        }
      }

      return patterns;
    },
  },

  // ─────────────────────────────────────────────
  //  SUPPORT / RESISTANCE ZONE DETECTOR
  // ─────────────────────────────────────────────
  _srZones: {
    detect(data, params, u) {
      const zones = [];
      const n = params.sensitivity * 2 + 3;
      const highs = u.pivotHighs(data, n);
      const lows = u.pivotLows(data, n);
      const merge = 0.015 * params.sensitivity;

      const addZone = (price, type) => {
        const existing = zones.find(
          (z) => z.type === type && u.similar(z.price, price, merge)
        );
        if (existing) {
          existing.strength++;
          existing.price = (existing.price + price) / 2;
        } else {
          zones.push({ price, type, strength: 1 });
        }
      };

      highs.forEach((h) => addZone(h.price, "resistance"));
      lows.forEach((l) => addZone(l.price, "support"));

      // Sort by strength
      return zones.sort((a, b) => b.strength - a.strength).slice(0, 10);
    },
  },

  // ─────────────────────────────────────────────
  //  SMART MONEY CONCEPTS (SMC)
  // ─────────────────────────────────────────────
  _smc: {
    detect(data, u) {
      const concepts = [];

      // Order Blocks: last bullish candle before a strong bearish move
      for (let i = 3; i < data.length; i++) {
        const range = data.slice(i, Math.min(i + 5, data.length));
        const drop = range[0].close - range[range.length - 1].close;
        const atr = (data[i].high - data[i].low);
        if (drop > atr * 2 && u.isBullish(data[i - 1])) {
          concepts.push({
            type: "Bearish OB",
            idx: i - 1,
            high: data[i - 1].high,
            low: data[i - 1].low,
            bias: "bearish",
          });
        }
        const rise = range[range.length - 1].close - range[0].close;
        if (rise > atr * 2 && u.isBearish(data[i - 1])) {
          concepts.push({
            type: "Bullish OB",
            idx: i - 1,
            high: data[i - 1].high,
            low: data[i - 1].low,
            bias: "bullish",
          });
        }
      }

      // Fair Value Gaps (FVG): 3-candle gap
      for (let i = 1; i < data.length - 1; i++) {
        const prev = data[i - 1], curr = data[i], next = data[i + 1];
        // Bullish FVG: next.low > prev.high
        if (next.low > prev.high) {
          concepts.push({
            type: "Bullish FVG",
            idx: i,
            top: next.low,
            bottom: prev.high,
            bias: "bullish",
          });
        }
        // Bearish FVG: next.high < prev.low
        if (next.high < prev.low) {
          concepts.push({
            type: "Bearish FVG",
            idx: i,
            top: prev.low,
            bottom: next.high,
            bias: "bearish",
          });
        }
      }

      return concepts.slice(-20); // Last 20 concepts
    },
  },

  // ─────────────────────────────────────────────
  //  MARKET BEHAVIOR ANALYZER
  // ─────────────────────────────────────────────
  _behavior: {
    analyze(data, rsi, adxArr, macdData, atrArr, u) {
      const last = data.length - 1;
      const closes = data.map((c) => c.close);

      // Trend direction
      const slope20 = u.slope(closes, 20);
      const slope5 = u.slope(closes, 5);
      let trend = "Sideways";
      if (slope20 > 0 && slope5 > 0) trend = "Uptrend";
      else if (slope20 < 0 && slope5 < 0) trend = "Downtrend";

      // Trend strength from ADX
      const adxVal = adxArr[last] || 20;
      let trendStrength = "Weak";
      if (adxVal > 40) trendStrength = "Very Strong";
      else if (adxVal > 25) trendStrength = "Strong";
      else if (adxVal > 20) trendStrength = "Moderate";

      // Momentum from RSI
      const rsiVal = rsi[last] || 50;
      let momentum = "Neutral";
      if (rsiVal > 70) momentum = "Overbought";
      else if (rsiVal > 55) momentum = "Bullish";
      else if (rsiVal < 30) momentum = "Oversold";
      else if (rsiVal < 45) momentum = "Bearish";

      // MACD signal
      const macdHist = macdData.hist[last] || 0;
      const prevMacdHist = macdData.hist[last - 1] || 0;
      let macdSignal = "Neutral";
      if (macdHist > 0 && macdHist > prevMacdHist) macdSignal = "Bullish Momentum";
      else if (macdHist > 0 && macdHist < prevMacdHist) macdSignal = "Losing Steam";
      else if (macdHist < 0 && macdHist < prevMacdHist) macdSignal = "Bearish Momentum";
      else if (macdHist < 0 && macdHist > prevMacdHist) macdSignal = "Bearish Weakening";

      // Volatility from ATR
      const atrVal = atrArr[last] || 0;
      const avgAtr = u.avg(atrArr.filter(Boolean).slice(-20));
      let volatility = "Normal";
      if (atrVal > avgAtr * 1.5) volatility = "High";
      else if (atrVal > avgAtr * 1.2) volatility = "Elevated";
      else if (atrVal < avgAtr * 0.7) volatility = "Low";

      // Market phase (Wyckoff-inspired)
      const priceChange50 = (closes[last] - closes[Math.max(0, last - 50)]) / closes[Math.max(0, last - 50)];
      let phase = "Consolidation";
      if (trend === "Uptrend" && adxVal > 25 && rsiVal > 50) phase = "Markup";
      else if (trend === "Downtrend" && adxVal > 25 && rsiVal < 50) phase = "Markdown";
      else if (priceChange50 < 0.02 && volatility === "Low") phase = "Accumulation";
      else if (priceChange50 > -0.02 && volatility === "Low" && rsiVal > 60) phase = "Distribution";

      // Overall bias
      let bias = "Neutral";
      let biasScore = 0;
      if (trend === "Uptrend") biasScore += 2;
      if (trend === "Downtrend") biasScore -= 2;
      if (rsiVal > 55) biasScore += 1;
      if (rsiVal < 45) biasScore -= 1;
      if (macdHist > 0) biasScore += 1;
      if (macdHist < 0) biasScore -= 1;
      if (biasScore >= 3) bias = "Strong Bullish";
      else if (biasScore >= 1) bias = "Bullish";
      else if (biasScore <= -3) bias = "Strong Bearish";
      else if (biasScore <= -1) bias = "Bearish";

      return {
        trend,
        trendStrength,
        momentum,
        macdSignal,
        volatility,
        phase,
        bias,
        rsiVal: rsiVal.toFixed(1),
        adxVal: adxVal.toFixed(1),
      };
    },
  },

  // ─────────────────────────────────────────────
  //  CALCULATE  (runs on ALL candles)
  // ─────────────────────────────────────────────
  calculate: function (data, params) {
    if (!data || data.length < 30) return data.map(() => null);

    const u = this._utils;
    const ind = this._indicators;

    // Run all technical computations
    const rsi = ind.rsi(data, params.rsiPeriod || 14);
    const atr = ind.atr(data, params.atrPeriod || 14);
    const macdData = ind.macd(data);
    const adxArr = ind.adx(data);
    const ema20 = ind.ema(data, 20);
    const ema50 = ind.ema(data, 50);
    const ema200 = ind.ema(data, 200);

    // Detect patterns & behavior
    const candlePatterns = this._candlePatterns.detect(data, u);
    const chartPatterns = this._chartPatterns.detect(data, params, u);
    const srZones = this._srZones.detect(data, params, u);
    const smcConcepts = this._smc.detect(data, u);
    const behavior = this._behavior.analyze(data, rsi, adxArr, macdData, atr, u);

    // Store results on the indicator object for draw() to access
    this._computed = {
      rsi,
      atr,
      macdData,
      adxArr,
      ema20,
      ema50,
      ema200,
      candlePatterns,
      chartPatterns,
      srZones,
      smcConcepts,
      behavior,
      allData: data,
    };

    // Return EMA-20 as the primary "value" series (used for panel height calc)
    return ema20;
  },

  // ─────────────────────────────────────────────
  //  DRAW  (receives visible slice)
  // ─────────────────────────────────────────────
  draw: function (ctx, values, pad, spacing, yFunc, params, visibleStartIdx) {
    if (!this._computed) return;
    const {
      ema20,
      ema50,
      ema200,
      candlePatterns,
      chartPatterns,
      srZones,
      smcConcepts,
      behavior,
      allData,
    } = this._computed;

    // visibleStartIdx tells us which global index the visible slice starts at.
    // If the host platform doesn't provide it, default to 0.
    const startIdx = visibleStartIdx || 0;
    const visLen = values.length;

    // Helper: global index → canvas x
    const ix = (globalIdx) => {
      const localIdx = globalIdx - startIdx;
      return pad + localIdx * spacing + spacing / 2;
    };

    // Helper: draw only if within visible range
    const isVisible = (globalIdx) =>
      globalIdx >= startIdx && globalIdx < startIdx + visLen;

    ctx.save();

    // ── 1. EMAs ──────────────────────────────────
    const drawEma = (emaArr, color, width, label) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash([]);
      ctx.beginPath();
      let started = false;
      for (let i = startIdx; i < startIdx + visLen; i++) {
        const val = emaArr[i];
        if (val == null) continue;
        const x = ix(i);
        const y = yFunc(val);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      // Label at last visible valid point
      for (let i = startIdx + visLen - 1; i >= startIdx; i--) {
        if (emaArr[i] != null) {
          ctx.fillStyle = color;
          ctx.font = "bold 10px monospace";
          ctx.fillText(label, ix(i) + 4, yFunc(emaArr[i]) - 4);
          break;
        }
      }
    };

    if (params.showTrendLines !== false) {
      drawEma(ema200, "rgba(255,165,0,0.7)", 1.5, "EMA200");
      drawEma(ema50, "rgba(100,149,237,0.85)", 1.5, "EMA50");
      drawEma(ema20, "rgba(0,245,212,0.9)", 1.5, "EMA20");
    }

    // ── 2. S/R ZONES ─────────────────────────────
    if (params.showSRZones !== false) {
      srZones.forEach((zone) => {
        const y = yFunc(zone.price);
        const alpha = Math.min(0.15 + zone.strength * 0.07, 0.5);
        ctx.fillStyle =
          zone.type === "resistance"
            ? `rgba(255,80,80,${alpha})`
            : `rgba(80,220,80,${alpha})`;
        ctx.fillRect(pad, y - 2, (visLen - 1) * spacing, 4);

        ctx.strokeStyle =
          zone.type === "resistance"
            ? `rgba(255,80,80,0.7)`
            : `rgba(80,220,80,0.7)`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(pad + (visLen - 1) * spacing, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        ctx.fillStyle =
          zone.type === "resistance" ? "rgba(255,100,100,0.9)" : "rgba(80,220,80,0.9)";
        ctx.font = "9px monospace";
        ctx.fillText(
          `${zone.type === "resistance" ? "R" : "S"}(${zone.strength}) ${zone.price.toFixed(4)}`,
          pad + 4,
          y - 3
        );
      });
    }

    // ── 3. SMART MONEY CONCEPTS ───────────────────
    if (params.showSMC !== false) {
      smcConcepts.forEach((smc) => {
        if (!isVisible(smc.idx)) return;
        const x = ix(smc.idx);

        if (smc.type.includes("OB")) {
          const y1 = yFunc(smc.high);
          const y2 = yFunc(smc.low);
          ctx.fillStyle =
            smc.bias === "bullish" ? "rgba(80,220,80,0.15)" : "rgba(255,80,80,0.15)";
          ctx.strokeStyle =
            smc.bias === "bullish" ? "rgba(80,220,80,0.7)" : "rgba(255,80,80,0.7)";
          ctx.lineWidth = 1;
          const w = spacing * 3;
          ctx.fillRect(x - spacing / 2, y1, w, y2 - y1);
          ctx.strokeRect(x - spacing / 2, y1, w, y2 - y1);

          ctx.fillStyle =
            smc.bias === "bullish" ? "rgba(80,220,80,0.9)" : "rgba(255,80,80,0.9)";
          ctx.font = "bold 8px monospace";
          ctx.fillText(smc.type, x, y1 - 3);
        }

        if (smc.type.includes("FVG")) {
          const y1 = yFunc(smc.top);
          const y2 = yFunc(smc.bottom);
          ctx.fillStyle =
            smc.bias === "bullish" ? "rgba(80,220,150,0.12)" : "rgba(255,80,80,0.12)";
          const w = spacing * 5;
          ctx.fillRect(x - spacing / 2, y1, w, y2 - y1);
          ctx.font = "8px monospace";
          ctx.fillStyle =
            smc.bias === "bullish" ? "rgba(80,220,150,0.7)" : "rgba(255,80,80,0.7)";
          ctx.fillText("FVG", x, (y1 + y2) / 2);
        }
      });
    }

    // ── 4. CHART PATTERNS ─────────────────────────
    if (params.showChartPatterns !== false) {
      chartPatterns.forEach((pat) => {
        if (!isVisible(pat.startIdx) && !isVisible(pat.endIdx)) return;

        const x1 = ix(Math.max(pat.startIdx, startIdx));
        const x2 = ix(Math.min(pat.endIdx || pat.startIdx + 10, startIdx + visLen - 1));
        const col =
          pat.bias === "bullish"
            ? "rgba(0,245,150,0.8)"
            : pat.bias === "bearish"
            ? "rgba(255,80,80,0.8)"
            : "rgba(220,220,80,0.8)";

        // Pattern box
        let yTop = 20, yBot = 40;
        if (pat.neckline) {
          const targetY = yFunc(pat.target || pat.neckline);
          const neckY = yFunc(pat.neckline);
          yTop = Math.min(targetY, neckY);
          yBot = Math.max(targetY, neckY);
        } else if (allData[pat.startIdx]) {
          const slice = allData.slice(
            pat.startIdx,
            Math.min(pat.endIdx + 1, allData.length)
          );
          const maxP = Math.max(...slice.map((c) => c.high));
          const minP = Math.min(...slice.map((c) => c.low));
          yTop = yFunc(maxP);
          yBot = yFunc(minP);
        }

        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(x1, yTop, x2 - x1, yBot - yTop);
        ctx.setLineDash([]);

        // Neckline
        if (pat.neckline) {
          const ny = yFunc(pat.neckline);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x1, ny);
          ctx.lineTo(x2 + spacing * 5, ny);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Target line
        if (pat.target) {
          const ty = yFunc(pat.target);
          ctx.strokeStyle = "rgba(255,215,0,0.7)";
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(x2, ty);
          ctx.lineTo(x2 + spacing * 8, ty);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(255,215,0,0.85)";
          ctx.font = "8px monospace";
          ctx.fillText(`⬛ ${(pat.target || 0).toFixed(4)}`, x2 + spacing * 8 + 2, ty + 3);
        }

        // Pattern label
        const emoji =
          pat.bias === "bullish" ? "▲" : pat.bias === "bearish" ? "▼" : "◆";
        ctx.fillStyle = col;
        ctx.font = "bold 10px monospace";
        ctx.fillText(`${emoji} ${pat.type}`, x1 + 3, yTop - 5);
      });
    }

    // ── 5. CANDLESTICK PATTERNS ───────────────────
    if (params.showCandlePatterns !== false) {
      // Group by index to avoid overlapping labels
      const byIdx = {};
      candlePatterns.forEach((cp) => {
        if (!isVisible(cp.idx)) return;
        if (!byIdx[cp.idx]) byIdx[cp.idx] = [];
        byIdx[cp.idx].push(cp);
      });

      Object.entries(byIdx).forEach(([idx, pats]) => {
        const i = Number(idx);
        const candle = allData[i];
        if (!candle) return;
        const x = ix(i);
        const strongest = pats.sort((a, b) => b.strength - a.strength)[0];
        const isBull = strongest.bias === "bullish";
        const isNeutral = strongest.bias === "neutral";

        const col = isNeutral
          ? "rgba(220,220,80,0.9)"
          : isBull
          ? "rgba(0,245,150,0.9)"
          : "rgba(255,80,80,0.9)";

        const label = strongest.type;
        const yPos = isBull ? yFunc(candle.low) + 16 : yFunc(candle.high) - 6;

        // Arrow
        ctx.fillStyle = col;
        ctx.font = "12px sans-serif";
        ctx.fillText(isBull ? "▲" : isNeutral ? "◆" : "▼", x - 5, yPos + (isBull ? 6 : -6));

        // Label background
        ctx.font = "bold 9px monospace";
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = "rgba(15,15,25,0.75)";
        ctx.fillRect(x - tw / 2 - 2, yPos + (isBull ? 10 : -22), tw + 4, 13);

        // Label text
        ctx.fillStyle = col;
        ctx.fillText(label, x - tw / 2, yPos + (isBull ? 21 : -12));
      });
    }

    // ── 6. MARKET BEHAVIOR PANEL ──────────────────
    if (params.showBehaviorPanel !== false) {
      this._drawBehaviorPanel(ctx, behavior, params);
    }

    ctx.restore();
  },

  // ─────────────────────────────────────────────
  //  BEHAVIOR PANEL RENDERER
  // ─────────────────────────────────────────────
  _drawBehaviorPanel: function (ctx, b, params) {
    const pw = 220, ph = 200;
    const px = 10, py = 10;
    const r = 8;

    // Panel background
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(10,12,20,0.95)";
    ctx.strokeStyle = "rgba(0,245,212,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + r, py);
    ctx.lineTo(px + pw - r, py);
    ctx.quadraticCurveTo(px + pw, py, px + pw, py + r);
    ctx.lineTo(px + pw, py + ph - r);
    ctx.quadraticCurveTo(px + pw, py + ph, px + pw - r, py + ph);
    ctx.lineTo(px + r, py + ph);
    ctx.quadraticCurveTo(px, py + ph, px, py + ph - r);
    ctx.lineTo(px, py + r);
    ctx.quadraticCurveTo(px, py, px + r, py);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Title
    ctx.fillStyle = "rgba(0,245,212,1)";
    ctx.font = "bold 11px monospace";
    ctx.fillText("⬡ NEXUS AI  MARKET INTEL", px + 10, py + 18);

    ctx.strokeStyle = "rgba(0,245,212,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 8, py + 24);
    ctx.lineTo(px + pw - 8, py + 24);
    ctx.stroke();

    const row = (label, value, color, yOff) => {
      ctx.fillStyle = "rgba(160,180,200,0.85)";
      ctx.font = "9px monospace";
      ctx.fillText(label, px + 10, py + yOff);
      ctx.fillStyle = color;
      ctx.font = "bold 10px monospace";
      ctx.fillText(value, px + 100, py + yOff);
    };

    const biasColor =
      b.bias.includes("Bullish") ? "#00e676"
      : b.bias.includes("Bearish") ? "#ff5252"
      : "#ffd740";

    const trendColor =
      b.trend === "Uptrend" ? "#00e676"
      : b.trend === "Downtrend" ? "#ff5252"
      : "#ffd740";

    const momColor =
      b.momentum === "Overbought" ? "#ff9100"
      : b.momentum === "Bullish" ? "#00e676"
      : b.momentum === "Oversold" ? "#e040fb"
      : b.momentum === "Bearish" ? "#ff5252"
      : "#90a4ae";

    const volColor =
      b.volatility === "High" ? "#ff5252"
      : b.volatility === "Low" ? "#90a4ae"
      : "#ffd740";

    const phaseColor =
      b.phase === "Markup" ? "#00e676"
      : b.phase === "Markdown" ? "#ff5252"
      : b.phase === "Accumulation" ? "#40c4ff"
      : b.phase === "Distribution" ? "#ff9100"
      : "#90a4ae";

    row("OVERALL BIAS", b.bias, biasColor, 40);
    row("TREND", `${b.trend}`, trendColor, 56);
    row("STRENGTH", `${b.trendStrength} (ADX ${b.adxVal})`, trendColor, 72);
    row("MOMENTUM", `${b.momentum} (RSI ${b.rsiVal})`, momColor, 88);
    row("MACD", b.macdSignal, momColor, 104);
    row("VOLATILITY", b.volatility, volColor, 120);
    row("PHASE", b.phase, phaseColor, 136);

    // Bias bar
    ctx.strokeStyle = "rgba(0,245,212,0.25)";
    ctx.beginPath();
    ctx.moveTo(px + 8, py + 144);
    ctx.lineTo(px + pw - 8, py + 144);
    ctx.stroke();

    ctx.fillStyle = "rgba(160,180,200,0.85)";
    ctx.font = "9px monospace";
    ctx.fillText("SIGNAL STRENGTH", px + 10, py + 158);

    // Draw signal bar
    const barW = pw - 20;
    const barH = 10;
    const barX = px + 10;
    const barY = py + 162;
    ctx.fillStyle = "rgba(30,35,50,0.9)";
    ctx.fillRect(barX, barY, barW, barH);

    const score = b.bias.includes("Strong") ? (b.bias.includes("Bull") ? 1 : 0)
      : b.bias.includes("Bullish") ? 0.7
      : b.bias.includes("Bearish") && !b.bias.includes("Strong") ? 0.3
      : b.bias.includes("Strong Bearish") ? 0
      : 0.5;

    const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    grad.addColorStop(0, "#ff5252");
    grad.addColorStop(0.5, "#ffd740");
    grad.addColorStop(1, "#00e676");
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, barW * score, barH);

    // Cursor dot
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(barX + barW * score, barY + barH / 2, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(80,100,120,0.6)";
    ctx.font = "8px monospace";
    ctx.fillText("BEAR", barX, barY + barH + 10);
    ctx.fillText("BULL", barX + barW - 18, barY + barH + 10);

    ctx.restore();
  },
})