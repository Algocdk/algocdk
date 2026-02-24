({
  name: "My Custom Indicator",
  window: 1, // 1 for main chart overlay, 2 for separate panel
  color: "#ff0000",
  defaultParams: { period: 14, threshold: 70 },
  
  // Calculate indicator values for ALL candles
  calculate: function(data, params) {
    const period = params.period || 14;
    return data.map((_, i) => {
      if (i < period - 1) return null;
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b.close, 0);
      return sum / period;
    });
  },
  
  // Draw function receives ONLY the visible portion of values
  // The values array is already sliced to match the visible candles
  draw: function(ctx, values, pad, spacing, yFunc, params) {
    if (!values || values.length === 0) return;
    
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    let started = false;
    values.forEach((val, i) => {
      if (val !== null && val !== undefined) {
        // i is the index within the visible range
        const x = pad + i * spacing + spacing / 2;
        const y = yFunc(val);
        
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    
    ctx.stroke();
  }
})