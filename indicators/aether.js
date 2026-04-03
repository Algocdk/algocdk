({
  name: "AETHER — Quantum Market Intelligence",
  window: 1,
  color: "#00f5ff",
  defaultParams: {
    sensitivity: 2,
    confirmCandles: 2,
    lookback: 80,
    showCandlestickPatterns: true,
    showChartPatterns: true,
    showSRZones: true,
    showSMC: true,
    showTrendLines: true,
    showBehaviorPanel: true,
    showMarketStructure: true,
    rsiPeriod: 14,
    atrPeriod: 14,
    volumeMALength: 20,
  },

  _utils: {
    avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; },
    min(arr) { return Math.min(...arr); },
    max(arr) { return Math.max(...arr); },
    body(c) { return Math.abs(c.close - c.open); },
    range(c) { return c.high - c.low; },
    upperWick(c) { return c.high - Math.max(c.open, c.close); },
    lowerWick(c) { return Math.min(c.open, c.close) - c.low; },
    isBullish(c) { return c.close > c.open; },
    isBearish(c) { return c.close < c.open; },
    isDoji(c, thresh = 0.12) {
      return this.range(c) > 0 && this.body(c) / this.range(c) < thresh;
    },
    pivotHighs(data, left = 5, right = 5) {
      const pivots = [];
      for (let i = left; i < data.length - right; i++) {
        let ok = true;
        for (let j = i - left; j <= i + right; j++) {
          if (j !== i && data[j].high >= data[i].high) { ok = false; break; }
        }
        if (ok) pivots.push({ idx: i, price: data[i].high });
      }
      return pivots;
    },
    pivotLows(data, left = 5, right = 5) {
      const pivots = [];
      for (let i = left; i < data.length - right; i++) {
        let ok = true;
        for (let j = i - left; j <= i + right; j++) {
          if (j !== i && data[j].low <= data[i].low) { ok = false; break; }
        }
        if (ok) pivots.push({ idx: i, price: data[i].low });
      }
      return pivots;
    },
    similar(a, b, tol = 0.015) {
      return Math.abs(a - b) / ((a + b) / 2) < tol;
    },
    slope(prices, period = 20) {
      if (prices.length < period) return 0;
      const x = Array.from({ length: period }, (_, i) => i);
      const y = prices.slice(-period);
      const mx = this.avg(x), my = this.avg(y);
      let num = 0, den = 0;
      for (let i = 0; i < period; i++) {
        num += (x[i] - mx) * (y[i] - my);
        den += (x[i] - mx) ** 2;
      }
      return den === 0 ? 0 : num / den;
    }
  },

  _indicators: {
    rsi(data, period) {
      let gains = 0, losses = 0;
      const result = new Array(data.length).fill(null);
      for (let i = 1; i <= period; i++) {
        const d = data[i].close - data[i-1].close;
        d > 0 ? gains += d : losses -= d;
      }
      let ag = gains / period, al = losses / period;
      result[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
      for (let i = period + 1; i < data.length; i++) {
        const d = data[i].close - data[i-1].close;
        ag = (ag * (period - 1) + Math.max(0, d)) / period;
        al = (al * (period - 1) + Math.max(0, -d)) / period;
        result[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
      }
      return result;
    },
    ema(data, period, key = "close") {
      const k = 2 / (period + 1);
      const result = new Array(data.length).fill(null);
      let val = data[0][key];
      result[0] = val;
      for (let i = 1; i < data.length; i++) {
        val = data[i][key] * k + val * (1 - k);
        result[i] = val;
      }
      return result;
    },
    atr(data, period) {
      const tr = data.map((c, i) => i === 0 ? c.high - c.low :
        Math.max(c.high - c.low, Math.abs(c.high - data[i-1].close), Math.abs(c.low - data[i-1].close)));
      const result = new Array(data.length).fill(null);
      let val = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
      result[period - 1] = val;
      for (let i = period; i < data.length; i++) {
        val = (val * (period - 1) + tr[i]) / period;
        result[i] = val;
      }
      return result;
    },
    macd(data) {
      const e12 = this.ema(data, 12), e26 = this.ema(data, 26);
      const line = e12.map((v, i) => v && e26[i] ? v - e26[i] : null);
      const sig = new Array(data.length).fill(null);
      let s = line.find(v => v !== null) || 0;
      const k = 2 / 10;
      for (let i = 0; i < data.length; i++) {
        if (line[i] === null) continue;
        s = line[i] * k + s * (1 - k);
        sig[i] = s;
      }
      const hist = line.map((v, i) => v !== null && sig[i] !== null ? v - sig[i] : null);
      return { macd: line, signal: sig, hist };
    },
    adx(data, period = 14) {
      const result = new Array(data.length).fill(null);
      const pDM = [], mDM = [], tr = [];
      for (let i = 1; i < data.length; i++) {
        const up = data[i].high - data[i-1].high;
        const dn = data[i-1].low - data[i].low;
        pDM.push(up > dn && up > 0 ? up : 0);
        mDM.push(dn > up && dn > 0 ? dn : 0);
        tr.push(Math.max(data[i].high - data[i].low,
          Math.abs(data[i].high - data[i-1].close),
          Math.abs(data[i].low - data[i-1].close)));
      }
      const smooth = arr => {
        let s = arr.slice(0, period).reduce((a, b) => a + b, 0);
        const res = [s];
        for (let i = period; i < arr.length; i++) { s = s - s / period + arr[i]; res.push(s); }
        return res;
      };
      const sTR = smooth(tr), sPDM = smooth(pDM), sMDM = smooth(mDM);
      const dx = sTR.map((t, i) => {
        const pdi = (sPDM[i] / t) * 100, mdi = (sMDM[i] / t) * 100;
        return (Math.abs(pdi - mdi) / ((pdi + mdi) || 1)) * 100;
      });
      let adxVal = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
      const adxArr = [adxVal];
      for (let i = period; i < dx.length; i++) {
        adxVal = (adxVal * (period - 1) + dx[i]) / period;
        adxArr.push(adxVal);
      }
      for (let i = 0; i < adxArr.length; i++) result[i + period * 2] = adxArr[i];
      return result;
    }
  },

  calculate: function(data, params) {
    if (!data || data.length < 50) return data.map(() => null);
    const u = this._utils;
    const ind = this._indicators;
    const rsi    = ind.rsi(data, params.rsiPeriod);
    const atr    = ind.atr(data, params.atrPeriod);
    const macd   = ind.macd(data);
    const adxArr = ind.adx(data);
    const ema20  = ind.ema(data, 20);
    const ema50  = ind.ema(data, 50);
    const ema200 = ind.ema(data, 200);
    const candlePatterns  = this._detectCandlestickPatterns(data, u, atr);
    const chartPatterns   = this._detectChartPatterns(data, params, u);
    const srZones         = this._detectSRZones(data, params, u);
    const smc             = this._detectSMC(data, u, atr);
    const marketStructure = this._detectMarketStructure(data, u);
    const behavior        = this._analyzeBehavior(data, rsi, adxArr, macd, atr, u);
    this._computed = {
      rsi, atr, macd, adxArr, ema20, ema50, ema200,
      candlePatterns, chartPatterns, srZones, smc, marketStructure, behavior,
      allData: data
    };
    return ema20;
  },

  draw: function(ctx, values, pad, spacing, yFunc, params, visibleStartIdx) {
    if (!this._computed) return;
    const c = this._computed;
    const start = visibleStartIdx || 0;
    const end   = start + values.length;
    const ix    = gi => pad + (gi - start) * spacing + spacing / 2;
    const isVis = idx => idx >= start && idx < end;
    ctx.save();
    if (params.showTrendLines) {
      this._drawEMA(ctx, c.ema200, "#ff9800", 1.8, "EMA200", ix, yFunc, start, end);
      this._drawEMA(ctx, c.ema50,  "#64b5f6", 1.6, "EMA50",  ix, yFunc, start, end);
      this._drawEMA(ctx, c.ema20,  "#00f5ff", 2.0, "EMA20",  ix, yFunc, start, end);
    }
    if (params.showSRZones)            this._drawSRZones(ctx, c.srZones, yFunc, pad, spacing, values.length);
    if (params.showSMC)                this._drawSMC(ctx, c.smc, ix, yFunc, isVis, spacing);
    if (params.showChartPatterns)      this._drawChartPatterns(ctx, c.chartPatterns, ix, yFunc, isVis, spacing, c.allData, start, end);
    if (params.showCandlestickPatterns)this._drawCandlestickPatterns(ctx, c.candlePatterns, ix, yFunc, isVis, c.allData);
    if (params.showBehaviorPanel)      this._drawBehaviorPanel(ctx, c.behavior);
    ctx.restore();
  },

  _drawEMA(ctx, arr, color, width, label, ix, yFunc, start, end) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash([]);
    ctx.beginPath();
    let started = false;
    for (let i = start; i < end; i++) {
      if (arr[i] == null) continue;
      const x = ix(i), y = yFunc(arr[i]);
      started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      started = true;
    }
    ctx.stroke();
    for (let i = end - 1; i >= start; i--) {
      if (arr[i] != null) {
        ctx.fillStyle = color; ctx.font = "bold 10px monospace";
        ctx.fillText(label, ix(i) + 6, yFunc(arr[i]) - 6);
        break;
      }
    }
  },

  _drawSRZones(ctx, zones, yFunc, pad, spacing, visLen) {
    zones.forEach(z => {
      const y = yFunc(z.price);
      const a = Math.min(0.12 + z.strength * 0.06, 0.45);
      ctx.fillStyle = z.type === "resistance" ? `rgba(255,61,110,${a})` : `rgba(0,255,157,${a})`;
      ctx.fillRect(pad, y - 2, (visLen - 1) * spacing, 4);
      ctx.strokeStyle = z.type === "resistance" ? "rgba(255,61,110,0.7)" : "rgba(0,255,157,0.7)";
      ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + (visLen - 1) * spacing, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = z.type === "resistance" ? "rgba(255,100,130,0.9)" : "rgba(0,255,157,0.9)";
      ctx.font = "9px monospace";
      ctx.fillText(`${z.type === "resistance" ? "R" : "S"}(${z.strength}) ${z.price.toFixed(4)}`, pad + 4, y - 3);
    });
  },

  _drawSMC(ctx, concepts, ix, yFunc, isVis, spacing) {
    concepts.forEach(s => {
      if (!isVis(s.idx)) return;
      const x = ix(s.idx), bull = s.bias === "bullish";
      if (s.type.includes("OB")) {
        const y1 = yFunc(s.high), y2 = yFunc(s.low);
        ctx.fillStyle   = bull ? "rgba(0,255,157,0.12)" : "rgba(255,61,110,0.12)";
        ctx.strokeStyle = bull ? "rgba(0,255,157,0.6)"  : "rgba(255,61,110,0.6)";
        ctx.lineWidth = 1;
        ctx.fillRect(x - spacing/2, y1, spacing * 3, y2 - y1);
        ctx.strokeRect(x - spacing/2, y1, spacing * 3, y2 - y1);
        ctx.fillStyle = bull ? "rgba(0,255,157,0.9)" : "rgba(255,61,110,0.9)";
        ctx.font = "bold 8px monospace"; ctx.fillText(s.type, x, y1 - 3);
      }
      if (s.type.includes("FVG")) {
        const y1 = yFunc(s.top), y2 = yFunc(s.bottom);
        ctx.fillStyle = bull ? "rgba(0,255,157,0.1)" : "rgba(255,61,110,0.1)";
        ctx.fillRect(x - spacing/2, y1, spacing * 5, y2 - y1);
        ctx.fillStyle = bull ? "rgba(0,255,157,0.7)" : "rgba(255,61,110,0.7)";
        ctx.font = "8px monospace"; ctx.fillText("FVG", x, (y1 + y2) / 2);
      }
    });
  },

  _drawChartPatterns(ctx, patterns, ix, yFunc, isVis, spacing, allData, start, end) {
    patterns.forEach(pat => {
      if (!isVis(pat.startIdx) && !isVis(pat.endIdx)) return;
      const x1 = ix(Math.max(pat.startIdx, start));
      const x2 = ix(Math.min(pat.endIdx || pat.startIdx + 10, end - 1));
      const col = pat.bias === "bullish" ? "rgba(0,255,157,0.8)" :
                  pat.bias === "bearish" ? "rgba(255,61,110,0.8)" : "rgba(255,235,59,0.8)";
      let yTop = 20, yBot = 60;
      if (pat.neckline) {
        yTop = Math.min(yFunc(pat.target || pat.neckline), yFunc(pat.neckline));
        yBot = Math.max(yFunc(pat.target || pat.neckline), yFunc(pat.neckline));
      } else if (allData[pat.startIdx]) {
        const sl = allData.slice(pat.startIdx, Math.min((pat.endIdx || pat.startIdx) + 1, allData.length));
        yTop = yFunc(Math.max(...sl.map(c => c.high)));
        yBot = yFunc(Math.min(...sl.map(c => c.low)));
      }
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([6, 3]);
      ctx.strokeRect(x1, yTop, x2 - x1, yBot - yTop); ctx.setLineDash([]);
      if (pat.neckline) {
        const ny = yFunc(pat.neckline);
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x1, ny); ctx.lineTo(x2 + spacing * 5, ny); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (pat.target) {
        const ty = yFunc(pat.target);
        ctx.strokeStyle = "rgba(255,215,0,0.7)"; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(x2, ty); ctx.lineTo(x2 + spacing * 8, ty); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,215,0,0.9)"; ctx.font = "8px monospace";
        ctx.fillText(`⬛ ${pat.target.toFixed(4)}`, x2 + spacing * 8 + 2, ty + 3);
      }
      const emoji = pat.bias === "bullish" ? "▲" : pat.bias === "bearish" ? "▼" : "◆";
      ctx.fillStyle = col; ctx.font = "bold 10px monospace";
      ctx.fillText(`${emoji} ${pat.type}`, x1 + 3, yTop - 5);
    });
  },

  _drawCandlestickPatterns(ctx, patterns, ix, yFunc, isVis, allData) {
    const byIdx = {};
    patterns.forEach(cp => {
      if (!isVis(cp.idx)) return;
      if (!byIdx[cp.idx]) byIdx[cp.idx] = [];
      byIdx[cp.idx].push(cp);
    });
    Object.entries(byIdx).forEach(([idx, pats]) => {
      const i = Number(idx), candle = allData[i];
      if (!candle) return;
      const x = ix(i);
      const best = pats.sort((a, b) => b.strength - a.strength)[0];
      const bull = best.bias === "bullish", neutral = best.bias === "neutral";
      const col = neutral ? "rgba(255,235,59,0.9)" : bull ? "rgba(0,255,157,0.9)" : "rgba(255,61,110,0.9)";
      const yPos = bull ? yFunc(candle.low) + 16 : yFunc(candle.high) - 6;
      ctx.fillStyle = col; ctx.font = "12px sans-serif";
      ctx.fillText(bull ? "▲" : neutral ? "◆" : "▼", x - 5, yPos + (bull ? 6 : -6));
      ctx.font = "bold 9px monospace";
      const tw = ctx.measureText(best.type).width;
      ctx.fillStyle = "rgba(8,10,22,0.8)";
      ctx.fillRect(x - tw/2 - 2, yPos + (bull ? 10 : -22), tw + 4, 13);
      ctx.fillStyle = col;
      ctx.fillText(best.type, x - tw/2, yPos + (bull ? 21 : -12));
    });
  },

  _drawBehaviorPanel(ctx, b) {
    const pw = 245, ph = 215, px = 15, py = 15;
    ctx.fillStyle = "rgba(8,10,22,0.96)";
    ctx.strokeStyle = "#00f5ff"; ctx.lineWidth = 1.5;
    this._roundRect(ctx, px, py, pw, ph, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#00f5ff"; ctx.font = "bold 12px monospace";
    ctx.fillText("⚛ AETHER INTELLIGENCE", px + 14, py + 22);
    ctx.strokeStyle = "rgba(0,245,255,0.2)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px+10, py+30); ctx.lineTo(px+pw-10, py+30); ctx.stroke();
    const rows = [
      ["BIAS",       b.bias,         b.bias.includes("Bull") ? "#00ff9d" : b.bias.includes("Bear") ? "#ff3d6e" : "#ffeb3b"],
      ["TREND",      b.trend,        b.trend === "Uptrend" ? "#00ff9d" : b.trend === "Downtrend" ? "#ff3d6e" : "#ffeb3b"],
      ["STRENGTH",   `${b.trendStrength} (ADX ${b.adx})`, "#80deea"],
      ["MOMENTUM",   b.momentum,     "#ba68c8"],
      ["VOLATILITY", b.volatility,   "#ffd54f"],
      ["PHASE",      b.phase,        "#4fc3f7"],
    ];
    rows.forEach(([label, value, color], i) => {
      ctx.fillStyle = "#78909c"; ctx.font = "9px monospace";
      ctx.fillText(label, px + 18, py + 50 + i * 22);
      ctx.fillStyle = color; ctx.font = "bold 10px monospace";
      ctx.fillText(value, px + 118, py + 50 + i * 22);
    });
    const score = b.bias.includes("Strong Bull") ? 1 : b.bias.includes("Bull") ? 0.72 :
                  b.bias.includes("Strong Bear") ? 0 : b.bias.includes("Bear") ? 0.28 : 0.5;
    const bx = px+14, by = py+185, bw = pw-28, bh = 10;
    ctx.fillStyle = "rgba(20,25,40,0.9)"; ctx.fillRect(bx, by, bw, bh);
    const grad = ctx.createLinearGradient(bx, by, bx+bw, by);
    grad.addColorStop(0, "#ff3d6e"); grad.addColorStop(0.5, "#ffeb3b"); grad.addColorStop(1, "#00ff9d");
    ctx.fillStyle = grad; ctx.fillRect(bx, by, bw * score, bh);
    ctx.fillStyle = "#fff"; ctx.beginPath();
    ctx.arc(bx + bw * score, by + bh/2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(100,120,140,0.7)"; ctx.font = "8px monospace";
    ctx.fillText("BEAR", bx, by + bh + 10);
    ctx.fillText("BULL", bx + bw - 18, by + bh + 10);
  },

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
  },

  _detectCandlestickPatterns(data, u, atr) {
    const patterns = [];
    for (let i = 2; i < data.length; i++) {
      const c = data[i], p = data[i-1], pp = data[i-2];
      const avgAtr = atr[i] || 0.001;
      if (u.isDoji(c))
        patterns.push({ idx: i, type: "Doji", bias: "neutral", strength: 1 });
      if (u.lowerWick(c) > u.body(c)*2 && u.upperWick(c) < u.body(c)*0.5 && u.body(c) < avgAtr*0.6)
        patterns.push({ idx: i, type: "Hammer", bias: "bullish", strength: 2 });
      if (u.upperWick(c) > u.body(c)*2 && u.lowerWick(c) < u.body(c)*0.5 && u.body(c) < avgAtr*0.6)
        patterns.push({ idx: i, type: "Shooting Star", bias: "bearish", strength: 2 });
      const tr = u.range(c);
      if (u.lowerWick(c) > tr*0.6 && u.body(c) < tr*0.25)
        patterns.push({ idx: i, type: "Bullish Pin Bar", bias: "bullish", strength: 3 });
      if (u.upperWick(c) > tr*0.6 && u.body(c) < tr*0.25)
        patterns.push({ idx: i, type: "Bearish Pin Bar", bias: "bearish", strength: 3 });
      if (u.isBearish(p) && u.isBullish(c) && c.open < p.close && c.close > p.open && u.body(c) > u.body(p))
        patterns.push({ idx: i, type: "Bullish Engulfing", bias: "bullish", strength: 3 });
      if (u.isBullish(p) && u.isBearish(c) && c.open > p.close && c.close < p.open && u.body(c) > u.body(p))
        patterns.push({ idx: i, type: "Bearish Engulfing", bias: "bearish", strength: 3 });
      if (u.isBearish(pp) && u.body(pp) > avgAtr*0.5 && u.body(p) < avgAtr*0.3 && u.isBullish(c) && c.close > (pp.open+pp.close)/2)
        patterns.push({ idx: i, type: "Morning Star", bias: "bullish", strength: 4 });
      if (u.isBullish(pp) && u.body(pp) > avgAtr*0.5 && u.body(p) < avgAtr*0.3 && u.isBearish(c) && c.close < (pp.open+pp.close)/2)
        patterns.push({ idx: i, type: "Evening Star", bias: "bearish", strength: 4 });
      if (u.isBullish(pp) && u.isBullish(p) && u.isBullish(c) && p.open > pp.open && c.open > p.open && u.body(pp) > avgAtr*0.4 && u.body(p) > avgAtr*0.4 && u.body(c) > avgAtr*0.4)
        patterns.push({ idx: i, type: "Three White Soldiers", bias: "bullish", strength: 4 });
      if (u.isBearish(pp) && u.isBearish(p) && u.isBearish(c) && p.open < pp.open && c.open < p.open && u.body(pp) > avgAtr*0.4 && u.body(p) > avgAtr*0.4 && u.body(c) > avgAtr*0.4)
        patterns.push({ idx: i, type: "Three Black Crows", bias: "bearish", strength: 4 });
    }
    return patterns;
  },

  _detectChartPatterns(data, params, u) {
    const patterns = [];
    const n = params.sensitivity * 3 + 2;
    const sim = 0.025 * params.sensitivity;
    const highs = u.pivotHighs(data, n, n);
    const lows  = u.pivotLows(data, n, n);
    // Double Top
    for (let i = 0; i+1 < highs.length; i++) {
      const A = highs[i], B = highs[i+1];
      if (u.similar(A.price, B.price, sim) && B.idx - A.idx > 5) {
        const v = lows.find(l => l.idx > A.idx && l.idx < B.idx);
        if (v) patterns.push({ type:"Double Top", bias:"bearish", strength:4, neckline:v.price, target:v.price-(A.price-v.price), startIdx:A.idx, endIdx:B.idx });
      }
    }
    // Double Bottom
    for (let i = 0; i+1 < lows.length; i++) {
      const A = lows[i], B = lows[i+1];
      if (u.similar(A.price, B.price, sim) && B.idx - A.idx > 5) {
        const pk = highs.find(h => h.idx > A.idx && h.idx < B.idx);
        if (pk) patterns.push({ type:"Double Bottom", bias:"bullish", strength:4, neckline:pk.price, target:pk.price+(pk.price-A.price), startIdx:A.idx, endIdx:B.idx });
      }
    }
    // Head & Shoulders
    for (let i = 0; i+2 < highs.length; i++) {
      const L = highs[i], H = highs[i+1], R = highs[i+2];
      if (H.price > L.price*1.02 && H.price > R.price*1.02 && u.similar(L.price, R.price, sim*2) && H.idx > L.idx && R.idx > H.idx) {
        const nL = lows.find(l => l.idx > L.idx && l.idx < H.idx);
        const nR = lows.find(l => l.idx > H.idx && l.idx < R.idx);
        if (nL && nR) {
          const neck = (nL.price + nR.price) / 2;
          patterns.push({ type:"Head & Shoulders", bias:"bearish", strength:5, neckline:neck, target:neck-(H.price-neck), startIdx:L.idx, endIdx:R.idx });
        }
      }
    }
    // Inverse Head & Shoulders
    for (let i = 0; i+2 < lows.length; i++) {
      const L = lows[i], H = lows[i+1], R = lows[i+2];
      if (H.price < L.price*0.98 && H.price < R.price*0.98 && u.similar(L.price, R.price, sim*2) && H.idx > L.idx && R.idx > H.idx) {
        const nL = highs.find(h => h.idx > L.idx && h.idx < H.idx);
        const nR = highs.find(h => h.idx > H.idx && h.idx < R.idx);
        if (nL && nR) {
          const neck = (nL.price + nR.price) / 2;
          patterns.push({ type:"Inv H&S", bias:"bullish", strength:5, neckline:neck, target:neck+(neck-H.price), startIdx:L.idx, endIdx:R.idx });
        }
      }
    }
    // Ascending Triangle
    for (let i = 0; i+2 < lows.length; i++) {
      const L1=lows[i], L2=lows[i+1], L3=lows[i+2];
      if (L2.price > L1.price && L3.price > L2.price) {
        const inR = highs.filter(h => h.idx >= L1.idx && h.idx <= L3.idx);
        if (inR.length >= 2) {
          const res = u.avg(inR.map(h => h.price));
          if (inR.every(h => u.similar(h.price, res, sim*2)))
            patterns.push({ type:"Ascending Triangle", bias:"bullish", strength:4, startIdx:L1.idx, endIdx:L3.idx, target:res+(res-L1.price) });
        }
      }
    }
    // Descending Triangle
    for (let i = 0; i+2 < highs.length; i++) {
      const H1=highs[i], H2=highs[i+1], H3=highs[i+2];
      if (H2.price < H1.price && H3.price < H2.price) {
        const inR = lows.filter(l => l.idx >= H1.idx && l.idx <= H3.idx);
        if (inR.length >= 2) {
          const sup = u.avg(inR.map(l => l.price));
          if (inR.every(l => u.similar(l.price, sup, sim*2)))
            patterns.push({ type:"Descending Triangle", bias:"bearish", strength:4, startIdx:H1.idx, endIdx:H3.idx, target:sup-(H1.price-sup) });
        }
      }
    }
    // Rising Wedge
    for (let i = 0; i+1 < highs.length && i+1 < lows.length; i++) {
      const H1=highs[i], H2=highs[i+1], L1=lows[i], L2=lows[i+1];
      if (H2.price > H1.price && L2.price > L1.price && (L2.price-L1.price)/(L2.idx-L1.idx) > (H2.price-H1.price)/(H2.idx-H1.idx+0.01))
        patterns.push({ type:"Rising Wedge", bias:"bearish", strength:3, startIdx:Math.min(H1.idx,L1.idx), endIdx:Math.max(H2.idx,L2.idx) });
    }
    // Falling Wedge
    for (let i = 0; i+1 < highs.length && i+1 < lows.length; i++) {
      const H1=highs[i], H2=highs[i+1], L1=lows[i], L2=lows[i+1];
      if (H2.price < H1.price && L2.price < L1.price && Math.abs((H2.price-H1.price)/(H2.idx-H1.idx)) < Math.abs((L2.price-L1.price)/(L2.idx-L1.idx+0.01)))
        patterns.push({ type:"Falling Wedge", bias:"bullish", strength:3, startIdx:Math.min(H1.idx,L1.idx), endIdx:Math.max(H2.idx,L2.idx) });
    }
    return patterns;
  },

  _detectSRZones(data, params, u) {
    const zones = [];
    const n = params.sensitivity * 2 + 3;
    const merge = 0.015 * params.sensitivity;
    const add = (price, type) => {
      const ex = zones.find(z => z.type === type && u.similar(z.price, price, merge));
      if (ex) { ex.strength++; ex.price = (ex.price + price) / 2; }
      else zones.push({ price, type, strength: 1 });
    };
    u.pivotHighs(data, n, n).forEach(h => add(h.price, "resistance"));
    u.pivotLows(data, n, n).forEach(l => add(l.price, "support"));
    return zones.sort((a, b) => b.strength - a.strength).slice(0, 10);
  },

  _detectSMC(data, u, atr) {
    const concepts = [];
    for (let i = 3; i < data.length; i++) {
      const range = data.slice(i, Math.min(i+5, data.length));
      const drop = range[0].close - range[range.length-1].close;
      const rise = range[range.length-1].close - range[0].close;
      const a = atr[i] || 0.001;
      if (drop > a*2 && u.isBullish(data[i-1]))
        concepts.push({ type:"Bearish OB", idx:i-1, high:data[i-1].high, low:data[i-1].low, bias:"bearish" });
      if (rise > a*2 && u.isBearish(data[i-1]))
        concepts.push({ type:"Bullish OB", idx:i-1, high:data[i-1].high, low:data[i-1].low, bias:"bullish" });
    }
    for (let i = 1; i < data.length-1; i++) {
      const prev=data[i-1], next=data[i+1];
      if (next.low > prev.high)
        concepts.push({ type:"Bullish FVG", idx:i, top:next.low, bottom:prev.high, bias:"bullish" });
      if (next.high < prev.low)
        concepts.push({ type:"Bearish FVG", idx:i, top:prev.low, bottom:next.high, bias:"bearish" });
    }
    return concepts.slice(-20);
  },

  _detectMarketStructure(data, u) {
    const structure = [];
    const highs = u.pivotHighs(data, 3, 3);
    const lows  = u.pivotLows(data, 3, 3);
    for (let i = 1; i < highs.length; i++) {
      if (highs[i].price > highs[i-1].price)
        structure.push({ type:"BOS", bias:"bullish", idx:highs[i].idx, price:highs[i].price });
      else if (highs[i].price < highs[i-1].price)
        structure.push({ type:"CHOCH", bias:"bearish", idx:highs[i].idx, price:highs[i].price });
    }
    for (let i = 1; i < lows.length; i++) {
      if (lows[i].price < lows[i-1].price)
        structure.push({ type:"BOS", bias:"bearish", idx:lows[i].idx, price:lows[i].price });
      else if (lows[i].price > lows[i-1].price)
        structure.push({ type:"CHOCH", bias:"bullish", idx:lows[i].idx, price:lows[i].price });
    }
    return structure.slice(-10);
  },

  _analyzeBehavior(data, rsi, adxArr, macd, atr, u) {
    const last = data.length - 1;
    const closes = data.map(c => c.close);
    const sl20 = u.slope(closes, 20), sl5 = u.slope(closes, 5);
    let trend = sl20 > 0 && sl5 > 0 ? "Uptrend" : sl20 < 0 && sl5 < 0 ? "Downtrend" : "Sideways";
    const adxVal = adxArr[last] || 20;
    const trendStrength = adxVal > 40 ? "Very Strong" : adxVal > 25 ? "Strong" : adxVal > 20 ? "Moderate" : "Weak";
    const rsiVal = rsi[last] || 50;
    const momentum = rsiVal > 70 ? "Overbought" : rsiVal > 55 ? "Bullish" : rsiVal < 30 ? "Oversold" : rsiVal < 45 ? "Bearish" : "Neutral";
    const atrVal = atr[last] || 0;
    const avgAtr = u.avg(atr.filter(Boolean).slice(-20));
    const volatility = atrVal > avgAtr*1.5 ? "High" : atrVal > avgAtr*1.2 ? "Elevated" : atrVal < avgAtr*0.7 ? "Low" : "Normal";
    const pc50 = (closes[last] - closes[Math.max(0, last-50)]) / (closes[Math.max(0, last-50)] || 1);
    let phase = "Consolidation";
    if (trend === "Uptrend" && adxVal > 25 && rsiVal > 50) phase = "Markup";
    else if (trend === "Downtrend" && adxVal > 25 && rsiVal < 50) phase = "Markdown";
    else if (pc50 < 0.02 && volatility === "Low") phase = "Accumulation";
    else if (pc50 > -0.02 && volatility === "Low" && rsiVal > 60) phase = "Distribution";
    let score = 0;
    if (trend === "Uptrend") score += 2; if (trend === "Downtrend") score -= 2;
    if (rsiVal > 55) score++; if (rsiVal < 45) score--;
    const mh = macd.hist[last] || 0;
    if (mh > 0) score++; if (mh < 0) score--;
    const bias = score >= 3 ? "Strong Bullish" : score >= 1 ? "Bullish" : score <= -3 ? "Strong Bearish" : score <= -1 ? "Bearish" : "Neutral";
    return { trend, trendStrength, momentum, volatility, phase, bias, adx: adxVal.toFixed(1), rsi: rsiVal.toFixed(1) };
  },
})
