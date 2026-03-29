// PWA Manager v2 - Enhanced PWA Installation & App-like Experience
class PWAManager {
  constructor() {
    console.log('[PWA] Initializing PWA Manager...');
    this.deferredPrompt = null;
    this.updateAvailable = false;
    this.isInstalled = false;
    this.isStandalone = false;
    this.init();
  }

  init() {
    console.log('[PWA] Running init...');
    
    // Check standalone mode first
    this.checkStandaloneMode();
    
    // Register service worker
    this.registerServiceWorker();
    
    // Listen for install prompt
    this.listenForInstallPrompt();
    
    // Listen for updates
    this.listenForUpdates();
    
    // Check if already installed
    this.checkInstalledStatus();
    
    // Apply mobile app styles
    this.applyAppStyles();
    
    // Listen for online/offline
    this.setupConnectivityListeners();
  }

  checkStandaloneMode() {
    this.isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                        navigator.standalone === true ||
                        window.matchMedia('(display-mode: fullscreen)').matches;
    
    if (this.isStandalone) {
      document.documentElement.classList.add('pwa-standalone');
    }
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none'
        });
        console.log('[PWA] Service Worker registered:', registration.scope);
        
        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Check every hour
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              this.updateAvailable = true;
              this.showUpdateNotification();
            }
          });
        });
        
        // Handle controller change
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });
        
      } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
      }
    }
  }

  listenForInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent Chrome's default prompt
      e.preventDefault();
      this.deferredPrompt = e;
      console.log('[PWA] Install prompt captured');
      
      // Check if we should show the banner
      if (this.shouldShowInstallPrompt()) {
        this.showInstallBanner();
        this.showInstallButton();
      }
    });

    // Handle app installed
    window.addEventListener('appinstalled', (evt) => {
      console.log('[PWA] App installed successfully');
      this.isInstalled = true;
      this.deferredPrompt = null;
      this.hideInstallBanner();
      this.hideInstallButton();
      
      // Show success message
      this.showToast('🎉 App installed successfully!', 'success');
      
      // Track installation
      this.trackInstall();
    });
  }

  listenForUpdates() {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (this.updateAvailable) {
          // Don't auto-reload, show notification instead
        }
      });
    }
  }

  checkInstalledStatus() {
    // Check various install indicators
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('[PWA] Running in standalone mode');
      document.body.classList.add('pwa-installed');
      this.isInstalled = true;
    }
    
    if (window.matchMedia('(display-mode: fullscreen)').matches) {
      console.log('[PWA] Running in fullscreen mode');
      document.body.classList.add('pwa-fullscreen');
      this.isInstalled = true;
    }
    
    if (window.matchMedia('(display-mode: minimal-ui)').matches) {
      console.log('[PWA] Running in minimal-ui mode');
      document.body.classList.add('pwa-minimal-ui');
      this.isInstalled = true;
    }
    
    // Check for iOS standalone
    if (navigator.standalone === true) {
      console.log('[PWA] iOS standalone mode detected');
      document.body.classList.add('pwa-ios-standalone');
      this.isInstalled = true;
    }
    
    // Check if running as installed PWA
    if (this.isStandalone || this.isInstalled) {
      this.applyStandaloneStyles();
    }
  }

  shouldShowInstallPrompt() {
    // Don't show if already installed
    if (this.isInstalled) return false;
    
    // Check if recently dismissed
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      if (Date.now() - parseInt(dismissed) < threeDays) return false;
    }
    
    return true;
  }

  async installApp() {
    if (!this.deferredPrompt) {
      // beforeinstallprompt hasn't fired yet
      // Show desktop instructions
      this.showManualInstallInstructions();
      return false;
    }

    // Show the install prompt
    this.deferredPrompt.prompt();
    
    // Wait for the user's response
    const { outcome } = await this.deferredPrompt.userChoice;
    console.log('[PWA] Install prompt outcome:', outcome);
    
    // Clear the deferred prompt
    this.deferredPrompt = null;
    
    // Hide the install banner
    this.hideInstallBanner();
    this.hideInstallButton();
    
    if (outcome === 'accepted') {
      return true;
    } else if (outcome === 'dismissed') {
      // User dismissed - remember this
      localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    }
    
    return false;
  }

  showManualInstallInstructions() {
    // Desktop Chrome installation instructions only
    const title = 'Install App (Desktop)';
    const message = 'To install on desktop Chrome:\n\n1. Look for the install icon (⬇️) in the address bar\n2. Click it to install\n\nOr:\n1. Press Ctrl+Shift+I to open DevTools\n2. Go to Application tab\n3. Click "Install" under PWA';
    
    this.showToast(`${title}\n\n${message}`, 'info');
  }

  showInstallBanner() {
    // Remove existing banner if any
    this.hideInstallBanner();
    
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML = `
      <div class="pwa-banner-content">
        <div class="pwa-banner-icon">
          <img src="/icons/icon-192x192.png" alt="Algocdk" onerror="this.src='/icons/icon-192x192.svg'">
        </div>
        <div class="pwa-banner-text">
          <div class="pwa-banner-title">Install Algocdk</div>
          <div class="pwa-banner-subtitle">Get the full trading experience</div>
        </div>
        <div class="pwa-banner-actions">
          <button id="pwa-install-btn" class="pwa-btn pwa-btn-primary">Install</button>
          <button id="pwa-dismiss-btn" class="pwa-btn pwa-btn-secondary">Not now</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(banner);
    
    // Add event listeners
    document.getElementById('pwa-install-btn').addEventListener('click', () => {
      this.installApp();
    });
    
    document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
      this.hideInstallBanner();
      localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    });
    
    // Animate in
    requestAnimationFrame(() => {
      banner.classList.add('visible');
    });
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (document.getElementById('pwa-install-banner')) {
        this.hideInstallBanner();
      }
    }, 10000);
  }

  hideInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), 300);
    }
  }

  showInstallButton() {
    // Don't show if already visible or installed
    if (document.getElementById('pwa-install-btn-fixed') || this.isInstalled) return;
    
    const btn = document.createElement('button');
    btn.id = 'pwa-install-btn-fixed';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
      </svg>
      <span>Install App</span>
    `;
    btn.addEventListener('click', () => this.installApp());
    document.body.appendChild(btn);
  }

  hideInstallButton() {
    const btn = document.getElementById('pwa-install-btn-fixed');
    if (btn) btn.remove();
  }

  showUpdateNotification() {
    // Remove existing notification
    const existing = document.getElementById('pwa-update-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.id = 'pwa-update-notification';
    notification.innerHTML = `
      <div class="pwa-update-content">
        <div class="pwa-update-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 10.12h-6.78l2.74-2.82c-2.73-2.7-7.15-2.8-9.88-.1-2.73 2.71-2.73 7.08 0 9.79s7.15 2.71 9.88 0C18.32 15.65 19 14.08 19 12.1h2c0 1.98-.88 4.55-2.64 6.29-3.51 3.48-9.21 3.48-12.72 0-3.5-3.47-3.53-9.11-.02-12.58s9.14-3.47 12.65 0L21 3v7.12z"/>
          </svg>
        </div>
        <div class="pwa-update-text">
          <div class="pwa-update-title">Update Available</div>
          <div class="pwa-update-subtitle">New version ready to install</div>
        </div>
        <button id="pwa-update-btn" class="pwa-btn pwa-btn-primary">Update</button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    document.getElementById('pwa-update-btn').addEventListener('click', () => {
      this.updateApp();
    });
    
    // Animate in
    requestAnimationFrame(() => {
      notification.classList.add('visible');
    });
    
    // Auto-dismiss after 15 seconds
    setTimeout(() => {
      const notif = document.getElementById('pwa-update-notification');
      if (notif) {
        notif.classList.remove('visible');
        setTimeout(() => notif.remove(), 300);
      }
    }, 15000);
  }

  updateApp() {
    // Post message to service worker to skip waiting
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  }

  applyAppStyles() {
    // Add PWA-specific CSS
    const style = document.createElement('style');
    style.id = 'pwa-styles';
    style.textContent = `
      /* PWA Banner Styles */
      #pwa-install-banner,
      #pwa-update-notification {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 999999;
        transform: translateY(100%);
        transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
      }
      
      #pwa-install-banner.visible,
      #pwa-update-notification.visible {
        transform: translateY(0);
      }
      
      .pwa-banner-content,
      .pwa-update-content {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        background: linear-gradient(180deg, rgba(26, 31, 46, 0.98) 0%, rgba(10, 14, 26, 0.98) 100%);
        border-top: 1px solid rgba(255, 69, 0, 0.3);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }
      
      .pwa-banner-icon {
        flex-shrink: 0;
      }
      
      .pwa-banner-icon img {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(255, 69, 0, 0.3);
      }
      
      .pwa-banner-text,
      .pwa-update-text {
        flex: 1;
        min-width: 0;
      }
      
      .pwa-banner-title,
      .pwa-update-title {
        color: #fff;
        font-weight: 600;
        font-size: 15px;
        line-height: 1.3;
      }
      
      .pwa-banner-subtitle,
      .pwa-update-subtitle {
        color: #9ca3af;
        font-size: 13px;
        margin-top: 2px;
      }
      
      .pwa-banner-actions {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
      }
      
      .pwa-update-icon {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 69, 0, 0.15);
        border-radius: 10px;
      }
      
      .pwa-update-icon svg {
        width: 20px;
        height: 20px;
        color: #FF4500;
      }
      
      /* Button Styles */
      .pwa-btn {
        padding: 10px 18px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: transform 0.15s, background 0.15s, box-shadow 0.15s;
        white-space: nowrap;
      }
      
      .pwa-btn:active {
        transform: scale(0.95);
      }
      
      .pwa-btn-primary {
        background: linear-gradient(135deg, #FF4500 0%, #ff5722 100%);
        color: white;
        box-shadow: 0 4px 12px rgba(255, 69, 0, 0.35);
      }
      
      .pwa-btn-primary:hover {
        background: linear-gradient(135deg, #ff5722 0%, #FF4500 100%);
      }
      
      .pwa-btn-secondary {
        background: rgba(255, 255, 255, 0.08);
        color: #9ca3af;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      .pwa-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      
      /* Fixed Install Button */
      #pwa-install-btn-fixed {
        position: fixed;
        bottom: 20px;
        right: 20px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 14px 20px;
        background: linear-gradient(135deg, #FF4500 0%, #ff5722 100%);
        color: white;
        border: none;
        border-radius: 14px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        z-index: 9999;
        box-shadow: 0 8px 24px rgba(255, 69, 0, 0.4);
        transition: transform 0.2s, box-shadow 0.2s;
      }
      
      #pwa-install-btn-fixed:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 32px rgba(255, 69, 0, 0.5);
      }
      
      #pwa-install-btn-fixed:active {
        transform: translateY(0);
      }
      
      #pwa-install-btn-fixed svg {
        width: 20px;
        height: 20px;
      }
      
      /* PWA Standalone Mode Styles */
      .pwa-standalone nav,
      .pwa-fullscreen nav {
        padding-top: env(safe-area-inset-top) !important;
      }
      
      .pwa-standalone body,
      .pwa-fullscreen body {
        padding-top: env(safe-area-inset-top) !important;
        padding-bottom: env(safe-area-inset-bottom) !important;
        overscroll-behavior-y: contain;
      }
      
      /* iOS specific styles */
      .pwa-ios-standalone body {
        -webkit-overflow-scrolling: touch;
      }
      
      /* Prevent pull-to-refresh on mobile */
      .pwa-standalone {
        overscroll-behavior-y: none;
      }
      
      /* Mobile app-like touch behaviors */
      .pwa-standalone * {
        -webkit-tap-highlight-color: rgba(255, 69, 0, 0.1);
      }
      
      /* Safe area padding for notch devices */
      .pwa-installed nav {
        padding-top: max(env(safe-area-inset-top), 8px) !important;
      }
      
      /* Toast notification styles */
      .pwa-toast {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(-100px);
        background: #10B981;
        color: white;
        padding: 14px 24px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 500;
        z-index: 100000;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        opacity: 0;
        transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s;
        text-align: center;
        max-width: calc(100% - 40px);
        white-space: pre-line;
      }
      
      .pwa-toast.visible {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }
      
      .pwa-toast.error {
        background: #EF4444;
      }
      
      .pwa-toast.info {
        background: #3B82F6;
      }
      
      /* Responsive adjustments for install banner */
      @media (min-width: 480px) {
        #pwa-install-banner {
          left: 50%;
          transform: translateX(-50%) translateY(100%);
          max-width: 480px;
          border-radius: 16px 16px 0 0;
        }
        
        #pwa-install-banner.visible {
          transform: translateX(-50%) translateY(0);
        }
      }
    `;
    
    document.head.appendChild(style);
    
    // Inject keyframe animations
    const animStyle = document.createElement('style');
    animStyle.textContent = `
      @keyframes slideUp {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(0.95); opacity: 0.8; }
      }
    `;
    document.head.appendChild(animStyle);
  }

  applyStandaloneStyles() {
    document.body.classList.add('pwa-installed');
    
    // Add safe area padding to navigation
    const nav = document.querySelector('nav');
    if (nav) {
      nav.style.setProperty('--safe-area-top', 'env(safe-area-inset-top, 0px)');
    }
  }

  setupConnectivityListeners() {
    window.addEventListener('online', () => {
      this.showToast('🌐 Back online!', 'success');
    });
    
    window.addEventListener('offline', () => {
      this.showToast('📡 You\'re offline. Changes will sync when connected.', 'info');
    });
  }

  showToast(message, type = 'success') {
    // Remove existing toast
    const existing = document.querySelector('.pwa-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `pwa-toast ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });
    
    // Animate out after 4 seconds
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  trackInstall() {
    // Track installation for analytics
    try {
      localStorage.setItem('pwa-installed', Date.now().toString());
      console.log('[PWA] Installation tracked');
    } catch (e) {
      console.error('[PWA] Failed to track install:', e);
    }
  }

  // Public method to show install prompt (can be called from UI)
  promptInstall() {
    if (this.deferredPrompt) {
      this.installApp();
    } else {
      this.showManualInstallInstructions();
    }
  }
}

// Initialize PWA Manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize once
  if (window.pwaManager) return;
  
  window.pwaManager = new PWAManager();
  
  // Also expose globally for easy access
  window.showPWAPrompt = () => window.pwaManager?.promptInstall();
});

// Also initialize on load for safety
window.addEventListener('load', () => {
  if (!window.pwaManager) {
    window.pwaManager = new PWAManager();
  }
});

// Export for external use
window.PWAManager = PWAManager;
