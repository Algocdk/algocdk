// Add this script to marketchart.html to load user indicators

// Load user's indicators
async function loadUserIndicators() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return [];
        
        const response = await fetch('/api/indicators/my', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) return [];
        
        const data = await response.json();
        console.log('Loaded indicators:', data);
        return data.indicators || [];
    } catch (error) {
        console.error('Failed to load indicators:', error);
        return [];
    }
}

// Show indicator details
function showIndicatorDetails(userIndicator) {
    try {
        // Handle both Indicator and indicator property names
        const indicator = userIndicator.Indicator || userIndicator.indicator;
        
        if (!indicator) {
            alert('Indicator data not found');
            console.error('Invalid indicator object:', userIndicator);
            return;
        }
        
        const details = `
✅ Indicator Successfully Loaded!

Name: ${indicator.name || 'Unknown'}
Category: ${indicator.category || 'Custom'}
Description: ${indicator.description || 'No description'}

Your indicator is now active and ready to use!

The indicator code has been loaded into the console.
Press F12 to view the code and test it.

You can also:
• Copy the code from console
• Test it on /indicator-template page
• Use it with custom strategies
        `;
        
        console.log('='.repeat(50));
        console.log('✅ INDICATOR LOADED:', indicator.name);
        console.log('='.repeat(50));
        console.log(indicator.code || 'No code available');
        console.log('='.repeat(50));
        console.log('To use this indicator, copy the code above and test it.');
        
        alert(details);
    } catch (error) {
        console.error('Error showing indicator:', error);
        alert('Error loading indicator details');
    }
}

// Add indicator selector button
function addIndicatorSelector() {
    try {
        const strategyPanel = document.querySelector('.strategy-panel');
        if (!strategyPanel) {
            setTimeout(addIndicatorSelector, 1000);
            return;
        }
        
        // Check if button already exists
        if (document.getElementById('indicatorLoaderBtn')) return;
        
        const indicatorButton = document.createElement('button');
        indicatorButton.id = 'indicatorLoaderBtn';
        indicatorButton.innerHTML = '<i class="fas fa-chart-line"></i> My Indicators';
        indicatorButton.style.cssText = 'background: #FF4500; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; margin-top: 8px; width: 100%;';
        indicatorButton.onclick = async () => {
            try {
                const indicators = await loadUserIndicators();
                
                if (!indicators || indicators.length === 0) {
                    const goToStore = confirm('No indicators found. Visit the Bot Store to add indicators?');
                    if (goToStore) window.open('/botstore', '_blank');
                    return;
                }
                
                // Build indicator list
                const indicatorNames = indicators.map((ind, i) => {
                    const indicator = ind.Indicator || ind.indicator;
                    const name = indicator?.name || 'Unknown';
                    const category = indicator?.category || 'Custom';
                    return `${i + 1}. ${name} (${category})`;
                }).join('\n');
                
                const selection = prompt(`Select indicator to view details:\n\n${indicatorNames}\n\nEnter number:`);
                
                if (selection) {
                    const index = parseInt(selection) - 1;
                    if (index >= 0 && index < indicators.length) {
                        showIndicatorDetails(indicators[index]);
                    } else {
                        alert('Invalid selection');
                    }
                }
            } catch (error) {
                console.error('Error in indicator button:', error);
                alert('Error loading indicators');
            }
        };
        
        strategyPanel.appendChild(indicatorButton);
        console.log('Indicator button added successfully');
    } catch (error) {
        console.error('Error adding indicator button:', error);
    }
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addIndicatorSelector);
} else {
    addIndicatorSelector();
}
