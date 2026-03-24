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

/* ===== BACKTESTER ===== */
function runBacktest() {
    const from = parseInt(document.getElementById('btFrom').value) || 0;
    const to = Math.min(parseInt(document.getElementById('btTo').value) || 500, candles.length);
    const capital = parseFloat(document.getElementById('btCapital').value) || 1000;
    const data = candles.slice(from, to);
    if (data.length < 10) { alert('Not enough candles in range'); return; }

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
document.addEventListener('DOMContentLoaded', function() {
    renderAlerts();
});
