// api.js - Client-side API helper functions for interacting with the backend API
// Base URL for the API (update this for production)
const API_BASE_URL = window.location.origin + '/api';

// Token management
const TokenManager = {
  get: () => localStorage.getItem('token'),
  set: (token) => localStorage.setItem('token', token),
  remove: () => localStorage.removeItem('token'),
  isValid: () => {
    const token = TokenManager.get();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp > Date.now() / 1000;
    } catch {
      return false;
    }
  }
  ,
  getPayload: () => {
    const token = TokenManager.get();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload;
    } catch {
      return null;
    }
  }
};

// Helper function to make API requests
async function apiRequest(endpoint, method = 'GET', data = null, headers = {}, requireAuth = false) {
  const config = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  // Add auth token if required or available
  if (requireAuth || TokenManager.get()) {
    const token = TokenManager.get();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if (requireAuth) {
      throw new Error('Authentication required');
    }
  }

  if (data) {
    config.body = JSON.stringify(data);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    const error = new Error(errorData.message || `API request failed: ${response.statusText}`);
    // Attach additional error data
    if (errorData.code) error.code = errorData.code;
    if (errorData.email) error.email = errorData.email;
    throw error;
  }

  return response.json();
}

// API functions grouped by category
const api = {
  marketplace: {
    getMarketplace: () => apiRequest('/marketplace'),
  },

  paystack: {
    getCallback: () => apiRequest('/paystack/callback'),
  },

  auth: {
    signup: (data) => apiRequest('/auth/signup', 'POST', data),
    login: (data) => apiRequest('/auth/login', 'POST', data),
    forgotPassword: (data) => apiRequest('/auth/forgot_password/', 'POST', data),
    verifyEmail: (token) => apiRequest(`/auth/verify-email?token=${token}`, 'GET'),
    resendVerification: (data) => apiRequest('/auth/resend-verification', 'POST', data),
  },

  user: {
    getProfile: () => apiRequest('/user/profile', 'GET', null, {}, true),
    updateProfile: (data) => apiRequest('/user/profile', 'PUT', data, {}, true),
    deleteAccount: () => apiRequest('/user/account', 'DELETE', null, {}, true),
    resetPassword: (data) => apiRequest('/user/reset-password', 'POST', data, {}, true),
    toggleFavorite: (botId) => apiRequest(`/user/favorite/${botId}`, 'POST', null, {}, true),
    getFavorites: () => apiRequest('/user/favorite', 'GET', null, {}, true),
  },

  superadmin: {
    auth: {
      signup: (data) => apiRequest('/superadmin/auth/signup', 'POST', data),
      login: (data) => apiRequest('/superadmin/auth/login', 'POST', data),
    },
    getProfile: (id) => apiRequest(`/superadmin/profile/${id}`, 'GET', null, {}, true),
    getDashboard: (id) => apiRequest(`/superadmin/superadmindashboard/${id}`, 'GET', null, {}, true),
    createUser: (data) => apiRequest('/superadmin/create_user', 'POST', data, {}, true),
    updateUser: (id, data) => apiRequest(`/superadmin/update_user/${id}`, 'POST', data, {}, true),
    deleteUser: (id) => apiRequest(`/superadmin/delete_user/${id}`, 'DELETE', null, {}, true),
    getAllUsers: () => apiRequest('/superadmin/users', 'GET', null, {}, true),
    getUserById: (id) => apiRequest(`/superadmin/user/${id}`, 'GET', null, {}, true),
    createAdmin: (data) => apiRequest('/superadmin/create_admin', 'POST', data, {}, true),
    getAllAdmins: () => apiRequest('/superadmin/get_all_admins', 'GET', null, {}, true),
    toggleAdminStatus: (id) => apiRequest(`/superadmin/toggle_admin_status?id=${id}`, 'GET', null, {}, true),
    updateAdmin: (id, data) => apiRequest(`/superadmin/update_admin/${id}`, 'POST', data, {}, true),
    deleteAdmin: (id) => apiRequest(`/superadmin/delete_admin?id=${id}`, 'DELETE', null, {}, true),
    updateAdminPassword: (data) => apiRequest('/superadmin/update_admin_password', 'POST', data, {}, true),
    getBots: () => apiRequest('/superadmin/bots', 'GET', null, {}, true),
    scanBots: () => apiRequest('/superadmin/scan_bots', 'GET', null, {}, true),
    
    // Sales and Performance Analytics
    getSales: () => apiRequest('/superadmin/sales', 'GET', null, {}, true),
    getPerformance: () => apiRequest('/superadmin/performance', 'GET', null, {}, true),
    getTransactions: () => apiRequest('/superadmin/transactions', 'GET', null, {}, true),
  },

  admin: {
    getDashboard: () => apiRequest('/admin/dashboard', 'GET', null, {}, true),
    createBot: (data) => apiRequest('/admin/create-bot', 'POST', data, {}, true),
    updateBot: (id, data) => apiRequest(`/admin/update-bot/${id}`, 'PUT', data, {}, true),
    deleteBot: (id) => apiRequest(`/admin/delete-bot/${id}`, 'DELETE', null, {}, true),
    getBots: () => apiRequest('/admin/bots', 'GET', null, {}, true),
    getProfile: () => apiRequest('/admin/profile', 'GET', null, {}, true),
    updateBankDetails: (data) => apiRequest('/admin/bank-details', 'PUT', data, {}, true),
    getTransactions: () => apiRequest('/admin/transactions', 'GET', null, {}, true),
    recordTransaction: (data) => apiRequest('/admin/transactions', 'POST', data, {}, true),
    getBotUsers: (id) => apiRequest(`/admin/bots/${id}/users`, 'GET', null, {}, true),
    removeUserFromBot: (bot_id, user_id) => apiRequest(`/admin/bots/${bot_id}/users/${user_id}`, 'DELETE', null, {}, true),
    resetPassword: (id, data) => apiRequest(`/admin/reset_password/${id}`, 'POST', data, {}, true),
  },

  payment: {
    initialize: (data) => apiRequest('/payment/initialize', 'POST', data, {}, true),
    verify: () => apiRequest('/payment/verify', 'GET', null, {}, true),
    callback: (data) => apiRequest('/payment/callback', 'POST', data, {}, true),
    updateTransaction: (data) => apiRequest('/payment/update-transaction', 'POST', data, {}, true),
    webhook: (data) => apiRequest('/payment/webhook', 'POST', data),
  },

  // Deriv Integration API
  deriv: {
    // Public endpoints
    authenticate: (data) => apiRequest('/deriv/auth', 'POST', data),
    getUserInfo: (data) => apiRequest('/deriv/user/info', 'POST', data),
    getBalance: (data) => apiRequest('/deriv/user/balance', 'POST', data),
    getAccountList: (data) => apiRequest('/deriv/accounts/list', 'POST', data),
    switchAccount: (data) => apiRequest('/deriv/accounts/switch', 'POST', data),

    // Protected endpoints
    getAccountDetails: () => apiRequest('/deriv/account/details', 'GET', null, {}, true),
    validateToken: (data) => apiRequest('/deriv/validate', 'POST', data, {}, true),
    saveToken: (data) => apiRequest('/deriv/token/save', 'POST', data, {}, true),
    getToken: () => apiRequest('/deriv/token', 'GET', null, {}, true),
    deleteToken: () => apiRequest('/deriv/token', 'DELETE', null, {}, true),
    updateAccountPreference: (data) => apiRequest('/deriv/account/preference', 'PUT', data, {}, true),
    
    // Stored token endpoints
    getMyInfo: () => apiRequest('/deriv/me/info', 'GET', null, {}, true),
    getMyBalance: () => apiRequest('/deriv/me/balance', 'GET', null, {}, true),
    getMyAccounts: () => apiRequest('/deriv/me/accounts', 'GET', null, {}, true),
  },

  // Bot serving endpoint
  bots: {
    serve: (id) => apiRequest(`/bots/${id}`, 'GET'),
  },
};

// Utility functions
const utils = {
  // Handle API errors consistently
  handleError: (error) => {
    console.error('API Error:', error);
    if (error.message.includes('Authentication') || error.message.includes('401')) {
      TokenManager.remove();
      window.location.href = '/auth';
    }
    return error;
  },

  // Format currency
  formatCurrency: (amount) => {
    return 'KSh ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  // Format percentage
  formatPercentage: (value) => {
    return `${(value * 100).toFixed(2)}%`;
  },

  // Validate email
  isValidEmail: (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  // Show notification (will be overridden by notifications.js)
  notify: (message, type = 'info') => {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // Show browser alert as fallback
    if (type === 'error') {
      alert('Error: ' + message);
    }
  }
};

// Make api and utilities global
window.api = api;
window.TokenManager = TokenManager;
window.utils = utils;

// Remove auto-redirect logic - let auth.js handle it
// if (window.location.pathname !== '/auth' && window.location.pathname !== '/' && !TokenManager.isValid()) {
//   window.location.href = '/auth';
// }

// Usage examples:
// const response = await api.auth.signup({ email: 'user@example.com', password: 'pass' });
// const profile = await api.user.getProfile();
// const derivInfo = await api.deriv.getMyInfo();