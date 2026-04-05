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

// Holds the currently selected bot/strategy
let activeLabStrategy = null;
let lastBacktestTrades = [];

// Load user's bots into the selector
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
        const cat  = opt?.dataset.cat  || '';
        const wr   = opt?.dataset.wr   || '—';
        const img  = opt?.dataset.img  || '';
        document.getElementById('botInfoName').textContent = name;
        document.getElementById('botInfoCategory').textContent = cat || 'Trading Bot';
        document.getElementById('botInfoWinRate').textContent = wr || '—';
        const imgEl = document.getElementById('botInfoImg');
        if (img) imgEl.innerHTML = `<img src="${img}" style="width:100%;height:100%;object-fit:cover;">`;
        else imgEl.textContent = '🤖';
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

/* ── Signal generators for each built-in strategy ── */
function signalMA(data, i) {
    if (i < 50) return null;
    const fast = 20, slow = 50;
    const sma = (arr, n, end) => arr.slice(end - n, end).reduce((s, c) => s + c.close, 0) / n;
    const f1 = sma(data, fast, i), s1 = sma(data, slow, i);
    const f0 = sma(data, fast, i - 1), s0 = sma(data, slow, i - 1);
    if (f0 <= s0 && f1 > s1) return 'buy';
    if (f0 >= s0 && f1 < s1) return 'sell';
    return null;
}

function signalRSI(data, i) {
    if (i < 15) return null;
    const period = 14;
    let gains = 0, losses = 0;
    for (let j = i - period; j < i; j++) {
        const d = data[j].close - data[j - 1].close;
        if (d > 0) gains += d; else losses -= d;
    }
    const rs = losses === 0 ? 100 : gains / losses;
    const rsi = 100 - 100 / (1 + rs);
    if (rsi < 30) return 'buy';
    if (rsi > 70) return 'sell';
    return null;
}

function signalBreakout(data, i) {
    if (i < 21) return null;
    const period = 20;
    const highs = data.slice(i - period, i).map(c => c.high);
    const lows  = data.slice(i - period, i).map(c => c.low);
    const highest = Math.max(...highs), lowest = Math.min(...lows);
    if (data[i].close > highest) return 'buy';
    if (data[i].close < lowest)  return 'sell';
    return null;
}

function signalEngulfing(data, i) {
    if (i < 1) return null;
    const prev = data[i - 1], curr = data[i];
    const prevBear = prev.close < prev.open;
    const prevBull = prev.close > prev.open;
    if (prevBear && curr.open <= prev.close && curr.close >= prev.open) return 'buy';
    if (prevBull && curr.open >= prev.close && curr.close <= prev.open) return 'sell';
    return null;
}

function getSignal(data, i, strategy) {
    if (!strategy) return null;
    if (strategy.type === 'builtin') {
        if (strategy.key === 'ma_cross')    return signalMA(data, i);
        if (strategy.key === 'rsi_reversal') return signalRSI(data, i);
        if (strategy.key === 'breakout')    return signalBreakout(data, i);
        if (strategy.key === 'engulfing')   return signalEngulfing(data, i);
    }
    // For user bots, fall back to engulfing as a proxy (bot logic runs on Deriv, not here)
    if (strategy.type === 'bot') return signalEngulfing(data, i);
    return null;
}

/* ── Main backtest runner ── */
function runStrategyBacktest() {
    if (!activeLabStrategy) {
        // Flash the selector
        const sel = document.getElementById('botStrategySelect');
        sel.style.borderColor = '#FF4500';
        setTimeout(() => sel.style.borderColor = '', 1200);
        return;
    }

    const from    = Math.max(0, parseInt(document.getElementById('btFrom').value) || 0);
    const to      = Math.min(parseInt(document.getElementById('btTo').value) || 500, candles.length);
    const capital = parseFloat(document.getElementById('btCapital').value) || 1000;
    const riskPct = parseFloat(document.getElementById('btRisk').value) / 100 || 0.02;
    const data    = candles.slice(from, to);

    if (data.length < 20) {
        alert('Need at least 20 candles — wait for more data to load or adjust the range.');
        return;
    }

    let balance = capital, wins = 0, losses = 0, maxBal = capital, maxDD = 0;
    const trades = [], equity = [capital];

    for (let i = 1; i < data.length - 1; i++) {
        const signal = getSignal(data, i, activeLabStrategy);
        if (!signal) continue;

        const entry = data[i + 1].open;
        const exit  = data[i + 1].close;
        const lot   = balance * riskPct;
        const pnl   = signal === 'buy'
            ? (exit - entry) / entry * lot
            : (entry - exit) / entry * lot;

        balance += pnl;
        if (pnl > 0) wins++; else losses++;
        maxBal = Math.max(maxBal, balance);
        const dd = (maxBal - balance) / maxBal * 100;
        maxDD = Math.max(maxDD, dd);
        trades.push({ signal, entry, exit, pnl });
        equity.push(balance);
    }

    lastBacktestTrades = trades;
    const total    = wins + losses;
    const winRate  = total ? (wins / total * 100).toFixed(1) : 0;
    const netPnl   = balance - capital;
    const grossWin = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLoss= Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const pf       = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : '∞';
    const returns  = equity.map((v, i) => i > 0 ? (v - equity[i-1]) / equity[i-1] : 0).slice(1);
    const mean     = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const std      = Math.sqrt(returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length || 1));
    const sharpe   = std > 0 ? (mean / std * Math.sqrt(252)).toFixed(2) : '0';
    const expectancy = total ? (netPnl / total).toFixed(2) : '0';

    // Update risk metrics panel too
    const ddEl = document.getElementById('riskDrawdown');
    if (ddEl) { ddEl.textContent = maxDD.toFixed(1) + '%'; ddEl.className = 'sb-risk-val ' + (maxDD < 10 ? 'good' : maxDD < 25 ? 'warn' : 'bad'); }
    const shEl = document.getElementById('riskSharpe');
    if (shEl) shEl.textContent = sharpe;
    const exEl = document.getElementById('riskExpectancy');
    if (exEl) exEl.textContent = '$' + expectancy;

    // Show results panel
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

    // Draw equity curve
    const ec = document.getElementById('equityCanvas');
    if (ec && equity.length > 1) {
        const ectx = ec.getContext('2d');
        ec.width = ec.offsetWidth || 220;
        ec.height = 80;
        ectx.clearRect(0, 0, ec.width, ec.height);
        const minE = Math.min(...equity), maxE = Math.max(...equity);
        const range = maxE - minE || 1;

        // Fill gradient
        const grad = ectx.createLinearGradient(0, 0, 0, ec.height);
        const col = netPnl >= 0 ? '0,193,118' : '255,77,79';
        grad.addColorStop(0, `rgba(${col},0.25)`);
        grad.addColorStop(1, `rgba(${col},0)`);

        ectx.beginPath();
        equity.forEach((v, i) => {
            const x = (i / (equity.length - 1)) * ec.width;
            const y = ec.height - ((v - minE) / range) * (ec.height - 6) - 3;
            i === 0 ? ectx.moveTo(x, y) : ectx.lineTo(x, y);
        });
        ectx.lineTo(ec.width, ec.height);
        ectx.lineTo(0, ec.height);
        ectx.closePath();
        ectx.fillStyle = grad;
        ectx.fill();

        // Line
        ectx.beginPath();
        equity.forEach((v, i) => {
            const x = (i / (equity.length - 1)) * ec.width;
            const y = ec.height - ((v - minE) / range) * (ec.height - 6) - 3;
            i === 0 ? ectx.moveTo(x, y) : ectx.lineTo(x, y);
        });
        ectx.strokeStyle = `rgb(${col})`;
        ectx.lineWidth = 1.5;
        ectx.stroke();
    }

    // Trade list
    document.getElementById('btTradeList').innerHTML = trades.slice(-30).reverse().map(t =>
        `<div style="display:grid;grid-template-columns:40px 1fr 1fr 1fr;gap:2px;font-size:10px;padding:3px 2px;border-bottom:1px solid #1a2035;">
            <span style="color:${t.signal === 'buy' ? '#00c176' : '#ff4d4f'};font-weight:700;">${t.signal.toUpperCase()}</span>
            <span style="color:#8b949e;">${t.entry.toFixed(5)}</span>
            <span style="color:#8b949e;">${t.exit.toFixed(5)}</span>
            <span style="color:${t.pnl >= 0 ? '#00c176' : '#ff4d4f'};font-weight:700;text-align:right;">${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}</span>
        </div>`
    ).join('');

    // Draw signals on chart
    drawBacktestSignals(trades, data, from);
}

// Draw buy/sell arrows on the chart canvas for the last backtest
let backtestSignalOverlay = [];
function drawBacktestSignals(trades, data, offset) {
    backtestSignalOverlay = trades.map((t, i) => ({
        ...t,
        candleIndex: offset + i + 1
    }));
    if (typeof draw === 'function') draw();
}

// Called from the main draw() loop — overlay arrows on chart
function drawBacktestOverlay(ctx, canvas, candles, zoom, scrollOffset, pad) {
    if (!backtestSignalOverlay.length) return;
    const w = canvas.width, h = canvas.height;
    const visibleCount = Math.floor((w - pad * 2) / (8 * zoom));
    const startIdx = Math.max(0, candles.length - visibleCount - scrollOffset);

    backtestSignalOverlay.forEach(sig => {
        const ci = sig.candleIndex;
        if (ci < startIdx || ci >= startIdx + visibleCount) return;
        const x = pad + (ci - startIdx) * 8 * zoom + 4 * zoom;
        const price = sig.entry;
        // Get y from price — approximate using canvas height
        const prices = candles.slice(startIdx, startIdx + visibleCount);
        const maxP = Math.max(...prices.map(c => c.high));
        const minP = Math.min(...prices.map(c => c.low));
        const range = maxP - minP || 1;
        const y = h - pad - ((price - minP) / range) * (h - pad * 2);

        ctx.save();
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        if (sig.signal === 'buy') {
            ctx.fillStyle = '#00c176';
            ctx.fillText('▲', x, y + 18);
        } else {
            ctx.fillStyle = '#ff4d4f';
            ctx.fillText('▼', x, y - 8);
        }
        ctx.restore();
    });
}

// Init on page load
document.addEventListener('DOMContentLoaded', function() {
    loadUserBotsIntoSelector();
    renderAlerts();
});

    let balance = capital, wins = 0, losses = 0, maxBal = capital, maxDD = 0;
    const trades = [], equity = [capital];
    const lotPct = 0.02;

    for (let i = 2; i < data.length - 1; i++) {
        const prev1 = data[i - 1], curr = data[i];
        const bullish = prev1.close > prev1.open && curr.close > curr.open && curr.close > prev1.close;
        const bearish = prev1.close < prev1.open && curr.close < curr.open && curr.close < prev1.close;
        if (!bullish && !bearish) continue;
        const side = bullish ? 'buy' : 'sell';
        const entry = data[i + 1].open;
        const exit = data[i + 1].close;
        const lot = balance * lotPct;
        const pnl = side === 'buy' ? (exit - entry) / entry * lot : (entry - exit) / entry * lot;
        balance += pnl;
        if (pnl > 0) wins++; else losses++;
        maxBal = Math.max(maxBal, balance);
        maxDD = Math.max(maxDD, (maxBal - balance) / maxBal * 100);
        trades.push({ side, entry, exit, pnl });
        equity.push(balance);
    }

    lastBacktestTrades = trades;
    const total = wins + losses;
    const winRate = total ? (wins / total * 100).toFixed(1) : 0;
    const netPnl = balance - capital;
    const grossWin = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const pf = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : '\u221e';
    const returns = equity.map((v, i) => i > 0 ? (v - equity[i - 1]) / equity[i - 1] : 0).slice(1);
    const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const std = Math.sqrt(returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length || 1));
    const sharpe = std > 0 ? (mean / std * Math.sqrt(252)).toFixed(2) : '0';

    document.getElementById('btStats').style.display = 'grid';
    const pnlEl = document.getElementById('btPnl');
    pnlEl.textContent = (netPnl >= 0 ? '+' : '') + '$' + netPnl.toFixed(2);
    pnlEl.style.color = netPnl >= 0 ? '#00c176' : '#ff4d4f';
    document.getElementById('btWinRate').textContent = winRate + '%';
    document.getElementById('btTrades').textContent = total;
    document.getElementById('btPF').textContent = pf;
    document.getElementById('btDD').textContent = maxDD.toFixed(1) + '%';
    document.getElementById('btSharpe').textContent = sharpe;

    const ec = document.getElementById('equityCanvas');
    if (ec && equity.length > 1) {
        const ectx = ec.getContext('2d');
        ec.width = ec.offsetWidth || 300;
        ec.height = 80;
        ectx.clearRect(0, 0, ec.width, ec.height);
        const minE = Math.min(...equity), maxE = Math.max(...equity);
        const range = maxE - minE || 1;
        ectx.strokeStyle = netPnl >= 0 ? '#00c176' : '#ff4d4f';
        ectx.lineWidth = 1.5;
        ectx.beginPath();
        equity.forEach((v, i) => {
            const x = (i / (equity.length - 1)) * ec.width;
            const y = ec.height - ((v - minE) / range) * (ec.height - 4) - 2;
            i === 0 ? ectx.moveTo(x, y) : ectx.lineTo(x, y);
        });
        ectx.stroke();
    }

    document.getElementById('btTradeList').innerHTML = trades.slice(-20).reverse().map(t =>
        '<div style="display:flex;justify-content:space-between;font-size:10px;padding:2px 0;border-bottom:1px solid #2b2f3a">' +
        '<span style="color:' + (t.side === 'buy' ? '#00c176' : '#ff4d4f') + '">' + t.side.toUpperCase() + '</span>' +
        '<span style="color:#8b949e">' + t.entry.toFixed(5) + '</span>' +
        '<span style="color:' + (t.pnl >= 0 ? '#00c176' : '#ff4d4f') + '">' + (t.pnl >= 0 ? '+' : '') + '$' + t.pnl.toFixed(2) + '</span>' +
        '</div>'
    ).join('');
}

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
    let ctxTarget = null;
    const chartCanvas = document.getElementById('chart');
    if (!chartCanvas) return;

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
        document.getElementById('ctxMenu').classList.remove('show');
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
