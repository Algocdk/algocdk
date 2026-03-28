// PWA Manager - Handles PWA installation and updates
class PWAManager {
  constructor() {
    this.deferredPrompt = null;
    this.updateAvailable = false;
    this.init();
  }

  init() {
    // Register service worker
    this.registerServiceWorker();
    
    // Listen for install prompt
    this.listenForInstallPrompt();
    
    // Listen for updates
    this.listenForUpdates();
    
    // Check if already installed
    this.checkInstalledStatus();
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('[PWA] Service Worker registered:', registration.scope);
        
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
      
      // Show custom install button/banner
      this.showInstallBanner();
    });

    // Handle app installed
    window.addEventListener('appinstalled', (evt) => {
      console.log('[PWA] App installed successfully');
      this.hideInstallBanner();
      this.deferredPrompt = null;
      
      // Show success message
      this.showToast('App installed successfully!', 'success');
    });
  }

  listenForUpdates() {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (this.updateAvailable) {
          window.location.reload();
        }
      });
    }
  }

  checkInstalledStatus() {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('[PWA] Running in standalone mode');
      document.body.classList.add('pwa-installed');
    }
    
    if (navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
      console.log('[PWA] App is installed on device');
    }
  }

  async installApp() {
    if (!this.deferredPrompt) {
      console.log('[PWA] No install prompt available');
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
    
    return outcome === 'accepted';
  }

  showInstallBanner() {
    // Remove existing banner if any
    this.hideInstallBanner();
    
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML = `
      <div style="
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #0A0E1A 0%, #1a1f2e 100%);
        border-top: 1px solid #FF4500;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        z-index: 9999;
        box-shadow: 0 -4px 20px rgba(255, 69, 0, 0.2);
      ">
        <div style="display: flex; align-items: center; gap: 12px;">
          <img src="/icons/icon-192x192.svg" alt="Algocdk" style="width: 48px; height: 48px; border-radius: 10px;">
          <div>
            <div style="color: #fff; font-weight: 600; font-size: 15px;">Install Algocdk App</div>
            <div style="color: #9ca3af; font-size: 13px;">Get the full trading experience</div>
          </div>
        </div>
        <div style="display: flex; gap: 10px;">
          <button id="pwa-install-btn" style="
            background: #FF4500;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s;
          ">Install</button>
          <button id="pwa-dismiss-btn" style="
            background: transparent;
            color: #9ca3af;
            border: 1px solid #374151;
            padding: 10px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
          ">Later</button>
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
      // Store dismissed state in localStorage
      localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    });
    
    // Animate in
    requestAnimationFrame(() => {
      banner.style.transform = 'translateY(0)';
    });
  }

  hideInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
      banner.style.transform = 'translateY(100%)';
      setTimeout(() => banner.remove(), 300);
    }
  }

  showUpdateNotification() {
    const notification = document.createElement('div');
    notification.id = 'pwa-update-notification';
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 80px;
        right: 20px;
        background: #0A0E1A;
        border: 1px solid #FF4500;
        border-radius: 12px;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 9999;
        box-shadow: 0 4px 20px rgba(255, 69, 0, 0.3);
        max-width: 320px;
      ">
        <i class="fas fa-sync-alt" style="color: #FF4500; font-size: 20px;"></i>
        <div style="flex: 1;">
          <div style="color: #fff; font-weight: 600; font-size: 14px;">Update Available</div>
          <div style="color: #9ca3af; font-size: 12px; margin-top: 4px;">New version ready</div>
        </div>
        <button id="pwa-update-btn" style="
          background: #FF4500;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        ">Update</button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    document.getElementById('pwa-update-btn').addEventListener('click', () => {
      this.updateApp();
    });
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      const notif = document.getElementById('pwa-update-notification');
      if (notif) notif.remove();
    }, 10000);
  }

  updateApp() {
    window.location.reload();
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#3B82F6';
    
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${bgColor};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideDown 0.3s ease-out;
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

// Check if install was dismissed recently (within 7 days)
function shouldShowInstallBanner() {
  const dismissed = localStorage.getItem('pwa-install-dismissed');
  if (!dismissed) return true;
  
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - parseInt(dismissed) > sevenDays;
}

// Initialize PWA Manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    #pwa-install-banner {
      transition: transform 0.3s ease-out;
    }
  `;
  document.head.appendChild(style);
  
  // Only show banner if not installed and not recently dismissed
  if (shouldShowInstallBanner()) {
    window.pwaManager = new PWAManager();
  }
});

// Export for external use
window.PWAManager = PWAManager;
