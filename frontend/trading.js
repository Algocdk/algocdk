// trading.js - Trading interface functionality
class TradingInterface {
  constructor() {
    this.currentSymbol = 'EUR/USD';
    this.currentPrice = 0;
    this.positions = [];
    this.balance = 0;
    this.isConnected = false;
    this.init();
  }

  async init() {
    try {
      await this.checkDerivConnection();
      this.setupEventListeners();
      this.startPriceUpdates();
      this.loadPositions();
    } catch (error) {
      console.error('Failed to initialize trading interface:', error);
    }
  }

  async checkDerivConnection() {
    try {
      if (!DerivTokenManager.hasAccounts()) {
        throw new Error('No accounts');
      }

      const balance = await api.deriv.getMyBalance();
      this.isConnected = true;
      this.balance = balance.data.balance;
      this.updateConnectionStatus(true);
      this.updateBalanceDisplay();
    } catch (error) {
      this.isConnected = false;
      this.updateConnectionStatus(false);
      this.showConnectPrompt();
    }
  }

  setupEventListeners() {
    // Symbol selection
    const symbolSelect = document.getElementById('symbol-select');
    if (symbolSelect) {
      symbolSelect.addEventListener('change', this.changeSymbol.bind(this));
    }

    // Buy/Sell buttons
    const buyBtn = document.getElementById('buy-btn');
    const sellBtn = document.getElementById('sell-btn');
    
    if (buyBtn) buyBtn.addEventListener('click', () => this.openPosition('buy'));
    if (sellBtn) sellBtn.addEventListener('click', () => this.openPosition('sell'));

    // Amount input validation
    const amountInput = document.getElementById('amount-input');
    if (amountInput) {
      amountInput.addEventListener('input', this.validateAmount.bind(this));
    }

    // Leverage selection
    const leverageSelect = document.getElementById('leverage-select');
    if (leverageSelect) {
      leverageSelect.addEventListener('change', this.updateMarginRequirement.bind(this));
    }

    // Close position buttons
    document.addEventListener('click', (event) => {
      if (event.target.matches('[data-close-position]')) {
        const positionId = event.target.dataset.closePosition;
        this.closePosition(positionId);
      }
    });
  }

  updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connection-status');
    const connectBtn = document.getElementById('connect-deriv-btn');
    
    if (statusElement) {
      statusElement.innerHTML = connected 
        ? '<i class="fas fa-circle text-green-500 mr-2"></i>Connected'
        : '<i class="fas fa-circle text-red-500 mr-2"></i>Disconnected';
    }

    if (connectBtn) {
      connectBtn.style.display = connected ? 'none' : 'block';
      connectBtn.onclick = () => window.location.href = '/deriv-connect';
    }

    const tradingControls = document.querySelectorAll('.trading-control');
    tradingControls.forEach(control => {
      control.disabled = !connected;
      control.classList.toggle('opacity-50', !connected);
    });
  }

  showConnectPrompt() {
    const msg = document.createElement('div');
    msg.className = 'fixed top-4 right-4 bg-orange-500 text-white px-6 py-4 rounded-lg shadow-lg z-50';
    msg.innerHTML = `
      <p class="mb-2">⚠️ No Deriv account connected</p>
      <button onclick="window.location.href='/deriv-connect'" class="bg-white text-orange-500 px-4 py-2 rounded font-semibold">
        Connect Now
      </button>
    `;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 10000);
  }

  updateBalanceDisplay() {
    const balanceElements = document.querySelectorAll('[data-balance]');
    balanceElements.forEach(element => {
      element.textContent = utils.formatCurrency(this.balance);
    });
  }

  changeSymbol(event) {
    this.currentSymbol = event.target.value;
    this.updateSymbolDisplay();
    // In a real implementation, you'd fetch new price data for the symbol
  }

  updateSymbolDisplay() {
    const symbolElements = document.querySelectorAll('[data-current-symbol]');
    symbolElements.forEach(element => {
      element.textContent = this.currentSymbol;
    });
  }

  validateAmount(event) {
    const amount = parseFloat(event.target.value);
    const maxAmount = this.balance * 0.1; // Max 10% of balance per trade
    
    if (amount > maxAmount) {
      event.target.value = maxAmount.toFixed(2);
      utils.notify(`Maximum amount is ${utils.formatCurrency(maxAmount)}`, 'warning');
    }

    this.updateMarginRequirement();
  }

  updateMarginRequirement() {
    const amountInput = document.getElementById('amount-input');
    const leverageSelect = document.getElementById('leverage-select');
    const marginElement = document.getElementById('margin-requirement');

    if (!amountInput || !leverageSelect || !marginElement) return;

    const amount = parseFloat(amountInput.value) || 0;
    const leverage = parseInt(leverageSelect.value) || 1;
    const margin = amount / leverage;

    marginElement.textContent = utils.formatCurrency(margin);
    
    // Check if sufficient balance
    const sufficientBalance = margin <= this.balance;
    marginElement.classList.toggle('text-red-500', !sufficientBalance);
    marginElement.classList.toggle('text-green-500', sufficientBalance);
  }

  async openPosition(direction) {
    if (!this.isConnected) {
      utils.notify('Please connect your Deriv account first', 'error');
      return;
    }

    const amountInput = document.getElementById('amount-input');
    const leverageSelect = document.getElementById('leverage-select');
    
    const amount = parseFloat(amountInput.value);
    const leverage = parseInt(leverageSelect.value);

    if (!amount || amount <= 0) {
      utils.notify('Please enter a valid amount', 'error');
      return;
    }

    const margin = amount / leverage;
    if (margin > this.balance) {
      utils.notify('Insufficient balance', 'error');
      return;
    }

    try {
      await api.deriv.placeTrade({
        symbol: this.currentSymbol,
        trade_type: direction === 'buy' ? 'CALL' : 'PUT',
        amount: amount,
        duration: 5
      });

      utils.notify(`${direction.toUpperCase()} position opened for ${this.currentSymbol}`, 'success');
      
      amountInput.value = '';
      this.updateMarginRequirement();
      await this.checkDerivConnection();

    } catch (error) {
      utils.notify('Failed to open position: ' + error.message, 'error');
    }
  }

  async closePosition(positionId) {
    const positionIndex = this.positions.findIndex(p => p.id === positionId);
    if (positionIndex === -1) return;

    const position = this.positions[positionIndex];
    
    try {
      // Calculate P&L (simplified calculation)
      const priceDiff = this.currentPrice - position.openPrice;
      const pnl = position.direction === 'buy' 
        ? priceDiff * position.amount / position.openPrice
        : -priceDiff * position.amount / position.openPrice;

      // Return margin plus P&L
      const margin = position.amount / position.leverage;
      this.balance += margin + pnl;

      // Remove position
      this.positions.splice(positionIndex, 1);
      
      this.updatePositionsDisplay();
      this.updateBalanceDisplay();

      const pnlText = pnl >= 0 ? `+${utils.formatCurrency(pnl)}` : utils.formatCurrency(pnl);
      utils.notify(`Position closed. P&L: ${pnlText}`, pnl >= 0 ? 'success' : 'error');

    } catch (error) {
      utils.notify('Failed to close position', 'error');
    }
  }

  updatePositionsDisplay() {
    const container = document.getElementById('positions-container');
    if (!container) return;

    if (this.positions.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-gray-400">
          <i class="fas fa-chart-line text-4xl mb-4"></i>
          <p>No open positions</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.positions.map(position => {
      const priceDiff = this.currentPrice - position.openPrice;
      const pnl = position.direction === 'buy' 
        ? priceDiff * position.amount / position.openPrice
        : -priceDiff * position.amount / position.openPrice;
      
      const pnlClass = pnl >= 0 ? 'text-green-500' : 'text-red-500';
      const directionClass = position.direction === 'buy' ? 'text-green-500' : 'text-red-500';
      const directionIcon = position.direction === 'buy' ? 'fa-arrow-up' : 'fa-arrow-down';

      return `
        <div class="glass-effect p-4 rounded-lg">
          <div class="flex justify-between items-start mb-2">
            <div class="flex items-center space-x-2">
              <i class="fas ${directionIcon} ${directionClass}"></i>
              <span class="font-semibold">${position.symbol}</span>
              <span class="text-sm ${directionClass}">${position.direction.toUpperCase()}</span>
            </div>
            <button data-close-position="${position.id}" class="text-red-500 hover:text-red-400">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p class="text-gray-400">Amount</p>
              <p class="font-medium">${utils.formatCurrency(position.amount)}</p>
            </div>
            <div>
              <p class="text-gray-400">Leverage</p>
              <p class="font-medium">${position.leverage}x</p>
            </div>
            <div>
              <p class="text-gray-400">Open Price</p>
              <p class="font-medium">${position.openPrice.toFixed(5)}</p>
            </div>
            <div>
              <p class="text-gray-400">P&L</p>
              <p class="font-medium ${pnlClass}">${pnl >= 0 ? '+' : ''}${utils.formatCurrency(pnl)}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  startPriceUpdates() {
    // Simulate price updates (in a real app, this would connect to a WebSocket)
    setInterval(() => {
      // Generate random price movement
      const change = (Math.random() - 0.5) * 0.0001;
      this.currentPrice = Math.max(0.5, (this.currentPrice || 1.0854) + change);
      
      this.updatePriceDisplay();
      this.updatePositionsDisplay();
    }, 1000);
  }

  updatePriceDisplay() {
    const priceElements = document.querySelectorAll('[data-current-price]');
    priceElements.forEach(element => {
      element.textContent = this.currentPrice.toFixed(5);
    });
  }

  async loadPositions() {
    // In a real implementation, this would load positions from the server
    this.positions = [];
    this.updatePositionsDisplay();
  }

  async connectDeriv() {
    const token = prompt('Enter your Deriv API token:');
    if (!token) return;

    try {
      await api.deriv.saveToken({ token });
      await this.checkDerivConnection();
      utils.notify('Deriv account connected successfully', 'success');
    } catch (error) {
      utils.notify('Failed to connect Deriv account', 'error');
    }
  }
}

// Initialize trading interface when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('trading-interface')) {
    window.tradingInterface = new TradingInterface();
  }
});

// Export for use in other scripts
window.TradingInterface = TradingInterface;