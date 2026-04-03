// Complete Indicator Visualization System for Market Chart
// This renders custom indicators on the chart canvas

class IndicatorRenderer {
    constructor() {
        this.activeIndicators = [];
        this.indicatorCanvas = null;
        this.ctx = null;
        this.chartBounds = null;
        this.window1Indicators = []; // Overlay on main chart
        this.window2Indicators = []; // Separate panel
    }

    // Initialize indicator canvas overlay
    init() {
        const mainCanvas = document.querySelector('canvas');
        if (!mainCanvas) {
            console.error('Main chart canvas not found');
            return false;
        }

        // Remove old canvas if exists
        const oldCanvas = document.getElementById('indicatorOverlay');
        if (oldCanvas) oldCanvas.remove();

        // Create overlay canvas for indicators
        this.indicatorCanvas = document.createElement('canvas');
        this.indicatorCanvas.id = 'indicatorOverlay';
        this.indicatorCanvas.style.cssText = `
            position: absolute;
            top: ${mainCanvas.offsetTop}px;
            left: ${mainCanvas.offsetLeft}px;
            pointer-events: none;
            z-index: 10;
        `;
        this.indicatorCanvas.width = mainCanvas.width;
        this.indicatorCanvas.height = mainCanvas.height;
        
        mainCanvas.parentElement.appendChild(this.indicatorCanvas);
        this.ctx = this.indicatorCanvas.getContext('2d', { willReadFrequently: true });
        
        // Keep overlay synced with main canvas size
        const resizeObserver = new ResizeObserver(() => {
            if (this.indicatorCanvas && mainCanvas) {
                this.indicatorCanvas.width = mainCanvas.width;
                this.indicatorCanvas.height = mainCanvas.height;
                this.indicatorCanvas.style.top = `${mainCanvas.offsetTop}px`;
                this.indicatorCanvas.style.left = `${mainCanvas.offsetLeft}px`;
                this.redrawAll();
            }
        });
        resizeObserver.observe(mainCanvas);
        
        console.log('✅ Indicator canvas initialized');
        return true;
    }

    // Get chart data and bounds
    getChartData() {
        // Check if data is stored in renderer
        if (this.cachedData && this.cachedData.length > 0) {
            return this.cachedData;
        }
        return null;
    }

    // Set chart data from external source
    setChartData(data) {
        this.cachedData = data.map(d => ({
            time: d.time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volume || 0
        }));
    }

    // Calculate chart bounds for scaling
    calculateBounds(data, indicatorData, windowType = 'window1') {
        if (windowType === 'window2') {
            // Window 2: Separate panel at bottom
            const values = indicatorData.filter(v => v !== null);
            const minValue = Math.min(...values, 0);
            const maxValue = Math.max(...values, 100);
            const padding = 70;
            
            return {
                minValue: minValue,
                maxValue: maxValue,
                width: this.indicatorCanvas.width - padding * 2,
                height: 150,
                offsetY: this.indicatorCanvas.height - 170,
                offsetX: padding,
                window: 'window2'
            };
        }
        
        // Window 1: Overlay on main chart
        const prices = data.map(d => d.close);
        const values = indicatorData.filter(v => v !== null);
        
        const allValues = [...prices, ...values];
        const minValue = Math.min(...allValues);
        const maxValue = Math.max(...allValues);
        const padding = (maxValue - minValue) * 0.1;
        
        return {
            minValue: minValue - padding,
            maxValue: maxValue + padding,
            width: this.indicatorCanvas.width,
            height: this.indicatorCanvas.height - 200,
            offsetY: 0,
            offsetX: 0,
            window: 'window1'
        };
    }

    // Convert data value to canvas Y coordinate
    valueToY(value, bounds) {
        const range = bounds.maxValue - bounds.minValue;
        const normalized = (bounds.maxValue - value) / range;
        return (bounds.offsetY || 0) + normalized * bounds.height;
    }

    // Convert index to canvas X coordinate
    indexToX(index, totalPoints, bounds) {
        return (bounds.offsetX || 0) + (index / (totalPoints - 1)) * bounds.width;
    }

    // Draw line indicator
    drawLine(data, indicatorData, color, lineWidth, windowType = 'window1') {
        if (!this.ctx || !data || !indicatorData) return;

        const bounds = this.calculateBounds(data, indicatorData, windowType);
        
        // Draw panel background if window2
        if (windowType === 'window2') {
            this.drawWindow2Background(bounds);
        }
        
        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.beginPath();

        let started = false;
        for (let i = 0; i < indicatorData.length; i++) {
            if (indicatorData[i] !== null) {
                const x = this.indexToX(i, data.length, bounds);
                const y = this.valueToY(indicatorData[i], bounds);
                
                if (!started) {
                    this.ctx.moveTo(x, y);
                    started = true;
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
        }
        
        this.ctx.stroke();
        this.ctx.restore();
    }

    // Draw window 2 background and grid
    drawWindow2Background(bounds) {
        // Background
        this.ctx.fillStyle = 'rgba(14, 17, 23, 0.95)';
        this.ctx.fillRect(bounds.offsetX - 70, bounds.offsetY - 10, this.indicatorCanvas.width, bounds.height + 20);
        
        // Border
        this.ctx.strokeStyle = '#374151';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(bounds.offsetX - 70, bounds.offsetY - 10, this.indicatorCanvas.width, bounds.height + 20);
        
        // Title
        this.ctx.fillStyle = '#9ca3af';
        this.ctx.font = 'bold 12px monospace';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('WINDOW 2', bounds.offsetX, bounds.offsetY - 15);
        
        // Reference lines
        this.ctx.strokeStyle = '#1f2430';
        this.ctx.lineWidth = 1;
        [0, 30, 50, 70, 100].forEach(level => {
            const y = this.valueToY(level, bounds);
            this.ctx.beginPath();
            this.ctx.moveTo(bounds.offsetX, y);
            this.ctx.lineTo(bounds.offsetX + bounds.width, y);
            this.ctx.stroke();
            
            // Labels
            this.ctx.fillStyle = '#9ca3af';
            this.ctx.font = '11px monospace';
            this.ctx.textAlign = 'right';
            this.ctx.fillText(level, bounds.offsetX - 10, y + 4);
        });
        
        // Overbought/oversold zones
        this.ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
        const y70 = this.valueToY(70, bounds);
        const y100 = this.valueToY(100, bounds);
        this.ctx.fillRect(bounds.offsetX, y100, bounds.width, y70 - y100);
        
        this.ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
        const y30 = this.valueToY(30, bounds);
        const y0 = this.valueToY(0, bounds);
        this.ctx.fillRect(bounds.offsetX, y30, bounds.width, y0 - y30);
    }

    // Draw histogram/bar indicator
    drawHistogram(data, indicatorData, color, windowType = 'window1') {
        if (!this.ctx || !data || !indicatorData) return;

        this.ctx.save();
        const bounds = this.calculateBounds(data, indicatorData, windowType);
        const barWidth = bounds.width / data.length;
        const zeroY = this.valueToY(0, bounds);

        for (let i = 0; i < indicatorData.length; i++) {
            if (indicatorData[i] !== null) {
                const x = this.indexToX(i, data.length, bounds);
                const y = this.valueToY(indicatorData[i], bounds);
                const height = Math.abs(y - zeroY);
                
                this.ctx.fillStyle = indicatorData[i] >= 0 ? '#10B981' : '#EF4444';
                this.ctx.fillRect(x - barWidth/2, Math.min(y, zeroY), barWidth * 0.8, height);
            }
        }
        this.ctx.restore();
    }

    // Draw signal points
    drawSignals(data, signalData, color, size, windowType = 'window1') {
        if (!this.ctx || !data || !signalData) return;

        this.ctx.save();
        const bounds = this.calculateBounds(data, data.map(d => d.close), windowType);
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';

        for (let i = 0; i < signalData.length; i++) {
            if (signalData[i] !== null && signalData[i] !== undefined) {
                const x = this.indexToX(i, data.length, bounds);
                
                // Handle object signals (e.g., {type: 'BUY', price: 123})
                if (typeof signalData[i] === 'object' && signalData[i].type) {
                    const signal = signalData[i];
                    const y = this.valueToY(signal.price, bounds);
                    
                    this.ctx.fillStyle = signal.type === 'BUY' ? '#00ff00' : '#ff0000';
                    
                    if (signal.type === 'BUY') {
                        this.ctx.fillText('▲', x, y - 8);
                    } else {
                        this.ctx.fillText('▼', x, y + 12);
                    }
                } else {
                    // Handle simple numeric signals
                    const y = this.valueToY(data[i].close, bounds);
                    this.ctx.fillStyle = signalData[i] > 50 ? '#10B981' : '#EF4444';
                    this.ctx.beginPath();
                    this.ctx.arc(x, y, size, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }
        }
        this.ctx.restore();
    }

    // Apply indicator to chart
    async applyIndicator(userIndicator) {
        try {
            const indicator = userIndicator.Indicator || userIndicator.indicator;
            if (!indicator) {
                throw new Error('Invalid indicator data');
            }

            // Get chart data first
            const candles = this.getChartData();
            if (!candles || candles.length === 0) {
                throw new Error('No chart data available. Please wait for chart to load.');
            }

            console.log(`📊 Applying indicator: ${indicator.name}`);
            console.log(`📈 Chart data points: ${candles.length}`);

            // Initialize canvas after confirming data
            if (!this.indicatorCanvas) {
                if (!this.init()) {
                    throw new Error('Failed to initialize indicator canvas');
                }
            }

            // Execute indicator code — supports both formats:
            // 1. New: ({name, calculate(data,params), draw(ctx,...)})
            // 2. Old: function calculateIndicator(candles, params) => {name, data, color}
            let result;
            try {
                const parsed = new Function('return (' + indicator.code + ')')();
                if (parsed && typeof parsed.calculate === 'function') {
                    // New object format
                    const values = parsed.calculate(candles, parsed.defaultParams || {});
                    result = {
                        name: parsed.name,
                        data: values,
                        color: parsed.color || '#FF4500',
                        lineWidth: parsed.lineWidth || 2,
                        panel: parsed.window === 2 ? 'separate' : 'main'
                    };
                } else if (typeof parsed === 'function') {
                    // Old function format
                    result = parsed(candles, {});
                } else {
                    // Legacy: code string containing calculateIndicator function
                    const indicatorFunc = new Function('candles', 'params', `
                        ${indicator.code}
                        return calculateIndicator(candles, params);
                    `);
                    result = indicatorFunc(candles, {});
                }
            } catch(e) {
                // Final fallback: legacy calculateIndicator string
                const indicatorFunc = new Function('candles', 'params', `
                    ${indicator.code}
                    return calculateIndicator(candles, params);
                `);
                result = indicatorFunc(candles, {});
            }
            console.log('✅ Indicator calculated:', result);

            // Clear and redraw
            if (this.ctx) {
                this.ctx.clearRect(0, 0, this.indicatorCanvas.width, this.indicatorCanvas.height);
            }

            const windowType = result.panel === 'separate' ? 'window2' : 'window1';

            // Draw main indicator line or signals
            if (result.data && result.data.length > 0) {
                // Check if data contains signal objects
                const hasSignals = result.data.some(d => d && typeof d === 'object' && d.type);
                
                if (hasSignals) {
                    this.drawSignals(candles, result.data, result.color || '#00ff00', 6, windowType);
                } else {
                    this.drawLine(candles, result.data, result.color || '#FF4500', result.lineWidth || 2, windowType);
                }
            }

            // Draw additional series
            if (result.series && Array.isArray(result.series)) {
                result.series.forEach(series => {
                    if (series.type === 'bar' || series.type === 'histogram') {
                        this.drawHistogram(candles, series.data, series.color, windowType);
                    } else if (series.pointRadius > 0) {
                        this.drawSignals(candles, series.data, series.color, series.pointRadius, windowType);
                    } else {
                        this.drawLine(candles, series.data, series.color, series.lineWidth || 1, windowType);
                    }
                });
            }

            // Store active indicator
            this.activeIndicators.push({
                name: result.name,
                indicator: indicator,
                result: result,
                window: windowType,
                userIndicatorId: userIndicator.id || userIndicator.indicator_id
            });

            // Track by window
            if (windowType === 'window2') {
                this.window2Indicators.push(result.name);
            } else {
                this.window1Indicators.push(result.name);
            }

            // Show indicator label
            this.showIndicatorLabel(result.name, result.color, windowType);
            
            // Save to localStorage
            this.saveActiveIndicators();

            return {
                success: true,
                message: `✅ ${result.name} is now displayed on the chart!`
            };

        } catch (error) {
            console.error('❌ Error applying indicator:', error);
            return {
                success: false,
                message: `Error: ${error.message}`
            };
        }
    }

    // Show indicator label on chart
    showIndicatorLabel(name, color, windowType = 'window1') {
        const labelContainer = document.getElementById('indicatorLabels') || this.createLabelContainer();
        
        const label = document.createElement('div');
        label.className = 'indicator-label';
        label.style.cssText = `
            display: inline-block;
            background: rgba(14, 17, 23, 0.9);
            color: ${color};
            padding: 4px 8px;
            margin: 2px;
            border-radius: 4px;
            font-size: 11px;
            border: 1px solid ${color};
        `;
        const windowBadge = windowType === 'window2' ? '<span style="background:#374151;padding:2px 4px;border-radius:2px;margin-right:4px;font-size:9px;">W2</span>' : '';
        label.innerHTML = `${windowBadge}<i class="fas fa-chart-line"></i> ${name}`;
        
        labelContainer.appendChild(label);
    }

    // Create label container
    createLabelContainer() {
        const container = document.createElement('div');
        container.id = 'indicatorLabels';
        container.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            z-index: 1000;
            display: flex;
            flex-wrap: wrap;
            max-width: 300px;
        `;
        
        const chartContainer = document.querySelector('canvas').parentElement;
        chartContainer.appendChild(container);
        
        return container;
    }

    // Redraw all active indicators (called when chart scrolls/updates)
    redrawAll() {
        if (!this.ctx || !this.activeIndicators.length) return;
        
        console.log('Redrawing', this.activeIndicators.length, 'indicators');
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.indicatorCanvas.width, this.indicatorCanvas.height);
        
        // Redraw each active indicator
        this.activeIndicators.forEach(active => {
            const candles = this.getChartData();
            if (!candles || candles.length === 0) return;
            
            try {
                // Recalculate — supports new object format and old function format
                let result;
                try {
                    const parsed = new Function('return (' + active.indicator.code + ')')();
                    if (parsed && typeof parsed.calculate === 'function') {
                        const values = parsed.calculate(candles, parsed.defaultParams || {});
                        result = { name: parsed.name, data: values, color: parsed.color || '#FF4500', lineWidth: parsed.lineWidth || 2, panel: parsed.window === 2 ? 'separate' : 'main' };
                    } else if (typeof parsed === 'function') {
                        result = parsed(candles, {});
                    } else {
                        const fn = new Function('candles', 'params', `${active.indicator.code}\nreturn calculateIndicator(candles, params);`);
                        result = fn(candles, {});
                    }
                } catch(e) {
                    const fn = new Function('candles', 'params', `${active.indicator.code}\nreturn calculateIndicator(candles, params);`);
                    result = fn(candles, {});
                }
                const windowType = result.panel === 'separate' ? 'window2' : 'window1';
                
                console.log('Redrawing indicator:', result.name, 'window:', windowType);
                
                // Draw main indicator line or signals
                if (result.data && result.data.length > 0) {
                    // Check if data contains signal objects
                    const hasSignals = result.data.some(d => d && typeof d === 'object' && d.type);
                    
                    if (hasSignals) {
                        this.drawSignals(candles, result.data, result.color || '#00ff00', 6, windowType);
                    } else {
                        this.drawLine(candles, result.data, result.color || '#FF4500', result.lineWidth || 2, windowType);
                    }
                }
                
                // Draw additional series
                if (result.series && Array.isArray(result.series)) {
                    result.series.forEach(series => {
                        if (series.type === 'bar' || series.type === 'histogram') {
                            this.drawHistogram(candles, series.data, series.color, windowType);
                        } else if (series.pointRadius > 0) {
                            this.drawSignals(candles, series.data, series.color, series.pointRadius, windowType);
                        } else {
                            this.drawLine(candles, series.data, series.color, series.lineWidth || 1, windowType);
                        }
                    });
                }
            } catch (error) {
                console.error('Error redrawing indicator:', error);
            }
        });
    }

    // Save active indicators to localStorage
    saveActiveIndicators() {
        try {
            const indicatorsToSave = this.activeIndicators.map(active => ({
                userIndicatorId: active.userIndicatorId,
                name: active.name
            }));
            localStorage.setItem('activeIndicators', JSON.stringify(indicatorsToSave));
        } catch (error) {
            console.error('Failed to save indicators:', error);
        }
    }
    
    // Load saved indicators on page load
    async loadSavedIndicators() {
        try {
            const saved = localStorage.getItem('activeIndicators');
            if (!saved) return;
            
            const indicatorsToLoad = JSON.parse(saved);
            if (!indicatorsToLoad || indicatorsToLoad.length === 0) return;
            
            // Get user's indicators from API
            const userIndicators = await loadUserIndicators();
            if (!userIndicators || userIndicators.length === 0) return;
            
            // Load each saved indicator
            for (const saved of indicatorsToLoad) {
                const userIndicator = userIndicators.find(ui => 
                    (ui.id === saved.userIndicatorId) || 
                    (ui.indicator_id === saved.userIndicatorId) ||
                    ((ui.Indicator || ui.indicator)?.name === saved.name)
                );
                
                if (userIndicator) {
                    await this.applyIndicator(userIndicator);
                }
            }
        } catch (error) {
            console.error('Failed to load saved indicators:', error);
        }
    }

    // Clear all indicators
    clearAll() {
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.indicatorCanvas.width, this.indicatorCanvas.height);
        }
        this.activeIndicators = [];
        this.window1Indicators = [];
        this.window2Indicators = [];
        
        const labelContainer = document.getElementById('indicatorLabels');
        if (labelContainer) {
            labelContainer.innerHTML = '';
        }
        
        // Clear from localStorage
        localStorage.removeItem('activeIndicators');
        
        console.log('🗑️ All indicators cleared');
    }
}

// Global indicator renderer instance
window.indicatorRenderer = new IndicatorRenderer();

// Load and apply user indicators
async function loadUserIndicators() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return [];
        
        const response = await fetch('/api/indicators/my', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) return [];
        
        const data = await response.json();
        return data.indicators || [];
    } catch (error) {
        console.error('Failed to load indicators:', error);
        return [];
    }
}

// Apply indicator with full visualization
async function applyIndicatorToChart(userIndicator) {
    // Wait for chart data to be available
    let attempts = 0;
    while (attempts < 20) {
        const data = window.indicatorRenderer.getChartData();
        if (data && data.length > 0) break;
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
    }
    
    const result = await window.indicatorRenderer.applyIndicator(userIndicator);
    
    if (result.success) {
        alert(result.message);
    } else {
        alert(result.message);
    }
}

// Add indicator button to chart
function addIndicatorButton() {
    const strategyPanel = document.querySelector('.strategy-panel');
    if (!strategyPanel) {
        setTimeout(addIndicatorButton, 1000);
        return;
    }
    
    if (document.getElementById('indicatorLoaderBtn')) return;
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'margin-top: 8px; display: flex; gap: 4px;';
    
    // Add Indicator button
    const addBtn = document.createElement('button');
    addBtn.id = 'indicatorLoaderBtn';
    addBtn.innerHTML = '<i class="fas fa-plus"></i> Add Indicator';
    addBtn.style.cssText = 'flex: 1; background: #FF4500; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 11px; cursor: pointer;';
    addBtn.onclick = async () => {
        const indicators = await loadUserIndicators();
        
        if (!indicators || indicators.length === 0) {
            const goToStore = confirm('No indicators found. Visit Bot Store to add indicators?');
            if (goToStore) window.open('/botstore', '_blank');
            return;
        }
        
        const indicatorNames = indicators.map((ind, i) => {
            const indicator = ind.Indicator || ind.indicator;
            return `${i + 1}. ${indicator?.name || 'Unknown'} (${indicator?.category || 'Custom'})`;
        }).join('\n');
        
        const selection = prompt(`Select indicator to display:\n\n${indicatorNames}\n\nEnter number:`);
        
        if (selection) {
            const index = parseInt(selection) - 1;
            if (index >= 0 && index < indicators.length) {
                await applyIndicatorToChart(indicators[index]);
            }
        }
    };
    
    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.innerHTML = '<i class="fas fa-times"></i>';
    clearBtn.style.cssText = 'background: #EF4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 11px; cursor: pointer;';
    clearBtn.onclick = () => {
        window.indicatorRenderer.clearAll();
        alert('All indicators cleared');
    };
    
    buttonContainer.appendChild(addBtn);
    buttonContainer.appendChild(clearBtn);
    strategyPanel.appendChild(buttonContainer);
    
    console.log('✅ Indicator buttons added');
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        addIndicatorButton();
        // Load saved indicators after a delay to ensure chart is ready
        setTimeout(() => window.indicatorRenderer.loadSavedIndicators(), 2000);
    });
} else {
    addIndicatorButton();
    // Load saved indicators after a delay to ensure chart is ready
    setTimeout(() => window.indicatorRenderer.loadSavedIndicators(), 2000);
}
