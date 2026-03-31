/**
 * Algocdk — Premium 3D & Animation Effects
 * Lightweight, high-performance, Apple-quality
 */
(function () {
  'use strict';

  /* ── 1. Particle background in hero ── */
  function initParticles() {
    const hero = document.querySelector('section.mt-\\[60px\\]');
    if (!hero) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'particleCanvas';
    hero.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let W, H, particles = [], raf;

    function resize() {
      W = canvas.width = hero.offsetWidth;
      H = canvas.height = hero.offsetHeight;
    }

    function Particle() {
      this.reset();
    }
    Particle.prototype.reset = function () {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.r = Math.random() * 1.2 + 0.3;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = -Math.random() * 0.4 - 0.1;
      this.alpha = Math.random() * 0.5 + 0.1;
      const hue = Math.random() > 0.5 ? 220 : 260; // blue or purple
      this.color = `hsla(${hue}, 80%, 70%, ${this.alpha})`;
    };
    Particle.prototype.update = function () {
      this.x += this.vx;
      this.y += this.vy;
      if (this.y < -4 || this.x < -4 || this.x > W + 4) this.reset();
    };

    function init() {
      particles = [];
      const count = Math.min(Math.floor((W * H) / 14000), 80);
      for (let i = 0; i < count; i++) particles.push(new Particle());
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.update();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    }

    resize();
    init();
    draw();
    window.addEventListener('resize', () => { resize(); init(); });
  }

  /* ── 2. Soft gradient wave background ── */
  function initGradientWave() {
    const canvas = document.createElement('canvas');
    canvas.id = 'premiumBgCanvas';
    document.body.prepend(canvas);

    const ctx = canvas.getContext('2d');
    let W, H, t = 0;

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      // Slow-moving radial glow 1 — blue
      const x1 = W * 0.2 + Math.sin(t * 0.4) * W * 0.08;
      const y1 = H * 0.3 + Math.cos(t * 0.3) * H * 0.06;
      const g1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, W * 0.45);
      g1.addColorStop(0, 'rgba(59,130,246,0.07)');
      g1.addColorStop(1, 'transparent');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, W, H);

      // Glow 2 — purple
      const x2 = W * 0.75 + Math.cos(t * 0.35) * W * 0.07;
      const y2 = H * 0.6 + Math.sin(t * 0.45) * H * 0.05;
      const g2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, W * 0.4);
      g2.addColorStop(0, 'rgba(139,92,246,0.06)');
      g2.addColorStop(1, 'transparent');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, W, H);

      t += 0.008;
      requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener('resize', resize);
  }

  /* ── 3. 3D tilt on hero chart card ── */
  function initTiltCards() {
    const cards = document.querySelectorAll(
      '.animate-fadeInRight > div, .bg-dark-200.border.border-dark-400.rounded-xl.p-8, .stat-card'
    );

    cards.forEach(card => {
      card.addEventListener('mousemove', e => {
        const rect = card.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / (rect.width / 2);
        const dy = (e.clientY - cy) / (rect.height / 2);
        const maxTilt = 6;
        card.style.transform = `perspective(800px) rotateY(${dx * maxTilt}deg) rotateX(${-dy * maxTilt}deg) translateZ(4px)`;
        card.style.transition = 'transform 0.1s ease';
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(800px) rotateY(0deg) rotateX(0deg) translateZ(0)';
        card.style.transition = 'transform 0.5s cubic-bezier(0.23,1,0.32,1)';
      });
    });
  }

  /* ── 4. Hero parallax on mouse move ── */
  function initHeroParallax() {
    const hero = document.querySelector('section.mt-\\[60px\\]');
    if (!hero) return;
    const content = hero.querySelector('.max-w-7xl');
    const bgSlides = hero.querySelectorAll('.hero-bg-slide');

    hero.addEventListener('mousemove', e => {
      const rect = hero.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width - 0.5;
      const my = (e.clientY - rect.top) / rect.height - 0.5;

      if (content) {
        content.style.transform = `translate(${mx * 6}px, ${my * 4}px)`;
        content.style.transition = 'transform 0.4s ease';
      }
      bgSlides.forEach(slide => {
        slide.style.transform = `translate(${mx * -12}px, ${my * -8}px) scale(1.04)`;
        slide.style.transition = 'transform 0.6s ease';
      });
    });

    hero.addEventListener('mouseleave', () => {
      if (content) {
        content.style.transform = 'translate(0,0)';
        content.style.transition = 'transform 0.8s cubic-bezier(0.23,1,0.32,1)';
      }
      bgSlides.forEach(slide => {
        slide.style.transform = 'translate(0,0) scale(1)';
        slide.style.transition = 'transform 0.8s cubic-bezier(0.23,1,0.32,1)';
      });
    });
  }

  /* ── 5. Scroll-reveal with IntersectionObserver ── */
  function initScrollReveal() {
    // Tag elements for reveal
    const selectors = [
      'section.py-20.px-6 .text-center',
      'section.py-28.px-6 .text-center',
      '.bg-dark-200.border.border-dark-400.rounded-xl.p-8',
      '.stat-card',
      '.bg-dark-200.border.border-dark-400.rounded-xl.p-5',
      '.border.border-gray-200.rounded-2xl',
      '#synthTrack > div',
      '.bot-slide.active',
      '.max-w-4xl.mx-auto.text-center',
      'footer .footer-section',
    ];

    selectors.forEach((sel, si) => {
      document.querySelectorAll(sel).forEach((el, i) => {
        if (!el.classList.contains('reveal')) {
          el.classList.add('reveal', `reveal-delay-${(i % 6) + 1}`);
        }
      });
    });

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }

  /* ── 6. Glow orbs in key sections ── */
  function addGlowOrbs() {
    const sections = [
      { selector: 'section.py-28.px-6.bg-dark-100#features', color: '#3b82f6', size: 400, top: '10%', left: '-5%' },
      { selector: 'section.py-28.px-6.bg-dark-100#features', color: '#8b5cf6', size: 300, top: '60%', right: '-5%' },
      { selector: '.py-28.px-6.bg-gradient-radial', color: '#06b6d4', size: 350, top: '20%', left: '5%' },
    ];

    sections.forEach(cfg => {
      const section = document.querySelector(cfg.selector);
      if (!section) return;
      if (getComputedStyle(section).position === 'static') {
        section.style.position = 'relative';
      }
      const orb = document.createElement('div');
      orb.className = 'glow-orb';
      orb.style.cssText = `
        width:${cfg.size}px; height:${cfg.size}px;
        background:${cfg.color};
        top:${cfg.top || 'auto'}; left:${cfg.left || 'auto'};
        right:${cfg.right || 'auto'}; bottom:${cfg.bottom || 'auto'};
        animation-delay: ${Math.random() * 4}s;
      `;
      section.appendChild(orb);
    });
  }

  /* ── 7. Apply premium-heading class to section titles ── */
  function upgradeHeadings() {
    document.querySelectorAll(
      'section h2.text-4xl, section h2.text-5xl, section h2.text-3xl'
    ).forEach(h => {
      if (!h.querySelector('span')) { // don't override gradient spans
        h.classList.add('premium-heading');
      }
    });
  }

  /* ── 8. Smooth nav active link on scroll ── */
  function initNavHighlight() {
    const links = document.querySelectorAll('nav ul a[href^="#"]');
    const sections = [...links].map(l => document.querySelector(l.getAttribute('href'))).filter(Boolean);

    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          links.forEach(l => l.classList.remove('text-white'));
          const active = [...links].find(l => l.getAttribute('href') === '#' + entry.target.id);
          if (active) active.classList.add('text-white');
        }
      });
    }, { threshold: 0.4 });

    sections.forEach(s => obs.observe(s));
  }

  /* ── Boot ── */
  function boot() {
    initGradientWave();
    initParticles();
    initHeroParallax();
    initTiltCards();
    initScrollReveal();
    addGlowOrbs();
    upgradeHeadings();
    initNavHighlight();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
