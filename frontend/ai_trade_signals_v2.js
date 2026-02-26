// AI Trade Signals v2 - Simple Buy/Sell Signal Indicator
// Shows buy (▲) and sell (▼) signals based on moving average and price action

function calculateIndicator(candles, params = {}) {
    const period = params.period || 10;
    
    const signals = candles.map((candle, i) => {
      if (i < period) return null;
      
      // Moving average
      const sum = candles.slice(i - period + 1, i + 1).reduce((a, b) => a + b.close, 0);
      const ma = sum / period;
      
      // Price change
      const priceChange = i > 0 ? candle.close - candles[i-1].close : 0;
      
      // Buy signal: price above MA and green candle
      if (candle.close > ma && candle.close > candle.open && priceChange > 0) {
        return { type: 'BUY', price: candle.high };
      }
      
      // Sell signal: price below MA and red candle  
      if (candle.close < ma && candle.close < candle.open && priceChange < 0) {
        return { type: 'SELL', price: candle.low };
      }
      
      return null;
    });
    
    return {
        name: 'AI Trade Signals v2',
        type: 'overlay',
        panel: 'overlay',
        data: signals,
        color: '#00ff00',
        lineWidth: 0,
        series: []
    };
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calculateIndicator };
}
