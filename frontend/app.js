// app.js - Main application controller
class AlgocdkApp {
  constructor() {
    this.currentUser = null;
    this.currentPage = window.location.pathname;
    this.init();
  }

  async init() {
    try {
      // Capture Deriv OAuth tokens if redirected here from Deriv
      this.captureDerivOAuthTokens();

      // Initialize core components
      this.setupGlobalErrorHandling();
      this.setupRouting();
      
      // Check authentication status
      if (TokenManager.isValid()) {
        await this.loadUserSession();
      }

      // Initialize page-specific functionality
      this.initializePage();
      
      // Setup global event listeners
      this.setupGlobalListeners();

    } catch (error) {
      console.error('Failed to initialize app:', error);
    }
  }

  captureDerivOAuthTokens() {
    const params = new URLSearchParams(window.location.search);
    const acct1 = params.get('acct1');
    const token1 = params.get('token1');
    if (!acct1 || !token1) return;

    const accounts = [];
    if (acct1 && token1) accounts.push({ account: acct1, token: token1, currency: params.get('cur1') || 'USD' });
    if (params.get('acct2') && params.get('token2')) {
      accounts.push({ account: params.get('acct2'), token: params.get('token2'), currency: params.get('cur2') || 'USD' });
    }

    // Store tokens in localStorage only — never sent to backend
    DerivTokenManager.setAccounts(accounts);

    // Clean tokens from URL so they don't sit in browser history
    window.history.replaceState({}, document.title, window.location.pathname);

    // Notify backend of account metadata (no token)
    const jwt = TokenManager.get();
    if (jwt) {
      fetch('/api/deriv/oauth/callback', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts })
      }).catch(err => console.warn('Deriv metadata sync failed:', err));
    }
  }
  setupGlobalErrorHandling() {
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      utils.notify('An unexpected error occurred', 'error');
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      utils.notify('An unexpected error occurred', 'error');
    });
  }

  setupRouting() {
    // Handle browser back/forward buttons
    window.addEventListener('popstate', () => {
      this.currentPage = window.location.pathname;
      this.initializePage();
    });
  }

  async loadUserSession() {
    try {
      this.currentUser = await api.user.getProfile();
      this.updateUserInterface();
    } catch (error) {
      console.error('Failed to load user session:', error);
      TokenManager.remove();
    }
  }

  updateUserInterface() {
    if (!this.currentUser) return;

    // Update user display elements
    const userNameElements = document.querySelectorAll('[data-user-name]');
    const userEmailElements = document.querySelectorAll('[data-user-email]');
    const userAvatarElements = document.querySelectorAll('[data-user-avatar]');

    userNameElements.forEach(el => el.textContent = this.currentUser.name || 'User');
    userEmailElements.forEach(el => el.textContent = this.currentUser.email || '');
    userAvatarElements.forEach(el => {
      if (this.currentUser.avatar) {
        el.src = this.currentUser.avatar;
      } else {
        el.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(this.currentUser.name || 'User')}&background=ff4500&color=fff`;
      }
    });

    // Show/hide elements based on user role
    this.updateRoleBasedUI();
  }

  updateRoleBasedUI() {
    const role = this.currentUser?.role || 'user';
    
    // Hide/show elements based on role
    document.querySelectorAll('[data-role]').forEach(element => {
      const allowedRoles = element.dataset.role.split(',');
      element.style.display = allowedRoles.includes(role) ? '' : 'none';
    });

    // Redirect if on wrong dashboard
    const currentPath = window.location.pathname;
    if (role === 'superadmin' && currentPath !== '/superadmin') {
      if (currentPath === '/app' || currentPath === '/admin') {
        window.location.href = '/superadmin';
      }
    } else if (role === 'admin' && currentPath !== '/admin') {
      if (currentPath === '/app' || currentPath === '/superadmin') {
        window.location.href = '/admin';
      }
    } else if (role === 'user' && currentPath !== '/app') {
      if (currentPath === '/admin' || currentPath === '/superadmin') {
        window.location.href = '/app';
      }
    }
  }

  initializePage() {
    const page = this.currentPage;

    // Page-specific initialization
    switch (page) {
      case '/':
      case '/index.html':
        this.initHomePage();
        break;
      case '/auth':
        this.initAuthPage();
        break;
      case '/app':
        this.initDashboardPage();
        break;
      case '/profile':
        this.initProfilePage();
        break;
      case '/botstore':
        this.initBotStorePage();
        break;
      case '/mybots':
        this.initMyBotsPage();
        break;
      case '/admin':
        this.initAdminPage();
        break;
      case '/superadmin':
        this.initSuperAdminPage();
        break;
      default:
        this.initGenericPage();
    }
  }

  initHomePage() {
    // Initialize landing page functionality
    this.setupScrollAnimations();
    this.setupHeroInteractions();
  }

  initAuthPage() {
    // Auth page is handled by auth.js
    console.log('Auth page initialized');
  }

  initDashboardPage() {
    // Dashboard is handled by dashboard.js
    console.log('Dashboard page initialized');
  }

  initProfilePage() {
    this.setupProfileForm();
  }

  initBotStorePage() {
    this.loadBotStore();
  }

  initMyBotsPage() {
    this.loadUserBots();
  }

  initAdminPage() {
    this.loadAdminDashboard();
  }

  initSuperAdminPage() {
    this.loadSuperAdminDashboard();
  }

  initGenericPage() {
    // Generic page initialization
    console.log('Generic page initialized');
  }

  setupGlobalListeners() {
    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (mobileMenuBtn && mobileMenu) {
      mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
      });
    }

    // Search functionality
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
      searchInput.addEventListener('input', this.handleGlobalSearch.bind(this));
    }

    // Theme toggle (if implemented)
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', this.toggleTheme.bind(this));
    }

    // Logout buttons
    document.addEventListener('click', (event) => {
      if (event.target.matches('[data-logout]')) {
        this.logout();
      }
    });
  }

  setupScrollAnimations() {
    // Intersection Observer for scroll animations
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-fade-in');
        }
      });
    }, observerOptions);

    // Observe elements with animation classes
    document.querySelectorAll('.animate-on-scroll').forEach(el => {
      observer.observe(el);
    });
  }

  setupHeroInteractions() {
    // Add interactive elements to hero section
    const heroButtons = document.querySelectorAll('.hero-cta');
    heroButtons.forEach(button => {
      button.addEventListener('mouseenter', () => {
        button.classList.add('scale-105');
      });
      button.addEventListener('mouseleave', () => {
        button.classList.remove('scale-105');
      });
    });
  }

  setupProfileForm() {
    const profileForm = document.getElementById('profile-form');
    if (!profileForm) return;

    profileForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      
      const formData = new FormData(event.target);
      const data = Object.fromEntries(formData);

      try {
        await api.user.updateProfile(data);
        utils.notify('Profile updated successfully', 'success');
        await this.loadUserSession();
      } catch (error) {
        utils.notify('Failed to update profile', 'error');
      }
    });
  }

  async loadBotStore() {
    try {
      const marketplace = await api.marketplace.getMarketplace();
      this.renderBotStore(marketplace);
    } catch (error) {
      utils.notify('Failed to load bot store', 'error');
    }
  }

  renderBotStore(bots) {
    const container = document.getElementById('bot-store-container');
    if (!container) return;

    container.innerHTML = bots.map(bot => `
      <div class="glass-effect p-6 rounded-lg hover:-translate-y-1 transition-transform">
        <div class="flex justify-between items-start mb-4">
          <h3 class="text-xl font-semibold">${bot.name}</h3>
          <span class="bg-primary-500/20 text-primary-500 px-2 py-1 rounded text-sm">${bot.category}</span>
        </div>
        <p class="text-gray-400 mb-4">${bot.description}</p>
        <div class="flex justify-between items-center mb-4">
          <span class="text-success-500 font-medium">+${bot.performance}% ROI</span>
          <span class="text-2xl font-bold">${utils.formatCurrency(bot.price)}</span>
        </div>
        <div class="flex space-x-2">
          <button onclick="app.purchaseBot('${bot.id}')" class="flex-1 bg-primary-500 py-2 rounded font-medium">
            Purchase
          </button>
          <button onclick="app.toggleFavorite('${bot.id}')" class="px-4 py-2 border border-white/20 rounded">
            <i class="fas fa-heart"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  async loadUserBots() {
    // Implementation would depend on your API structure
    console.log('Loading user bots...');
  }

  async loadAdminDashboard() {
    if (this.currentUser?.role !== 'admin') {
      window.location.href = '/app';
      return;
    }
    // Load admin-specific data
    console.log('Loading admin dashboard...');
  }

  async loadSuperAdminDashboard() {
    if (this.currentUser?.role !== 'superadmin') {
      window.location.href = '/app';
      return;
    }
    // Load superadmin-specific data
    console.log('Loading superadmin dashboard...');
  }

  async purchaseBot(botId) {
    try {
      const result = await api.payment.initialize({ bot_id: botId });
      if (result.authorization_url) {
        window.location.href = result.authorization_url;
      }
    } catch (error) {
      utils.notify('Failed to initiate purchase', 'error');
    }
  }

  async toggleFavorite(botId) {
    try {
      await api.user.toggleFavorite(botId);
      utils.notify('Favorite updated', 'success');
      // Refresh current view if needed
    } catch (error) {
      utils.notify('Failed to update favorite', 'error');
    }
  }

  handleGlobalSearch(event) {
    const query = event.target.value.toLowerCase();
    // Implement global search functionality
    console.log('Searching for:', query);
  }

  toggleTheme() {
    // Implement theme switching
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
  }

  logout() {
    TokenManager.remove();
    window.location.href = '/auth';
  }

  // Utility methods
  formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  }

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      utils.notify('Copied to clipboard', 'success');
    }).catch(() => {
      utils.notify('Failed to copy', 'error');
    });
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize main app for non-admin pages
  const currentPath = window.location.pathname;
  if (currentPath !== '/admin' && currentPath !== '/superadmin') {
    window.app = new AlgocdkApp();
  }
});

// Export for use in other scripts
window.AlgocdkApp = AlgocdkApp;