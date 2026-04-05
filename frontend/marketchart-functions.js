/* ===== HOTKEYS OVERLAY ===== */
function toggleHotkeys() {
    document.getElementById('hotkeysOverlay').classList.toggle('show');
}

/* ===== PAPER TRADING ===== */
function togglePaperTrading() {
    paperTradingActive = !paperTradingActive;
    const panel = document.getElementById('paperPanel');
    const btn = document.getElementById('paperBtn');
    if (paperTradingActive) {
        panel.classList.add('show');
        if (btn) { btn.style.background = '#00c176'; btn.style.color = '#fff'; }
    } else {
        panel.classList.remove('show');
        if (btn) { btn.style.background = ''; btn.style.color = ''; }
    }
}

function paperTrade(side) {
    const price = (typeof currentCandle !== 'undefined' && currentCandle)
        ? currentCandle.close
        : parseFloat(document.getElementById('currentPrice').textContent) || 0;
    if (!price) return;
    const lot = parseFloat(document.getElementById('paperLot').value) || 100;
    const slPct = parseFloat(document.getElementById('paperSL').value) / 100;
    const tpPct = parseFloat(document.getElementById('paperTP').value) / 100;
    const sl = side === 'buy' ? price * (1 - slPct) : price * (1 + slPct);
    const tp = side === 'buy' ? price * (1 + tpPct) : price * (1 - tpPct);
    paperPositions.push({ id: Date.now(), side, entry: price, lot, sl, tp, pnl: 0 });
    updatePaperUI();
}

function closePaperPosition(id) {
    const price = (typeof currentCandle !== 'undefined' && currentCandle) ? currentCandle.close : 0;
    const pos = paperPositions.find(p => p.id === id);
    if (!pos) return;
    const pnl = pos.side === 'buy'
        ? (price - pos.entry) / pos.entry * pos.lot
        : (pos.entry - price) / pos.entry * pos.lot;
    paperBalance += pnl;
    paperClosedTrades.push({ ...pos, exit: price, pnl });
    paperPositions = paperPositions.filter(p => p.id !== id);
    updatePaperUI();
}

function closeAllPaperTrades() {
    [...paperPositions].forEach(p => closePaperPosition(p.id));
}

function updatePaperUI() {
    const price = (typeof currentCandle !== 'undefined' && currentCandle) ? currentCandle.close : 0;
    let openPnl = 0;
    paperPositions.forEach(p => {
        p.pnl = p.side === 'buy'
            ? (price - p.entry) / p.entry * p.lot
            : (p.entry - price) / p.entry * p.lot;
        openPnl += p.pnl;
    });
    const equity = paperBalance + openPnl;
    const wins = paperClosedTrades.filter(t => t.pnl > 0).length;
    const total = paperClosedTrades.length;
    document.getElementById('paperBalance').textContent = '$' + paperBalance.toFixed(2);
    document.getElementById('paperEquity').textContent = '$' + equity.toFixed(2);
    document.getElementById('paperOpenPnl').textContent = (openPnl >= 0 ? '+' : '') + '$' + openPnl.toFixed(2);
    document.getElementById('paperTrades').textContent = total;
    document.getElementById('paperWinRate').textContent = total ? Math.round(wins / total * 100) + '%' : '0%';

    const list = document.getElementById('positionsList');
    if (list) {
        list.innerHTML = paperPositions.map(p =>
            '<div class="pos-row">' +
            '<span>' + SYMBOL + '</span>' +
            '<span style="color:' + (p.side === 'buy' ? '#00c176' : '#ff4d4f') + '">' + p.side.toUpperCase() + '</span>' +
            '<span>' + p.entry.toFixed(5) + '</span>' +
            '<span style="color:' + (p.pnl >= 0 ? '#00c176' : '#ff4d4f') + '">' + (p.pnl >= 0 ? '+' : '') + '$' + p.pnl.toFixed(2) + '</span>' +
            '<span>' + p.sl.toFixed(5) + '/' + p.tp.toFixed(5) + '</span>' +
            '<span><button class="backtest-btn secondary" style="padding:1px 5px;font-size:10px" onclick="closePaperPosition(' + p.id + ')">&#x2715;</button></span>' +
            '</div>'
        ).join('');
        const totalPnlEl = document.getElementById('totalPnl');
        if (totalPnlEl) totalPnlEl.textContent = (openPnl >= 0 ? '+' : '') + '$' + openPnl.toFixed(2);
    }
}

/* ===== BOT OVERLAY ===== */
function stopBotOverlay() {
    botOverlayActive = false;
    const overlay = document.getElementById('botStatusOverlay');
    if (overlay) overlay.style.display = 'none';
}

/* ===== ALERTS ===== */
function addAlertPrompt() {
    const input = prompt('Set alert at price:');
    if (!input || isNaN(parseFloat(input))) return;
    priceAlerts.push({ id: Date.now(), price: parseFloat(input), symbol: SYMBOL, triggered: false });
    localStorage.setItem('chart_alerts', JSON.stringify(priceAlerts));
    renderAlerts();
}

function removeAlert(id) {
    priceAlerts = priceAlerts.filter(a => a.id !== id);
    localStorage.setItem('chart_alerts', JSON.stringify(priceAlerts));
    renderAlerts();
}

function renderAlerts() {
    const list = document.getElementById('alertsList');
    const badge = document.getElementById('alertBadge');
    if (!list) return;
    if (!priceAlerts.length) {
        list.innerHTML = '<div style="color:#8b949e;font-size:11px;text-align:center;padding:8px">No alerts set</div>';
    } else {
        list.innerHTML = priceAlerts.map(a =>
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #2b2f3a;font-size:11px">' +
            '<span style="color:' + (a.triggered ? '#8b949e' : '#ffa500') + '">' + a.symbol + ' @ ' + a.price.toFixed(5) + (a.triggered ? ' \u2713' : '') + '</span>' +
            '<button class="backtest-btn secondary" style="padding:1px 5px;font-size:10px" onclick="removeAlert(' + a.id + ')">&#x2715;</button>' +
            '</div>'
        ).join('');
    }
    if (badge) badge.textContent = priceAlerts.filter(a => !a.triggered).length;
}

function checkAlerts(price) {
    let changed = false;
    priceAlerts.forEach(a => {
        if (!a.triggered && a.symbol === SYMBOL && Math.abs(a.price - price) / price < 0.0005) {
            a.triggered = true;
            changed = true;
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification('Alert: ' + a.symbol + ' reached ' + a.price.toFixed(5));
            }
        }
    });
    if (changed) { localStorage.setItem('chart_alerts', JSON.stringify(priceAlerts)); renderAlerts(); }
}

/* ===== STRATEGY LAB ===== */

let activeLabStrategy = null;
let lastBacktestTrades = [];
let backtestSignalOverlay = [];   // drawn on chart by draw()
let btHistoricalData = [];        // candles used for last backtest
let btPlaybackTimer = null;
let btPlaybackIndex = 0;
let btPlaybackRunning = false;
let btPlaybackEquity = [];

// ── Load user bots ──────────────────────────────────────────────────────────
async function loadUserBotsIntoSelector() {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        const r = await fetch('/api/user/bots', { headers: { 'Authorization': 'Bearer ' + token } });
        if (!r.ok) return;
        const d = await r.json();
        const bots = d.bots || d || [];
        const og = document.getElementById('myBotsOptgroup');
        if (!og) return;
        if (!bots.length) {
            og.innerHTML = '<option value="" disabled style="color:#3a4a60;font-style:italic;">No bots purchased yet</option>';
            return;
        }
        og.innerHTML = bots.map(b =>
            `<option value="bot:${b.bot_id || b.id}" data-name="${b.bot?.name || b.name || 'Bot'}" data-cat="${b.bot?.category || ''}" data-wr="${b.bot?.win_rate || ''}" data-img="${b.bot?.image || ''}">${b.bot?.name || b.name || 'Bot #' + (b.bot_id || b.id)}</option>`
        ).join('');
    } catch(e) { console.warn('Could not load bots:', e); }
}

function onBotStrategyChange(val) {
    const card = document.getElementById('botInfoCard');
    if (!val) { card.style.display = 'none'; activeLabStrategy = null; return; }
    if (val.startsWith('bot:')) {
        const opt = document.querySelector(`#botStrategySelect option[value="${val}"]`);
        const name = opt?.dataset.name || 'Bot';
        document.getElementById('botInfoName').textContent = name;
        document.getElementById('botInfoCategory').textContent = opt?.dataset.cat || 'Trading Bot';
        document.getElementById('botInfoWinRate').textContent = opt?.dataset.wr || '—';
        const imgEl = document.getElementById('botInfoImg');
        const img = opt?.dataset.img || '';
        imgEl.innerHTML = img ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover;">` : '🤖';
        card.style.display = 'block';
        activeLabStrategy = { type: 'bot', id: val.replace('bot:', ''), name };
    } else if (val.startsWith('builtin:')) {
        const key = val.replace('builtin:', '');
        const names = { ma_cross: 'MA Crossover', rsi_reversal: 'RSI Reversal', breakout: 'Breakout', engulfing: 'Engulfing Pattern' };
        document.getElementById('botInfoName').textContent = names[key] || key;
        document.getElementById('botInfoCategory').textContent = 'Built-in Strategy';
        document.getElementById('botInfoWinRate').textContent = '—';
        document.getElementById('botInfoImg').textContent = '📊';
        card.style.display = 'block';
        activeLabStrategy = { type: 'builtin', key };
    }
}

// ── Signal generators ───────────────────────────────────────────────────────
function signalMA(data, i) {
    if (i < 50) return null;
    const sma = (arr, n, end) => arr.slice(end - n, end).reduce((s, c) => s + c.close, 0) / n;
    const f1 = sma(data, 20, i), s1 = sma(data, 50, i);
    const f0 = sma(data, 20, i-1), s0 = sma(data, 50, i-1);
    if (f0 <= s0 && f1 > s1) return 'buy';
    if (f0 >= s0 && f1 < s1) return 'sell';
    return null;
}
function signalRSI(data, i) {
    if (i < 15) return null;
    let gains = 0, losses = 0;
    for (let j = i - 14; j < i; j++) {
        const d = data[j].close - data[j-1].close;
        if (d > 0) gains += d; else losses -= d;
    }
    const rsi = 100 - 100 / (1 + (losses === 0 ? 100 : gains / losses));
    if (rsi < 30) return 'buy';
    if (rsi > 70) return 'sell';
    return null;
}
function signalBreakout(data, i) {
    if (i < 21) return null;
    const highs = data.slice(i-20, i).map(c => c.high);
    const lows  = data.slice(i-20, i).map(c => c.low);
    if (data[i].close > Math.max(...highs)) return 'buy';
    if (data[i].close < Math.min(...lows))  return 'sell';
    return null;
}
function signalEngulfing(data, i) {
    if (i < 1) return null;
    const prev = data[i-1], curr = data[i];
    if (prev.close < prev.open && curr.open <= prev.close && curr.close >= prev.open) return 'buy';
    if (prev.close > prev.open && curr.open >= prev.close && curr.close <= prev.open) return 'sell';
    return null;
}
function getSignal(data, i, strategy) {
    if (!strategy) return null;
    if (strategy.type === 'builtin') {
        if (strategy.key === 'ma_cross')     return signalMA(data, i);
        if (strategy.key === 'rsi_reversal') return signalRSI(data, i);
        if (strategy.key === 'breakout')     return signalBreakout(data, i);
        if (strategy.key === 'engulfing')    return signalEngulfing(data, i);
    }
    if (strategy.type === 'bot') return signalEngulfing(data, i);
    return null;
}

// ── Fetch historical candles from Deriv WS ──────────────────────────────────
function fetchHistoricalCandles(symbol, granularity, startEpoch, endEpoch, count) {
    return new Promise((resolve, reject) => {
        const histWs = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
        const timeout = setTimeout(() => { histWs.close(); reject(new Error('Timeout')); }, 15000);
        histWs.onopen = () => {
            const req = { ticks_history: symbol, style: 'candles', granularity, adjust_start_time: 1 };
            if (startEpoch && endEpoch) {
                req.start = startEpoch;
                req.end   = endEpoch;
            } else {
                req.count = count || 1000;
                req.end   = 'latest';
            }
            histWs.send(JSON.stringify(req));
        };
        histWs.onmessage = e => {
            const d = JSON.parse(e.data);
            clearTimeout(timeout);
            histWs.close();
            if (d.error) { reject(new Error(d.error.message)); return; }
            if (d.candles) {
                resolve(d.candles.map(c => ({
                    time: +c.epoch, open: +c.open, high: +c.high, low: +c.low, close: +c.close
                })));
            } else { reject(new Error('No candles')); }
        };
        histWs.onerror = () => { clearTimeout(timeout); reject(new Error('WS error')); };
    });
}

// ── Core backtest engine ────────────────────────────────────────────────────
function runBacktestOnData(data, strategy, capital, riskPct) {
    let balance = capital, wins = 0, losses = 0, maxBal = capital, maxDD = 0;
    const trades = [], equity = [capital], signals = [];

    for (let i = 1; i < data.length - 1; i++) {
        const signal = getSignal(data, i, strategy);
        if (!signal) continue;
        const entry = data[i+1].open;
        const exit  = data[i+1].close;
        const lot   = balance * riskPct;
        const pnl   = signal === 'buy' ? (exit - entry) / entry * lot : (entry - exit) / entry * lot;
        balance += pnl;
        if (pnl > 0) wins++; else losses++;
        maxBal = Math.max(maxBal, balance);
        maxDD  = Math.max(maxDD, (maxBal - balance) / maxBal * 100);
        trades.push({ signal, entry, exit, pnl, candleIndex: i + 1, price: entry });
        signals.push({ signal, candleIndex: i + 1, price: entry, pnl });
        equity.push(balance);
    }
    return { trades, signals, equity, wins, losses, maxDD, finalBalance: balance };
}

// ── Main entry point ────────────────────────────────────────────────────────
async function runStrategyBacktest(mode) {
    if (!activeLabStrategy) {
        const sel = document.getElementById('botStrategySelect');
        sel.style.borderColor = '#FF4500';
        setTimeout(() => sel.style.borderColor = '', 1200);
        return;
    }

    const capital = parseFloat(document.getElementById('btCapital').value) || 1000;
    const riskPct = parseFloat(document.getElementById('btRisk').value) / 100 || 0.02;
    const btn = document.querySelector('[onclick*="runStrategyBacktest"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Loading…'; }

    let data;
    try {
        if (mode === 'range') {
            const fromVal = document.getElementById('btFromDate').value;
            const toVal   = document.getElementById('btToDate').value;
            if (!fromVal || !toVal) { alert('Please set both From and To dates.'); return; }
            const startEpoch = Math.floor(new Date(fromVal).getTime() / 1000);
            const endEpoch   = Math.floor(new Date(toVal).getTime() / 1000);
            if (endEpoch <= startEpoch) { alert('To date must be after From date.'); return; }
            data = await fetchHistoricalCandles(SYMBOL, TIMEFRAME, startEpoch, endEpoch, null);
        } else {
            const count = parseInt(document.getElementById('btTickCount').value) || 500;
            // Use already-loaded candles if enough, else fetch
            if (candles.length >= count) {
                data = candles.slice(-count);
            } else {
                data = await fetchHistoricalCandles(SYMBOL, TIMEFRAME, null, null, count);
            }
        }
    } catch(e) {
        alert('Failed to load historical data: ' + e.message);
        return;
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = mode === 'range' ? '📅 Date Range' : '▶ Run (N candles)'; }
    }

    if (!data || data.length < 20) { alert('Not enough candles in range (need at least 20).'); return; }

    btHistoricalData = data;
    const result = runBacktestOnData(data, activeLabStrategy, capital, riskPct);
    lastBacktestTrades = result.trades;
    btPlaybackEquity   = result.equity;

    // Store signals for overlay — indexed relative to btHistoricalData
    backtestSignalOverlay = result.signals;

    // Load historical data onto chart so signals are visible
    candles = [...data];
    currentCandle = null;
    offset = 0;
    if (typeof draw === 'function') draw();

    // Show results
    renderBacktestResults(result, capital);

    // Show playback bar
    document.getElementById('btPlaybackBar').style.display = 'block';
    btPlaybackIndex = 0;
    btPlaybackRunning = false;
    updatePlaybackStatus();
}

// ── Render results panel ────────────────────────────────────────────────────
function renderBacktestResults(result, capital) {
    const { trades, equity, wins, losses, maxDD, finalBalance } = result;
    const total    = wins + losses;
    const netPnl   = finalBalance - capital;
    const winRate  = total ? (wins / total * 100).toFixed(1) : 0;
    const grossWin = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLoss= Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const pf       = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : '∞';
    const returns  = equity.map((v, i) => i > 0 ? (v - equity[i-1]) / equity[i-1] : 0).slice(1);
    const mean     = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const std      = Math.sqrt(returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length || 1));
    const sharpe   = std > 0 ? (mean / std * Math.sqrt(252)).toFixed(2) : '0';
    const expectancy = total ? (netPnl / total).toFixed(2) : '0';

    document.getElementById('btResults').style.display = 'block';

    const pnlEl = document.getElementById('btPnl');
    pnlEl.textContent = (netPnl >= 0 ? '+$' : '-$') + Math.abs(netPnl).toFixed(2);
    pnlEl.style.color = netPnl >= 0 ? '#00c176' : '#ff4d4f';
    document.getElementById('btWinRate').textContent = winRate + '%';
    document.getElementById('btWinRate').style.color = parseFloat(winRate) >= 50 ? '#00c176' : '#ff4d4f';
    document.getElementById('btTrades').textContent = total;
    document.getElementById('btPF').textContent = pf;
    document.getElementById('btPF').style.color = parseFloat(pf) >= 1.5 ? '#00c176' : parseFloat(pf) >= 1 ? '#ffa500' : '#ff4d4f';
    document.getElementById('btDD').textContent = maxDD.toFixed(1) + '%';
    document.getElementById('btDD').style.color = maxDD < 10 ? '#00c176' : maxDD < 25 ? '#ffa500' : '#ff4d4f';
    document.getElementById('btSharpe').textContent = sharpe;

    // Update risk panel
    const ddEl = document.getElementById('riskDrawdown');
    if (ddEl) { ddEl.textContent = maxDD.toFixed(1) + '%'; ddEl.className = 'sb-risk-val ' + (maxDD < 10 ? 'good' : maxDD < 25 ? 'warn' : 'bad'); }
    const shEl = document.getElementById('riskSharpe');
    if (shEl) shEl.textContent = sharpe;
    const exEl = document.getElementById('riskExpectancy');
    if (exEl) exEl.textContent = '$' + expectancy;

    // Equity curve
    drawEquityCurve(equity, netPnl);

    // Trade list
    document.getElementById('btTradeList').innerHTML = trades.slice(-30).reverse().map(t =>
        `<div style="display:grid;grid-template-columns:40px 1fr 1fr 1fr;gap:2px;font-size:10px;padding:3px 2px;border-bottom:1px solid #1a2035;">
            <span style="color:${t.signal === 'buy' ? '#00c176' : '#ff4d4f'};font-weight:700;">${t.signal.toUpperCase()}</span>
            <span style="color:#8b949e;">${t.entry.toFixed(5)}</span>
            <span style="color:#8b949e;">${t.exit.toFixed(5)}</span>
            <span style="color:${t.pnl >= 0 ? '#00c176' : '#ff4d4f'};font-weight:700;text-align:right;">${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}</span>
        </div>`
    ).join('');
}

function drawEquityCurve(equity, netPnl) {
    const ec = document.getElementById('equityCanvas');
    if (!ec || equity.length < 2) return;
    const ectx = ec.getContext('2d');
    ec.width = ec.offsetWidth || 220;
    ec.height = 80;
    ectx.clearRect(0, 0, ec.width, ec.height);
    const minE = Math.min(...equity), maxE = Math.max(...equity);
    const range = maxE - minE || 1;
    const col = netPnl >= 0 ? '0,193,118' : '255,77,79';
    const grad = ectx.createLinearGradient(0, 0, 0, ec.height);
    grad.addColorStop(0, `rgba(${col},0.3)`);
    grad.addColorStop(1, `rgba(${col},0)`);
    ectx.beginPath();
    equity.forEach((v, i) => {
        const x = (i / (equity.length - 1)) * ec.width;
        const y = ec.height - ((v - minE) / range) * (ec.height - 6) - 3;
        i === 0 ? ectx.moveTo(x, y) : ectx.lineTo(x, y);
    });
    ectx.lineTo(ec.width, ec.height); ectx.lineTo(0, ec.height); ectx.closePath();
    ectx.fillStyle = grad; ectx.fill();
    ectx.beginPath();
    equity.forEach((v, i) => {
        const x = (i / (equity.length - 1)) * ec.width;
        const y = ec.height - ((v - minE) / range) * (ec.height - 6) - 3;
        i === 0 ? ectx.moveTo(x, y) : ectx.lineTo(x, y);
    });
    ectx.strokeStyle = `rgb(${col})`; ectx.lineWidth = 1.5; ectx.stroke();
}

// ── Playback ────────────────────────────────────────────────────────────────
function btPlayback(action) {
    if (action === 'reset') {
        clearInterval(btPlaybackTimer);
        btPlaybackRunning = false;
        btPlaybackIndex = 0;
        backtestSignalOverlay = [];
        candles = [...btHistoricalData];
        currentCandle = null;
        offset = 0;
        if (typeof draw === 'function') draw();
        updatePlaybackStatus();
        document.getElementById('btPlayBtn').textContent = '▶ Play';
        return;
    }
    if (action === 'pause') {
        clearInterval(btPlaybackTimer);
        btPlaybackRunning = false;
        document.getElementById('btPlayBtn').textContent = '▶ Play';
        return;
    }
    if (action === 'play') {
        if (btPlaybackRunning) return;
        if (btPlaybackIndex >= btHistoricalData.length) btPlaybackIndex = 0;
        btPlaybackRunning = true;
        document.getElementById('btPlayBtn').textContent = '⏸ Playing…';

        const speed = parseInt(document.getElementById('btSpeed').value) || 3;
        // Interval: faster speed = shorter interval
        const intervalMs = Math.max(30, 300 / speed);

        btPlaybackTimer = setInterval(() => {
            if (btPlaybackIndex >= btHistoricalData.length) {
                clearInterval(btPlaybackTimer);
                btPlaybackRunning = false;
                document.getElementById('btPlayBtn').textContent = '▶ Play';
                // Show all signals at end
                backtestSignalOverlay = lastBacktestTrades.map(t => ({
                    signal: t.signal, candleIndex: t.candleIndex, price: t.price, pnl: t.pnl
                }));
                drawEquityCurve(btPlaybackEquity, btPlaybackEquity[btPlaybackEquity.length - 1] - btPlaybackEquity[0]);
                if (typeof draw === 'function') draw();
                return;
            }

            // Reveal candles up to current playback index
            candles = btHistoricalData.slice(0, btPlaybackIndex + 1);
            currentCandle = null;
            offset = 0;

            // Show signals up to current index
            backtestSignalOverlay = lastBacktestTrades
                .filter(t => t.candleIndex <= btPlaybackIndex)
                .map(t => ({ signal: t.signal, candleIndex: t.candleIndex, price: t.price, pnl: t.pnl }));

            // Update equity curve progressively
            const equitySlice = btPlaybackEquity.slice(0, backtestSignalOverlay.length + 1);
            const netSoFar = equitySlice.length > 1 ? equitySlice[equitySlice.length - 1] - equitySlice[0] : 0;
            drawEquityCurve(equitySlice, netSoFar);

            btPlaybackIndex++;
            updatePlaybackStatus();
            if (typeof draw === 'function') draw();
        }, intervalMs);
    }
}

function updatePlaybackStatus() {
    const el = document.getElementById('btPlaybackStatus');
    if (el) el.textContent = `Candle: ${btPlaybackIndex} / ${btHistoricalData.length}`;
}

// ── Draw overlay on chart canvas ────────────────────────────────────────────
// Called from draw() in marketchart.html with: drawBacktestOverlay(ctx, canvas, data, start, visible, candleSpacing, pad, y)
function drawBacktestOverlay(ctx, canvas, data, start, visible, candleSpacing, pad, yFunc) {
    if (!backtestSignalOverlay.length) return;
    backtestSignalOverlay.forEach(sig => {
        const ci = sig.candleIndex;
        if (ci < start || ci >= start + visible) return;
        const relIdx = ci - start;
        const x = pad + relIdx * candleSpacing + candleSpacing / 2;
        const price = sig.price;
        const y = yFunc(price);

        ctx.save();
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        if (sig.signal === 'buy') {
            // Green upward triangle below candle
            ctx.fillStyle = '#00c176';
            ctx.beginPath();
            ctx.moveTo(x, y + 16);
            ctx.lineTo(x - 6, y + 26);
            ctx.lineTo(x + 6, y + 26);
            ctx.closePath();
            ctx.fill();
            // P&L label
            if (sig.pnl !== undefined) {
                ctx.fillStyle = sig.pnl >= 0 ? '#00c176' : '#ff4d4f';
                ctx.font = 'bold 9px Arial';
                ctx.fillText((sig.pnl >= 0 ? '+' : '') + '$' + sig.pnl.toFixed(1), x, y + 38);
            }
        } else {
            // Red downward triangle above candle
            ctx.fillStyle = '#ff4d4f';
            ctx.beginPath();
            ctx.moveTo(x, y - 16);
            ctx.lineTo(x - 6, y - 26);
            ctx.lineTo(x + 6, y - 26);
            ctx.closePath();
            ctx.fill();
            if (sig.pnl !== undefined) {
                ctx.fillStyle = sig.pnl >= 0 ? '#00c176' : '#ff4d4f';
                ctx.font = 'bold 9px Arial';
                ctx.fillText((sig.pnl >= 0 ? '+' : '') + '$' + sig.pnl.toFixed(1), x, y - 38);
            }
        }
        ctx.restore();
    });
}
// Init on page load — only run on the marketchart page
document.addEventListener('DOMContentLoaded', function() {
    if (!document.getElementById('chart')) return; // not on marketchart page
    loadUserBotsIntoSelector();
    renderAlerts();
});

/* ===== MARKET SCANNER ===== */
function runScanner() {
    const symbols = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', 'BOOM500', 'CRASH500', 'stpRNG'];
    const results = document.getElementById('scannerResults');
    results.innerHTML = '<div style="color:#8b949e;font-size:11px;text-align:center;padding:8px">Scanning...</div>';

    const rows = symbols.map(sym => {
        const data = sym === SYMBOL ? candles : [];
        if (data.length < 15) {
            return { sym, price: '--', rsi: '--', trend: '--', trendColor: '#8b949e', signal: 'No data', sigColor: '#8b949e', tf: TIMEFRAME + 's' };
        }
        const closes = data.map(c => c.close);
        const price = closes[closes.length - 1];
        let gains = 0, losses = 0;
        for (let i = closes.length - 14; i < closes.length; i++) {
            const d = closes[i] - closes[i - 1];
            if (d > 0) gains += d; else losses -= d;
        }
        const rs = losses === 0 ? 100 : gains / losses;
        const rsi = Math.round(100 - 100 / (1 + rs));
        const slice = closes.slice(-20);
        const trendUp = slice[slice.length - 1] > slice[0];
        const trend = trendUp ? '\u25b2 Up' : '\u25bc Down';
        const trendColor = trendUp ? '#00c176' : '#ff4d4f';
        let signal = 'Neutral', sigColor = '#8b949e';
        if (rsi < 30) { signal = 'Oversold'; sigColor = '#00c176'; }
        else if (rsi > 70) { signal = 'Overbought'; sigColor = '#ff4d4f'; }
        return { sym, price: price.toFixed(5), rsi, trend, trendColor, signal, sigColor, tf: TIMEFRAME + 's' };
    });

    results.innerHTML = rows.map(r =>
        '<div class="scanner-row">' +
        '<span style="color:#d1d4dc">' + r.sym + '</span>' +
        '<span style="color:#d1d4dc">' + r.price + '</span>' +
        '<span style="color:' + (r.rsi < 30 ? '#00c176' : r.rsi > 70 ? '#ff4d4f' : '#d1d4dc') + '">' + r.rsi + '</span>' +
        '<span style="color:' + r.trendColor + '">' + r.trend + '</span>' +
        '<span style="color:' + r.sigColor + '">' + r.signal + '</span>' +
        '<span style="color:#8b949e">' + r.tf + '</span>' +
        '</div>'
    ).join('');
}

/* ===== MTF ===== */
function updateMTF() {
    const rows = document.getElementById('mtfRows');
    if (!rows || candles.length < 5) return;
    const timeframes = [
        { tf: 60, label: '1m' },
        { tf: 300, label: '5m' },
        { tf: 900, label: '15m' },
        { tf: 3600, label: '1h' }
    ];
    rows.innerHTML = timeframes.map(({ label }) => {
        const closes = candles.map(c => c.close);
        const last = closes[closes.length - 1];
        const prev = closes[closes.length - 2] || last;
        const trend = last > prev ? '\u25b2' : last < prev ? '\u25bc' : '\u2014';
        const color = last > prev ? '#00c176' : last < prev ? '#ff4d4f' : '#8b949e';
        return '<div class="mtf-row">' +
            '<span class="mtf-tf">' + label + '</span>' +
            '<span style="color:' + color + ';font-weight:bold">' + trend + '</span>' +
            '<span style="color:#d1d4dc;font-size:11px">' + last.toFixed(5) + '</span>' +
            '</div>';
    }).join('');
}

/* ===== CONTEXT MENU ===== */
(function initCtxMenu() {
    const chartCanvas = document.getElementById('chart');
    if (!chartCanvas) return;

    let ctxTarget = null;

    chartCanvas.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        const rect = chartCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        ctxTarget = (typeof findObjectAt === 'function') ? findObjectAt(x, y) : null;
        const menu = document.getElementById('ctxMenu');
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.classList.add('show');
        window._ctxTarget = ctxTarget;
    });

    document.addEventListener('click', function() {
        const m = document.getElementById('ctxMenu');
        if (m) m.classList.remove('show');
    });
})();

function ctxAction(action) {
    document.getElementById('ctxMenu').classList.remove('show');
    const ctxTarget = window._ctxTarget || null;
    if (action === 'alert') { addAlertPrompt(); return; }
    if (!ctxTarget) return;
    if (action === 'delete') {
        drawingObjects = drawingObjects.filter(o => o !== ctxTarget);
        selectedObject = null;
        if (typeof draw === 'function') draw();
    } else if (action === 'duplicate') {
        const copy = Object.assign({}, ctxTarget, {
            startIndex: ctxTarget.startIndex + 2,
            endIndex: (ctxTarget.endIndex || ctxTarget.startIndex) + 2
        });
        drawingObjects.push(copy);
        if (typeof draw === 'function') draw();
    } else if (action === 'lock') {
        if (lockedObjects.has(ctxTarget)) lockedObjects.delete(ctxTarget);
        else lockedObjects.add(ctxTarget);
    } else if (action === 'color') {
        const color = prompt('Enter color (e.g. #ff0000):', ctxTarget.color || '#ffffff');
        if (color) { ctxTarget.color = color; if (typeof draw === 'function') draw(); }
    }
}

/* ===== INIT ===== */
// (init handled in Strategy Lab section above)
