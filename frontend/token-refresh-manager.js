// token-refresh-manager.js - Automatic token refresh in background
(function() {
  'use strict';

  // Check and refresh token every 5 minutes
  const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
  let refreshInterval = null;

  async function checkAndRefreshToken() {
    // Skip if no token or refresh token
    if (!TokenManager.get() || !TokenManager.getRefreshToken()) {
      return;
    }

    // Check if token is expiring soon (less than 1 hour)
    if (TokenManager.isExpiringSoon()) {
      console.log('[TokenRefresh] Token expiring soon, refreshing...');
      const refreshed = await TokenManager.refreshIfNeeded();
      if (refreshed) {
        console.log('[TokenRefresh] Token refreshed successfully');
      } else {
        console.log('[TokenRefresh] Token refresh failed');
      }
    }
  }

  // Start automatic token refresh
  function startTokenRefresh() {
    if (refreshInterval) return; // Already running

    console.log('[TokenRefresh] Starting automatic token refresh');
    
    // Check immediately
    checkAndRefreshToken();
    
    // Then check every 5 minutes
    refreshInterval = setInterval(checkAndRefreshToken, CHECK_INTERVAL);
  }

  // Stop automatic token refresh
  function stopTokenRefresh() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
      console.log('[TokenRefresh] Stopped automatic token refresh');
    }
  }

  // Start on page load if user is authenticated
  if (typeof TokenManager !== 'undefined' && TokenManager.get()) {
    startTokenRefresh();
  }

  // Listen for storage events (token changes in other tabs)
  window.addEventListener('storage', (e) => {
    if (e.key === 'token') {
      if (e.newValue) {
        startTokenRefresh();
      } else {
        stopTokenRefresh();
      }
    }
  });

  // Expose functions globally
  window.TokenRefreshManager = {
    start: startTokenRefresh,
    stop: stopTokenRefresh,
    checkNow: checkAndRefreshToken
  };

  console.log('[TokenRefresh] Token refresh manager loaded');
})();
