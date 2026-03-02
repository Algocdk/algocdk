// dashboard.js - Main dashboard functionality
class Dashboard {
  constructor() {
    this.user = null;
    this.bots = [];
    this.transactions = [];
    this.derivAccount = null;
    this.init();
  }

  async init() {
    try {
      await this.loadUserProfile();
      await this.loadDashboardData();
      this.setupEventListeners();
      this.startRealTimeUpdates();
    } catch (error) {
      utils.handleError(error);
    }
  }

  async loadUserProfile() {
    try {
      this.user = await api.user.getProfile();
      this.updateUserDisplay();
    } catch (error) {
      console.error('Failed to load user profile:', error);
    }
  }

  async loadDashboardData() {
    try {
      // Load user's favorite bots
      const favorites = await api.user.getFavorites();
      this.updateFavoritesDisplay(favorites);

      // Load Deriv account from localStorage
      const accounts = JSON.parse(localStorage.getItem('deriv_accounts') || '[]');
      if (accounts.length > 0) {
        const token = accounts[0].token;
        const balance = await api.deriv.getBalance({ api_token: token });
        this.derivAccount = {
          email: accounts[0].account,
          balance: balance.data.balance,
          currency: balance.data.currency,
          loginid: balance.data.loginid
        };
        this.updateDerivDisplay();
      }

      // Load marketplace data
      const marketplace = await api.marketplace.getMarketplace();
      this.updateMarketplaceDisplay(marketplace);

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  }

  updateUserDisplay() {
    const userElements = document.querySelectorAll('[data-user-name]');
    const emailElements = document.querySelectorAll('[data-user-email]');
    
    userElements.forEach(el => el.textContent = this.user?.name || 'User');
    emailElements.forEach(el => el.textContent = this.user?.email || '');
  }

  updateFavoritesDisplay(favorites) {
    const container = document.getElementById('favorites-container');
    if (!container) return;

    if (!favorites || favorites.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-gray-400">
          <i class="fas fa-heart text-4xl mb-4"></i>
          <p>No favorite bots yet</p>
          <a href="/botstore" class="text-primary-500 hover:underline">Browse Bot Store</a>
        </div>
      `;
      return;
    }

    container.innerHTML = favorites.map(bot => `
      <div class="glass-effect p-4 rounded-lg">
        <div class="flex justify-between items-start mb-2">
          <h3 class="font-semibold">${bot.name}</h3>
          <button onclick="dashboard.toggleFavorite('${bot.id}')" class="text-red-500">
            <i class="fas fa-heart"></i>
          </button>
        </div>
        <p class="text-gray-400 text-sm mb-3">${bot.description}</p>
        <div class="flex justify-between items-center">
          <span class="text-success-500 font-medium">+${bot.performance}%</span>
          <button onclick="dashboard.viewBot('${bot.id}')" class="bg-primary-500 px-3 py-1 rounded text-sm">
            View
          </button>
        </div>
      </div>
    `).join('');
  }

  updateDerivDisplay() {
    const container = document.getElementById('deriv-container');
    if (!container) return;

    if (!this.derivAccount) {
      container.innerHTML = `
        <div class="glass-effect p-6 rounded-lg text-center">
          <i class="fas fa-link text-4xl text-gray-400 mb-4"></i>
          <h3 class="font-semibold mb-2">Connect Deriv Account</h3>
          <p class="text-gray-400 mb-4">Link your Deriv account to start automated trading</p>
          <button onclick="window.location.href='/deriv-connect'" class="bg-primary-500 px-4 py-2 rounded">
            Connect Account
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="glass-effect p-6 rounded-lg">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="font-semibold">Deriv Account</h3>
            <p class="text-gray-400">${this.derivAccount.loginid}</p>
          </div>
          <span class="bg-success-500/20 text-success-500 px-2 py-1 rounded text-sm">Connected</span>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <p class="text-gray-400 text-sm">Balance</p>
            <p class="font-semibold">${utils.formatCurrency(this.derivAccount.balance)}</p>
          </div>
          <div>
            <p class="text-gray-400 text-sm">Currency</p>
            <p class="font-semibold">${this.derivAccount.currency}</p>
          </div>
        </div>
      </div>
    `;
  }

  updateMarketplaceDisplay(marketplace) {
    const container = document.getElementById('marketplace-container');
    if (!container) return;

    container.innerHTML = marketplace.slice(0, 6).map(bot => `
      <div class="glass-effect p-4 rounded-lg hover:-translate-y-1 transition-transform">
        <div class="flex justify-between items-start mb-2">
          <h3 class="font-semibold">${bot.name}</h3>
          <span class="text-xs bg-primary-500/20 text-primary-500 px-2 py-1 rounded">${bot.category}</span>
        </div>
        <p class="text-gray-400 text-sm mb-3">${bot.description}</p>
        <div class="flex justify-between items-center mb-3">
          <span class="text-success-500 font-medium">+${bot.performance}%</span>
          <span class="font-semibold">${utils.formatCurrency(bot.price)}</span>
        </div>
        <div class="flex space-x-2">
          <button onclick="dashboard.purchaseBot('${bot.id}')" class="flex-1 bg-primary-500 py-2 rounded text-sm">
            Purchase
          </button>
          <button onclick="dashboard.toggleFavorite('${bot.id}')" class="px-3 py-2 border border-white/20 rounded">
            <i class="fas fa-heart"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  async toggleFavorite(botId) {
    try {
      await api.user.toggleFavorite(botId);
      await this.loadDashboardData(); // Refresh data
      utils.notify('Favorite updated', 'success');
    } catch (error) {
      utils.handleError(error);
    }
  }

  async purchaseBot(botId) {
    try {
      const result = await api.payment.initialize({ bot_id: botId });
      if (result.authorization_url) {
        window.location.href = result.authorization_url;
      }
    } catch (error) {
      utils.handleError(error);
    }
  }

  viewBot(botId) {
    window.location.href = `/bots/${botId}`;
  }

  async connectDeriv() {
    const token = prompt('Enter your Deriv API token:');
    if (!token) return;

    try {
      await api.deriv.saveToken({ token });
      await this.loadDashboardData();
      utils.notify('Deriv account connected successfully', 'success');
    } catch (error) {
      utils.handleError(error);
    }
  }

  setupEventListeners() {
    // Logout functionality
    const logoutBtns = document.querySelectorAll('[data-logout]');
    logoutBtns.forEach(btn => {
      btn.addEventListener('click', this.logout.bind(this));
    });

    // Profile update
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', this.updateProfile.bind(this));
    }

    // Search functionality
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', this.handleSearch.bind(this));
    }
  }

  async logout() {
    TokenManager.remove();
    window.location.href = '/auth';
  }

  async updateProfile(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData);

    try {
      await api.user.updateProfile(data);
      utils.notify('Profile updated successfully', 'success');
      await this.loadUserProfile();
    } catch (error) {
      utils.handleError(error);
    }
  }

  handleSearch(event) {
    const query = event.target.value.toLowerCase();
    const items = document.querySelectorAll('[data-searchable]');
    
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(query) ? 'block' : 'none';
    });
  }

  startRealTimeUpdates() {
    // Update balance every 30 seconds from localStorage token
    setInterval(async () => {
      try {
        const accounts = JSON.parse(localStorage.getItem('deriv_accounts') || '[]');
        if (accounts.length > 0) {
          const token = accounts[0].token;
          const balance = await api.deriv.getBalance({ api_token: token });
          this.derivAccount.balance = balance.data.balance;
          this.updateDerivDisplay();
        }
      } catch (error) {
        console.error('Failed to update real-time data:', error);
      }
    }, 30000);
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize dashboard for regular user pages, not admin/superadmin
  const currentPath = window.location.pathname;
  if (TokenManager.isValid() && currentPath !== '/admin' && currentPath !== '/superadmin') {
    window.dashboard = new Dashboard();
  }
});

// Export for use in other scripts
window.Dashboard = Dashboard;