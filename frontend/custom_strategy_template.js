({
  // Strategy name (displayed in UI)
  name: "My Custom Strategy",
  
  // Strategy parameters (editable)
  params: {
    stopLossPct: 2,
    takeProfitPct: 4
  },
  
  // Main function to generate trading signals
  // @param data - Array of candle objects: [{time, open, high, low, close}, ...]
  // @param params - Strategy parameters
  // @return Array of signal objects
  generateSignals: function(data, params) {
    const signals = [];
    
    // Example: Simple price breakout strategy
    // Buy when price breaks above 20-period high
    // Sell when price breaks below 20-period low
    
    const period = 20;
    
    for (let i = period; i < data.length; i++) {
      const recentCandles = data.slice(i - period, i);
      const highestHigh = Math.max(...recentCandles.map(c => c.high));
      const lowestLow = Math.min(...recentCandles.map(c => c.low));
      
      // Buy signal: price breaks above recent high
      if (data[i].close > highestHigh) {
        signals.push({
          type: 'entry',
          direction: 'buy',
          candleIndex: i,
          price: data[i].close,
          stopLoss: data[i].close * (1 - params.stopLossPct / 100),
          takeProfit: data[i].close * (1 + params.takeProfitPct / 100)
        });
      }
      
      // Sell signal: price breaks below recent low
      if (data[i].close < lowestLow) {
        signals.push({
          type: 'entry',
          direction: 'sell',
          candleIndex: i,
          price: data[i].close,
          stopLoss: data[i].close * (1 + params.stopLossPct / 100),
          takeProfit: data[i].close * (1 - params.takeProfitPct / 100)
        });
      }
    }
    
    return signals;
  }
})
