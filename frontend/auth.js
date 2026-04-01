// auth.js - Authentication functionality
class AuthHandler {
  constructor() {
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.checkAuthStatus();
  }

  setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', this.handleLogin.bind(this));
    }

    // Signup form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
      signupForm.addEventListener('submit', this.handleSignup.bind(this));
    }

    // Forgot password form
    const forgotForm = document.getElementById('forgot-password-form');
    if (forgotForm) {
      forgotForm.addEventListener('submit', this.handleForgotPassword.bind(this));
    }

    // Form toggles — all buttons with data-toggle-form
    document.querySelectorAll('[data-toggle-form]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.showForm(e.currentTarget.dataset.toggleForm);
      });
    });

    // Password visibility toggles
    const passwordToggles = document.querySelectorAll('[data-toggle-password]');
    passwordToggles.forEach(toggle => {
      toggle.addEventListener('click', this.togglePasswordVisibility.bind(this));
    });
  }

  checkAuthStatus() {
    if (TokenManager.isValid()) {
      // Redirect to dashboard if already authenticated
      const currentPath = window.location.pathname;
      if (currentPath === '/auth' || currentPath === '/') {
        window.location.href = '/app';
      }
    }
  }

  async handleLogin(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = {
      email: formData.get('email'),
      password: formData.get('password')
    };

    if (!this.validateLoginData(data)) return;

    this.setLoading(event.target, true);

    try {
      console.log('=== LOGIN ATTEMPT ===');
      console.log('Email:', data.email);
      
      // Try different login endpoints based on role
      let response;
      let loginSuccess = false;
      let loginMethod = '';
      
      // Try regular user login first (this includes admins)
      try {
        console.log('Trying regular user login endpoint...');
        response = await api.auth.login(data);
        loginSuccess = true;
        loginMethod = 'user';
        console.log('✅ User login successful');
      } catch (userError) {
        console.log('❌ User login failed:', userError.message);
        // If user login fails, try superadmin
        try {
          console.log('Trying superadmin login endpoint...');
          response = await api.superadmin.auth.login(data);
          loginSuccess = true;
          loginMethod = 'superadmin';
          console.log('✅ Superadmin login successful');
        } catch (superadminError) {
          console.log('❌ Superadmin login failed:', superadminError.message);
          // If all fail, show error
          throw new Error('Invalid email or password');
        }
      }
      
      if (loginSuccess && response.token) {
        console.log('Login method used:', loginMethod);
        console.log('Login response received:', response);
        
        TokenManager.set(response.token);
        if (response.refresh_token) {
          TokenManager.setRefreshToken(response.refresh_token);
        }

        // set cookie so server-side page guards can read the role
        document.cookie = 'auth_token=' + response.token + '; path=/; max-age=' + (86400 * 7) + '; SameSite=Lax';

        utils.notify('Login successful!', 'success');
        
        // Redirect based on user role
        const redirectUrl = this.getRedirectUrl(response);
        console.log('Final redirect URL:', redirectUrl);
        
        setTimeout(() => {
          console.log('Redirecting to:', redirectUrl);
          window.location.href = redirectUrl;
        }, 1000);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Login error:', error);
      
      // Handle email not verified error
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        utils.notify('Please verify your email address before logging in.', 'warning');
        setTimeout(() => {
          window.location.href = `/verify-email?email=${encodeURIComponent(error.email)}`;
        }, 2000);
        return;
      }
      
      utils.notify(error.message || 'Login failed', 'error');
      this.setLoading(event.target, false);
    }
  }

  async handleSignup(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword')
    };

    if (!this.validateSignupData(data)) return;

    this.setLoading(event.target, true);

    try {
      await api.auth.signup({
        name: data.name,
        email: data.email,
        password: data.password
      });

      // Store email and redirect
      localStorage.setItem('pendingVerificationEmail', data.email);
      window.location = '/verify-email?email=' + encodeURIComponent(data.email);
    } catch (error) {
      // unverified account — verification resent, redirect to verify page
      if (error.resent) {
        localStorage.setItem('pendingVerificationEmail', data.email);
        utils.notify(error.message, 'warning');
        setTimeout(() => { window.location = '/verify-email?email=' + encodeURIComponent(data.email); }, 1500);
        return;
      }
      utils.notify(error.message || 'Signup failed', 'error');
      this.setLoading(event.target, false);
    }
  }

  async handleForgotPassword(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const email = formData.get('email');

    if (!utils.isValidEmail(email)) {
      utils.notify('Please enter a valid email address', 'error');
      return;
    }

    this.setLoading(event.target, true);

    try {
      await api.auth.forgotPassword({ email });
      utils.notify('Reset link sent! Check your email inbox.', 'success');
      // Show success state in the form
      event.target.innerHTML = `
        <div class="text-center py-4">
          <div class="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
            <i class="fas fa-check text-white text-xl"></i>
          </div>
          <p class="text-white font-semibold">Reset link sent!</p>
          <p class="text-gray-400 text-sm mt-1">Check your inbox at <strong class="text-white">${email}</strong></p>
          <button type="button" onclick="window.authHandler.showForm('login')"
            class="mt-4 w-full py-3 px-4 bg-dark-800 text-gray-300 rounded-lg font-semibold border border-gray-700 hover:bg-gray-700 hover:text-white transition-all duration-300">
            ← Back to Login
          </button>
        </div>
      `;
    } catch (error) {
      utils.notify(error.message || 'Failed to send reset email', 'error');
      this.setLoading(event.target, false);
    }
  }

  validateLoginData(data) {
    if (!utils.isValidEmail(data.email)) {
      utils.notify('Please enter a valid email address', 'error');
      return false;
    }

    if (!data.password || data.password.length < 6) {
      utils.notify('Password must be at least 6 characters', 'error');
      return false;
    }

    return true;
  }

  validateSignupData(data) {
    if (!data.name || data.name.trim().length < 2) {
      utils.notify('Name must be at least 2 characters', 'error');
      return false;
    }

    if (!utils.isValidEmail(data.email)) {
      utils.notify('Please enter a valid email address', 'error');
      return false;
    }

    if (!data.password || data.password.length < 6) {
      utils.notify('Password must be at least 6 characters', 'error');
      return false;
    }

    if (data.password !== data.confirmPassword) {
      utils.notify('Passwords do not match', 'error');
      return false;
    }

    return true;
  }

  getRedirectUrl(response) {
    console.log('=== LOGIN REDIRECT DEBUG ===');
    console.log('Full login response:', JSON.stringify(response, null, 2));
    
    const role = response.role || response.user?.role;
    console.log('Extracted role:', role, '(type:', typeof role, ')');
    
    // Store user role and ID for future reference
    if (role) {
      localStorage.setItem('userRole', role);
      console.log('Stored role in localStorage:', role);
    }
    
    if (response.user?.id) {
      localStorage.setItem('userId', response.user.id);
      console.log('Stored userId in localStorage:', response.user.id);
    }
    
    // Check role and redirect accordingly
    if (role === 'superadmin') {
      if (response.user?.id) {
        localStorage.setItem('superadminId', response.user.id);
      }
      console.log('✅ SUPERADMIN DETECTED - Redirecting to /superadmin');
      return '/superadmin';
    } else if (role === 'Admin' || role === 'admin' || role === 'ADMIN') {
      if (response.user?.id) {
        localStorage.setItem('adminId', response.user.id);
      }
      console.log('✅ ADMIN DETECTED - Redirecting to /admin');
      return '/admin';
    } else {
      console.log('❌ NO ADMIN ROLE DETECTED - Redirecting to /app for role:', role);
      return '/app';
    }
  }

  toggleForm(event) {
    const targetForm = event.target.dataset.toggleForm;
    this.showForm(targetForm);
  }

  showForm(formType) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const forgotForm = document.getElementById('forgot-password-form');
    const tabs = document.querySelector('.flex.mb-6');

    // Hide all forms
    [loginForm, signupForm, forgotForm].forEach(f => f && f.classList.add('hidden'));

    // Show/hide tabs — hide them on forgot view
    if (tabs) tabs.style.display = formType === 'forgot' ? 'none' : '';

    // Show target form
    const target = document.getElementById(
      formType === 'forgot' ? 'forgot-password-form' : `${formType}-form`
    );
    if (target) target.classList.remove('hidden');

    // Update tab active state
    document.querySelectorAll('[data-toggle-form="login"], [data-toggle-form="signup"]').forEach(btn => {
      const isActive = btn.dataset.toggleForm === formType;
      btn.classList.toggle('bg-primary-500', isActive);
      btn.classList.toggle('text-white', isActive);
      btn.classList.toggle('text-gray-400', !isActive);
    });

    // Update URL
    if (formType !== 'forgot') {
      window.history.replaceState({}, '', `${window.location.pathname}?form=${formType}`);
    }
  }

  togglePasswordVisibility(event) {
    const targetId = event.target.dataset.togglePassword;
    const passwordInput = document.getElementById(targetId);
    const icon = event.target;

    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    } else {
      passwordInput.type = 'password';
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    }
  }

  setLoading(form, isLoading) {
    const submitBtn = form.querySelector('button[type="submit"]');
    const spinner = form.querySelector('.loading-spinner');
    
    if (isLoading) {
      submitBtn.disabled = true;
      submitBtn.classList.add('opacity-50');
      if (spinner) spinner.classList.remove('hidden');
    } else {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-50');
      if (spinner) spinner.classList.add('hidden');
    }
  }

  // Initialize form based on URL parameter
  initializeFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const formType = urlParams.get('form') || 'login';
    this.showForm(formType);
  }
}

// Social login handlers (placeholder implementations)
class SocialAuth {
  static async loginWithGoogle() {
    utils.notify('Google login not implemented yet', 'info');
    // Implementation would depend on Google OAuth setup
  }

  static async loginWithGitHub() {
    utils.notify('GitHub login not implemented yet', 'info');
    // Implementation would depend on GitHub OAuth setup
  }

  static async loginWithTwitter() {
    utils.notify('Twitter login not implemented yet', 'info');
    // Implementation would depend on Twitter OAuth setup
  }
}

// Initialize auth handler when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.authHandler = new AuthHandler();
  window.authHandler.initializeFromUrl();
});

// Export for use in other scripts
window.AuthHandler = AuthHandler;
window.SocialAuth = SocialAuth;