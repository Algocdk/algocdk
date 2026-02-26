// admin-dashboard.js - Admin Dashboard Management
class AdminDashboard {
  constructor() {
    this.data = {
      dashboard: {},
      bots: [],
      transactions: [],
      profile: {}
    };
    this.init();
  }

  async init() {
    if (window.location.pathname !== '/admin') {
      return;
    }
    
    if (!TokenManager.isValid()) {
      window.location.href = '/auth';
      return;
    }

    try {
      await this.loadCurrentUser();
    } catch (err) {
      console.error('Failed to validate admin user:', err);
      return;
    }
    try {
      this.showLoading(true);
      await this.loadDashboardData();
      this.setupEventListeners();
      this.showLoading(false);
    } catch (error) {
      this.showLoading(false);
      utils.handleError(error);
    }
  }

  async loadCurrentUser() {
    try {
      const payload = TokenManager.getPayload();
      // admin profile endpoint uses the token to determine current admin
      const profileResponse = await api.admin.getProfile();
      const admin = profileResponse && profileResponse.admin ? profileResponse.admin : profileResponse;

      // If role does not include 'admin', show wrong-page and redirect
      const role = (admin && admin.role) ? String(admin.role).toLowerCase() : '';
      if (!role.includes('admin')) {
        // Not an admin - clear token and show wrong page overlay
        TokenManager.remove();
        // Reuse the overlay function from SuperAdminDashboard if available, otherwise fallback
        if (window.SuperAdminDashboard && typeof window.SuperAdminDashboard.prototype.showWrongPageMessageAndRedirect === 'function') {
          // create a temporary instance to call the overlay
          const tmp = new window.SuperAdminDashboard();
          tmp.showWrongPageMessageAndRedirect('/auth');
        } else {
          // simple fallback overlay
          const overlay = document.createElement('div');
          overlay.style.position = 'fixed'; overlay.style.inset = '0'; overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center'; overlay.style.background = 'rgba(0,0,0,0.8)'; overlay.style.zIndex = '9999';
          overlay.innerHTML = '<div style="background:#1f2937;color:#fff;padding:24px;border-radius:8px;text-align:center;max-width:480px;"><h2>Wrong Page</h2><p>You have accessed the Admin area by mistake. Redirecting to the login page...</p></div>';
          document.body.appendChild(overlay);
          setTimeout(() => window.location.href = '/auth', 3000);
        }
        throw new Error('not an admin');
      }

      // store some profile info
      this.data.profile = admin || {};
    } catch (err) {
      console.error('Error loading current admin profile:', err);
      if (err.message && (err.message.includes('401') || err.message.includes('403'))) {
        TokenManager.remove();
        window.location.href = '/auth';
      }
      throw err;
    }
  }

  async loadDashboardData() {
    try {
      // Load dashboard stats
      const dashboardResponse = await api.admin.getDashboard();
      this.data.dashboard = dashboardResponse.data || {};
      this.updateDashboardStats();

      // Load bots
      const botsResponse = await api.admin.getBots();
      this.data.bots = botsResponse.bots || [];
      this.updateBotsTable();

      // Load transactions
      const transactionsResponse = await api.admin.getTransactions();
      this.data.transactions = transactionsResponse.transactions || [];
      this.updateActivity();

      // Load profile
      const profileResponse = await api.admin.getProfile();
      this.data.profile = profileResponse.admin || {};
      this.updateProfile();

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      utils.notify('Failed to load dashboard data', 'error');
    }
  }

  updateDashboardStats() {
    const data = this.data.dashboard;
    
    // Update revenue - show admin share as total revenue
    const totalRevenueEl = document.getElementById('totalRevenue');
    if (totalRevenueEl) {
      totalRevenueEl.textContent = utils.formatCurrency(data.adminShare || 0);
    }

    // Update active bots - only bots with status='active' owned by admin
    const activeBotsEl = document.getElementById('activeBots');
    if (activeBotsEl) {
      activeBotsEl.textContent = data.activeBots || 0;
    }

    // Update total users
    const totalUsersEl = document.getElementById('totalUsers');
    if (totalUsersEl) {
      totalUsersEl.textContent = data.totalUsers || 0;
    }

    // Update transactions - only successful ones
    const totalTransactionsEl = document.getElementById('totalTransactions');
    if (totalTransactionsEl) {
      totalTransactionsEl.textContent = data.totalTransactions || 0;
    }

    // Update badges
    const botsBadge = document.getElementById('botsBadge');
    if (botsBadge) {
      botsBadge.textContent = data.totalBots || 0;
    }

    // Update growth indicators
    this.updateGrowthIndicators(data);
  }

  updateGrowthIndicators(data) {
    // Revenue change
    const revenueChangeEl = document.getElementById('revenueChange');
    if (revenueChangeEl && data.revenueGrowth !== undefined) {
      const growth = data.revenueGrowth || 0;
      revenueChangeEl.textContent = `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`;
      revenueChangeEl.parentElement.className = `stat-change ${growth >= 0 ? 'positive' : 'negative'}`;
    }

    // Bots change
    const botsChangeEl = document.getElementById('botsChange');
    if (botsChangeEl) {
      botsChangeEl.textContent = data.activeBots > 0 ? 'Running well' : 'No active bots';
    }

    // Users change
    const usersChangeEl = document.getElementById('usersChange');
    if (usersChangeEl && data.newUsersToday !== undefined) {
      usersChangeEl.textContent = `+${data.newUsersToday || 0} new today`;
    }

    // Transactions change
    const transactionsChangeEl = document.getElementById('transactionsChange');
    if (transactionsChangeEl) {
      const successRate = data.transactionSuccessRate || 100;
      transactionsChangeEl.textContent = `${successRate}% successful`;
    }
  }

  updateBotsTable() {
    const tbody = document.getElementById('botsTableBody');
    if (!tbody) return;

    if (this.data.bots.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
            No bots found. <a href="#" onclick="createBot()" style="color: var(--primary);">Create your first bot</a>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.data.bots.map(bot => `
      <tr>
        <td>
          <div style="font-weight: 500;">${bot.name || 'Unnamed Bot'}</div>
          <div style="font-size: 0.875rem; color: var(--text-secondary);">${bot.strategy || 'No strategy'}</div>
        </td>
        <td>
          <span class="status-badge status-${(bot.status || 'inactive').toLowerCase()}">
            ${bot.status || 'inactive'}
          </span>
        </td>
        <td>${bot.users?.length || 0}</td>
        <td>${utils.formatCurrency(bot.price || 0)}</td>
        <td>
          <div class="action-buttons">
            <button class="btn btn-primary" onclick="editBot('${bot.id}')">Edit</button>
            <button class="btn btn-danger" onclick="deleteBot('${bot.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  updateActivity() {
    const container = document.getElementById('recentActivity');
    if (!container) return;

    if (this.data.transactions.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-gray-400">
          <i class="fas fa-inbox text-4xl mb-3"></i>
          <p>No recent transactions</p>
          <p class="text-sm">Your sales will appear here</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.data.transactions.slice(0, 5).map(tx => `
      <div class="flex items-center justify-between p-4 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">
        <div class="flex items-center">
          <div class="bg-success bg-opacity-20 p-3 rounded-lg mr-4">
            <i class="fas fa-dollar-sign text-success"></i>
          </div>
          <div>
            <p class="font-medium">${tx.buyer_name || 'Customer'} - ${tx.bot_name || 'Bot'}</p>
            <p class="text-sm text-gray-400">${tx.payment_type || 'purchase'} • ${this.formatTime(tx.created_at)}</p>
          </div>
        </div>
        <div class="text-right">
          <p class="font-bold text-success">${utils.formatCurrency(tx.admin_share || 0)}</p>
          <p class="text-xs text-gray-400">Your share</p>
        </div>
      </div>
    `).join('');
  }

  updateProfile() {
    if (this.data.profile.name) {
      const initial = this.data.profile.name.charAt(0).toUpperCase();
      const userAvatar = document.getElementById('userAvatar');
      const userName = document.getElementById('userName');
      
      if (userAvatar) {
        userAvatar.textContent = initial;
      }
      if (userName) {
        userName.textContent = this.data.profile.name;
      }
    }
  }

  setupEventListeners() {
    // Navigation handlers are set up in the HTML file
    // Don't add duplicate handlers here
  }

  switchView(view) {
    // This method is called from the HTML navigation handlers
    console.log('AdminDashboard.switchView called:', view);
    // Update active nav
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });
    const targetLink = document.querySelector(`[href="#${view}"]`);
    if (targetLink) {
      targetLink.classList.add('active');
    }

    // Handle view switching logic here
    console.log('Switching to view:', view);
  }

  showLoading(show) {
    const loadingEl = document.getElementById('loadingState');
    if (loadingEl) {
      loadingEl.style.display = show ? 'block' : 'none';
    }
  }

  // Action methods
  async createBot() {
    // Show create bot modal or redirect
    const name = prompt('Enter bot name:');
    if (!name) return;
    
    const price = prompt('Enter bot price:');
    if (!price) return;
    
    const strategy = prompt('Enter bot strategy:');
    if (!strategy) return;

    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('price', price);
      formData.append('strategy', strategy);
      
      // Note: In production, you'd have a proper form with file uploads
      utils.notify('Bot creation requires file uploads. Please use the full form.', 'info');
      
    } catch (error) {
      utils.notify('Failed to create bot', 'error');
    }
  }

  async editBot(botId) {
    utils.notify(`Edit bot ${botId} - Feature coming soon`, 'info');
  }

  async deleteBot(botId) {
    if (confirm('Are you sure you want to delete this bot?')) {
      try {
        await api.admin.deleteBot(botId);
        utils.notify('Bot deleted successfully', 'success');
        await this.loadDashboardData();
      } catch (error) {
        utils.notify('Failed to delete bot', 'error');
      }
    }
  }

  async refreshData() {
    this.showLoading(true);
    await this.loadDashboardData();
    this.showLoading(false);
    utils.notify('Data refreshed', 'success');
  }

  // Utility methods
  formatTime(timestamp) {
    if (!timestamp) return 'Just now';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname === '/admin') {
    window.adminDashboard = new AdminDashboard();
  }
});

// Export for use in other scripts
window.AdminDashboard = AdminDashboard;