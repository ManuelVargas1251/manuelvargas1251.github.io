(function () {
  'use strict';

  function initNav() {
    const navToggle = document.querySelector('.nav-toggle');
    const siteNav = document.querySelector('.site-nav');

    if (!navToggle || !siteNav) return;

    function openNav() {
      navToggle.setAttribute('aria-expanded', 'true');
      siteNav.classList.add('is-open');
    }

    function closeNav() {
      navToggle.setAttribute('aria-expanded', 'false');
      siteNav.classList.remove('is-open');
    }

    function toggleNav() {
      const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
      if (isExpanded) {
        closeNav();
      } else {
        openNav();
      }
    }

    // Toggle button click
    navToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleNav();
    });

    // Close when clicking outside of header / site-nav
    document.addEventListener('click', function (e) {
      if (!siteNav.contains(e.target) && !navToggle.contains(e.target)) {
        if (siteNav.classList.contains('is-open')) {
          closeNav();
        }
      }
    });

    // Close when Escape key is pressed
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (siteNav.classList.contains('is-open')) {
          closeNav();
          navToggle.focus();
        }
      }
    });

    // Close mobile menu when any navigation link is clicked
    const links = siteNav.querySelectorAll('a');
    links.forEach(function (link) {
      link.addEventListener('click', function () {
        if (window.innerWidth <= 768) {
          closeNav();
        }
      });
    });

    // Reset state on window resize past mobile breakpoint
    window.addEventListener('resize', function () {
      if (window.innerWidth > 768 && siteNav.classList.contains('is-open')) {
        closeNav();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();
