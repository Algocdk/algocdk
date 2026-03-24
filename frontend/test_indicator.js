const candles = [
  { time: 1000, open: 1, high: 2, low: 0, close: 1.5 },
  { time: 1001, open: 1.5, high: 2.5, low: 1, close: 2.0 },
  { time: 1002, open: 2.0, high: 3, low: 1.5, close: 2.5 },
  { time: 1003, open: 2.5, high: 3.5, low: 2, close: 3.0 },
  { time: 1004, open: 3.0, high: 4, low: 2.5, close: 3.5 }
];

const template = {
  name: "My Custom Indicator",
  window: 1,
  color: "#00FF00",
  defaultParams: { period: 3 }, // small period for testing
  calculate: function(data, params) {
    const period = params.period || 14;
    return data.map((_, i) => {
      if (i < period - 1) return null;
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b.close, 0);
      return sum / period;
    });
  }
};

const v = template.calculate(candles, template.defaultParams);
console.log("Calculated v:");
console.dir(v);

const mappedData = candles.map((c, i) => {
  const val = v[i];
  return (val !== null && val !== undefined && !isNaN(val)) ? { time: c.time, value: Number(val) } : null;
}).filter(point => point !== null);

console.log("Mapped Data for Lightweight Charts:");
console.dir(mappedData);
