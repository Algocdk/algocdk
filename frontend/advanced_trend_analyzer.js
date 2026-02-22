// Advanced Trend Analyzer - Multi-Signal Indicator
// Combines EMA, RSI, MACD, and Volume analysis for comprehensive trend detection
// Author: AlgoCDK Team

function calculateIndicator(candles, params = {}) {
    // Configurable parameters
    const emaFast = params.emaFast || 12;
    const emaSlow = params.emaSlow || 26;
    const rsiPeriod = params.rsiPeriod || 14;
    const volumePeriod = params.volumePeriod || 20;
    
    // Calculate individual indicators
    const emaFastValues = calculateEMA(candles, emaFast);
    const emaSlowValues = calculateEMA(candles, emaSlow);
    const rsiValues = calculateRSI(candles, rsiPeriod);
    const volumeMA = calculateVolumeMA(candles, volumePeriod);
    
    // Composite trend score (0-100)
    const trendScore = [];
    const signals = [];
    const trendStrength = [];
    
    for (let i = 0; i < candles.length; i++) {
        if (i < Math.max(emaSlow, rsiPeriod, volumePeriod)) {
            trendScore.push(50); // Neutral
            signals.push(null);
            trendStrength.push(null);
            continue;
        }
        
        let score = 50; // Start neutral
        
        // 1. EMA Trend (30% weight)
        if (emaFastValues[i] !== null && emaSlowValues[i] !== null) {
            const emaDiff = ((emaFastValues[i] - emaSlowValues[i]) / emaSlowValues[i]) * 100;
            score += emaDiff * 3; // Scale to ±30 points
        }
        
        // 2. RSI Momentum (25% weight)
        if (rsiValues[i] !== null) {
            const rsiScore = (rsiValues[i] - 50) / 2; // Convert RSI to ±25 points
            score += rsiScore;
        }
        
        // 3. Price vs EMA (25% weight)
        if (emaSlowValues[i] !== null) {
            const priceVsEMA = ((candles[i].close - emaSlowValues[i]) / emaSlowValues[i]) * 100;
            score += priceVsEMA * 2.5; // Scale to ±25 points
        }
        
        // 4. Volume Confirmation (20% weight)
        if (volumeMA[i] !== null) {
            const volumeRatio = candles[i].volume / volumeMA[i];
            if (volumeRatio > 1.2) {
                score += 10; // High volume confirms trend
            } else if (volumeRatio < 0.8) {
                score -= 10; // Low volume weakens trend
            }
        }
        
        // Normalize score to 0-100
        score = Math.max(0, Math.min(100, score));
        trendScore.push(score);
        
        // Calculate trend strength (volatility-adjusted)
        const strength = Math.abs(score - 50) * 2; // 0-100 scale
        trendStrength.push(strength);
        
        // Generate signals
        if (score > 70 && (i === 0 || trendScore[i-1] <= 70)) {
            signals.push(100); // Strong buy signal
        } else if (score < 30 && (i === 0 || trendScore[i-1] >= 30)) {
            signals.push(0); // Strong sell signal
        } else {
            signals.push(null);
        }
    }
    
    return {
        name: 'Trend Analyzer',
        type: 'oscillator',
        panel: 'separate',  // Change to 'overlay' for Window 1
        data: trendScore,
        color: '#8B5CF6',
        lineWidth: 2,
        series: [
            {
                name: 'Trend Strength',
                data: trendStrength,
                color: '#F59E0B',
                lineWidth: 1,
                borderDash: [3, 3]
            },
            {
                name: 'Buy/Sell Signals',
                data: signals,
                color: '#10B981',
                lineWidth: 0,
                pointRadius: 6,
                pointStyle: 'star',
                pointBackgroundColor: signals.map(s => s === 100 ? '#10B981' : s === 0 ? '#EF4444' : 'transparent')
            }
        ]
    };
}

// Helper: Calculate EMA
function calculateEMA(candles, period) {
    const multiplier = 2 / (period + 1);
    const values = [];
    let ema = 0;
    
    // Initialize with SMA
    for (let i = 0; i < period && i < candles.length; i++) {
        ema += candles[i].close;
    }
    ema = ema / Math.min(period, candles.length);
    
    for (let i = 0; i < candles.length; i++) {
        if (i < period - 1) {
            values.push(null);
        } else if (i === period - 1) {
            values.push(ema);
        } else {
            ema = (candles[i].close - ema) * multiplier + ema;
            values.push(ema);
        }
    }
    return values;
}

// Helper: Calculate RSI
function calculateRSI(candles, period) {
    const values = [];
    
    for (let i = 0; i < candles.length; i++) {
        if (i < period) {
            values.push(null);
            continue;
        }
        
        let gains = 0;
        let losses = 0;
        
        for (let j = 1; j <= period; j++) {
            const change = candles[i - j + 1].close - candles[i - j].close;
            if (change > 0) gains += change;
            else losses -= change;
        }
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        
        if (avgLoss === 0) {
            values.push(100);
        } else {
            const rs = avgGain / avgLoss;
            const rsi = 100 - (100 / (1 + rs));
            values.push(rsi);
        }
    }
    return values;
}

// Helper: Calculate Volume Moving Average
function calculateVolumeMA(candles, period) {
    const values = [];
    
    for (let i = 0; i < candles.length; i++) {
        if (i < period - 1) {
            values.push(null);
            continue;
        }
        
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += candles[i - j].volume;
        }
        values.push(sum / period);
    }
    return values;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calculateIndicator };
}
