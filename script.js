document.addEventListener('click', (event) => {
  const mailLink = event.target.closest('a[href^="mailto:"]');

  if (!mailLink) {
    return;
  }

  const href = mailLink.getAttribute('href');

  if (!href) {
    return;
  }

  event.preventDefault();
  window.location.href = href;
});

document.addEventListener('DOMContentLoaded', () => {
  const yearElement = document.querySelector('[data-year]');

  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }

  const videoContainer = document.querySelector('.floating-video-card');
  const video = document.querySelector('.floating-video-card video');
  const toggleButton = document.querySelector('.video-toggle-btn');
  const replayButton = document.querySelector('.video-replay-btn');

  if (video) {
    video.loop = false;

    const tryPlay = () => {
      const playPromise = video.play();

      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch(() => {
          console.warn('Autoplay nije dopušten od strane preglednika.');
        });
      }
    };

    video.addEventListener('error', () => {
      const fallback = document.querySelector('.video-fallback');
      if (fallback) {
        fallback.textContent = 'Video se trenutno ne može reproducirati u ovom pregledniku. Provjerite datoteku ili otvorite je u drugom pregledniku.';
      }
    });

    video.addEventListener('loadeddata', tryPlay, { once: true });
    window.addEventListener('focus', tryPlay, { once: true });
    document.addEventListener('pointerdown', tryPlay, { once: true });
    setTimeout(tryPlay, 800);
  }

  if (toggleButton && videoContainer) {
      const toggleVideo = () => {
        const isCollapsed = videoContainer.classList.toggle('collapsed');
        toggleButton.setAttribute('aria-label', isCollapsed ? 'Povećaj video' : 'Minimiziraj video');
      };

      const containerToggle = (event) => {
        if (
          videoContainer.classList.contains('collapsed') &&
          !event.target.closest('video') &&
          !event.target.closest('.video-toggle-btn')
        ) {
          event.preventDefault();
          toggleVideo();
        }
      };

      const stopPropagation = (event) => {
        event.stopPropagation();
      };

      ['pointerdown', 'touchstart', 'pointerup', 'touchend'].forEach((eventName) => {
        toggleButton.addEventListener(eventName, stopPropagation);
      });

      toggleButton.addEventListener('click', (event) => {
        stopPropagation(event);
        toggleVideo();
      });

      videoContainer.addEventListener('click', containerToggle);
    }
  if (replayButton && video) {
    replayButton.addEventListener('click', () => {
      video.currentTime = 0;
      video.play();
    });
  }

  const langButtons = document.querySelectorAll('.lang-btn');
  const languageBlocks = document.querySelectorAll('.lang-block');
  const navTranslations = {
    en: {
      'nav.home': 'Home',
      'nav.about': 'About',
      'nav.benefits': 'Benefits',
      'nav.solutions': 'Solutions',
      'nav.contact': 'Contact',
      'nav.syncro': 'Syncro'
    },
    hr: {
      'nav.home': 'Početna',
      'nav.about': 'O nama',
      'nav.benefits': 'Prednosti',
      'nav.solutions': 'Rješenja',
      'nav.contact': 'Kontakt',
      'nav.syncro': 'Syncro'
    }
  };

  const updateNavLanguage = (lang) => {
    document.querySelectorAll('[data-i18n]').forEach((link) => {
      const key = link.dataset.i18n;
      const translation = navTranslations[lang]?.[key];

      if (translation) {
        link.textContent = translation;
      }
    });
  };

  if (langButtons.length && languageBlocks.length) {
    const setLanguage = (lang) => {
      document.documentElement.lang = lang;
      updateNavLanguage(lang);

      langButtons.forEach((button) => {
        const isActive = button.dataset.lang === lang;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
      });

      languageBlocks.forEach((block) => {
        const shouldShow = block.dataset.lang === lang;
        block.classList.toggle('hidden', !shouldShow);
      });
    };

    const defaultLang = document.documentElement.lang || document.body.dataset.defaultLang || 'en';
    setLanguage(defaultLang);

    langButtons.forEach((button) => {
      button.addEventListener('click', () => {
        setLanguage(button.dataset.lang);
      });
    });
  }
});

