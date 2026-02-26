({
  name: "AI Trade Signals",
  window: 1,
  color: "#00ff00",
  defaultParams: { period: 10 },
  
  calculate: function(data, params) {
    const period = params.period || 10;
    
    return data.map((candle, i) => {
      if (i < period) return null;
      
      // Moving average
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b.close, 0);
      const ma = sum / period;
      
      // Price change
      const priceChange = i > 0 ? candle.close - data[i-1].close : 0;
      
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
  },
  
  draw: function(ctx, values, pad, spacing, yFunc, params) {
    if (!values || values.length === 0) return;
    
    ctx.save();
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    
    values.forEach((signal, i) => {
      if (signal) {
        const x = pad + i * spacing + spacing / 2;
        const y = yFunc(signal.price);
        
        ctx.fillStyle = signal.type === 'BUY' ? '#00ff00' : '#ff0000';
        
        if (signal.type === 'BUY') {
          ctx.fillText('▲', x, y - 8);
        } else {
          ctx.fillText('▼', x, y + 12);
        }
      }
    });
    
    ctx.restore();
  }
})
