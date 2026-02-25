// offline-detector.js - Detects when user goes offline and shows notification
(function() {
  'use strict';

  // Create offline overlay
  const offlineOverlay = document.createElement('div');
  offlineOverlay.id = 'offline-overlay';
  offlineOverlay.innerHTML = `
    <div class="offline-content">
      <div class="offline-icon">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
          <line x1="12" y1="20" x2="12.01" y2="20"></line>
        </svg>
      </div>
      <h2 class="offline-title">You're Offline</h2>
      <p class="offline-message">Please check your internet connection</p>
      <div class="offline-status">
        <span class="status-dot"></span>
        <span>Attempting to reconnect...</span>
      </div>
    </div>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    #offline-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(14, 17, 23, 0.98);
      backdrop-filter: blur(10px);
      z-index: 999999;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease;
    }

    #offline-overlay.show {
      display: flex;
    }

    .offline-content {
      text-align: center;
      color: #d1d4dc;
      max-width: 400px;
      padding: 40px;
      animation: slideUp 0.4s ease;
    }

    .offline-icon {
      color: #ff4d4f;
      margin-bottom: 24px;
      animation: pulse 2s infinite;
    }

    .offline-icon svg {
      filter: drop-shadow(0 0 20px rgba(255, 77, 79, 0.3));
    }

    .offline-title {
      font-size: 32px;
      font-weight: bold;
      margin-bottom: 12px;
      color: #ffffff;
    }

    .offline-message {
      font-size: 16px;
      color: #8b949e;
      margin-bottom: 32px;
    }

    .offline-status {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 14px;
      color: #8b949e;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      background: #ffa500;
      border-radius: 50%;
      animation: blink 1.5s infinite;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { 
        opacity: 0;
        transform: translateY(20px);
      }
      to { 
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  `;

  // Add to document
  document.head.appendChild(style);
  document.body.appendChild(offlineOverlay);

  // Show offline overlay
  function showOffline() {
    offlineOverlay.classList.add('show');
    console.log('[Offline] Connection lost');
  }

  // Hide offline overlay
  function hideOffline() {
    offlineOverlay.classList.remove('show');
    console.log('[Offline] Connection restored');
  }

  // Check online status
  function updateOnlineStatus() {
    if (navigator.onLine) {
      hideOffline();
    } else {
      showOffline();
    }
  }

  // Listen for online/offline events
  window.addEventListener('online', () => {
    console.log('[Offline] Online event detected');
    // Wait a moment to ensure connection is stable
    setTimeout(updateOnlineStatus, 500);
  });
  
  window.addEventListener('offline', () => {
    console.log('[Offline] Offline event detected');
    updateOnlineStatus();
  });

  // Check initial status
  updateOnlineStatus();

  // Periodic connectivity check (every 5 seconds)
  setInterval(async () => {
    if (!navigator.onLine) {
      showOffline();
      return;
    }

    try {
      // Try to fetch a small resource to verify actual connectivity
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch('/api.js', { 
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        hideOffline();
      } else {
        showOffline();
      }
    } catch (error) {
      // Only show offline if we're actually offline, not just a timeout
      if (!navigator.onLine) {
        showOffline();
      }
    }
  }, 3000); // Check every 3 seconds

  console.log('[Offline] Offline detector initialized');
})();
