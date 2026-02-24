let settings = {
  playbackSpeed: 1.5,
  volume: 40,
  disableCaptions: true,
  cinemaMode: false,
  disableShorts: true
};

let videoElement = null;
let currentVideoId = null;
let adCheckInterval = null;
let settingsCheckInterval = null;
let isAdMuted = false;
let previousVolume = 40;
let videoObserver = null;
let adSkipObserver = null;

chrome.storage.sync.get(['playbackSpeed', 'volume', 'disableCaptions', 'cinemaMode', 'disableShorts'], (result) => {
  if (result.playbackSpeed !== undefined) settings.playbackSpeed = result.playbackSpeed;
  if (result.volume !== undefined) {
    settings.volume = result.volume;
    previousVolume = result.volume;
  }
  if (result.disableCaptions !== undefined) settings.disableCaptions = result.disableCaptions;
  if (result.cinemaMode !== undefined) settings.cinemaMode = result.cinemaMode;
  if (result.disableShorts !== undefined) settings.disableShorts = result.disableShorts;
  
  init();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    if (changes.playbackSpeed) settings.playbackSpeed = changes.playbackSpeed.newValue;
    if (changes.volume) {
      settings.volume = changes.volume.newValue;
      previousVolume = changes.volume.newValue;
    }
    if (changes.disableCaptions) settings.disableCaptions = changes.disableCaptions.newValue;
    if (changes.cinemaMode) settings.cinemaMode = changes.cinemaMode.newValue;
    if (changes.disableShorts) settings.disableShorts = changes.disableShorts.newValue;
    
    setTimeout(() => applyAllSettings(), 100);
    if (settings.disableShorts) {
      removeShorts();
    }
  }
});

function init() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startExtension);
  } else {
    startExtension();
  }
}

function startExtension() {
  findAndAttachToVideo();
  
  if (settings.disableShorts) {
    removeShorts();
  }
  
  observeNavigation();
  observeShorts();
  startAdSkipper();
  startAdSkipButtonObserver();
  startContinuousSettingsCheck();
}

function observeNavigation() {
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      
      if (window.location.pathname === '/watch') {
        const videoId = new URLSearchParams(window.location.search).get('v');
        if (videoId !== currentVideoId) {
          currentVideoId = videoId;
          findAndAttachToVideo();
        }
      }
      
      if (settings.disableShorts) {
        removeShorts();
      }
    }
  }).observe(document.body || document.documentElement, { childList: true, subtree: true });
}

function findAndAttachToVideo() {
  const findVideo = setInterval(() => {
    const video = document.querySelector('video');
    
    if (video) {
      clearInterval(findVideo);
      videoElement = video;
      
      videoElement.addEventListener('loadstart', handleVideoEvent);
      videoElement.addEventListener('loadedmetadata', handleVideoEvent);
      videoElement.addEventListener('loadeddata', handleVideoEvent);
      videoElement.addEventListener('canplay', handleVideoEvent);
      videoElement.addEventListener('playing', handleVideoEvent);
      videoElement.addEventListener('play', handleVideoEvent);
      videoElement.addEventListener('timeupdate', handleVideoEvent);
      
      videoElement.addEventListener('ratechange', (e) => {
        if (!isAdCurrentlyPlaying()) {
          const currentRate = videoElement.playbackRate;
          if (Math.abs(currentRate - settings.playbackSpeed) > 0.01) {
            setTimeout(() => {
              if (videoElement.playbackRate !== settings.playbackSpeed) {
                videoElement.playbackRate = settings.playbackSpeed;
              }
            }, 50);
          }
        }
      });
      
      videoElement.addEventListener('volumechange', (e) => {
        if (!isAdMuted && !isAdCurrentlyPlaying()) {
          const currentVolume = videoElement.volume * 100;
          if (Math.abs(currentVolume - settings.volume) > 1) {
            setTimeout(() => {
              applyVolume();
            }, 50);
          }
        }
      });
      
      applyAllSettings();
      
      observeVideoElement();
    }
  }, 100);
  
  setTimeout(() => clearInterval(findVideo), 10000);
}

function handleVideoEvent() {
  if (!isAdCurrentlyPlaying()) {
    applyAllSettings();
  }
}

function observeVideoElement() {
  if (videoObserver) {
    videoObserver.disconnect();
  }
  
  videoObserver = new MutationObserver(() => {
    if (!isAdCurrentlyPlaying()) {
      applyAllSettings();
    }
  });
  
  if (videoElement) {
    videoObserver.observe(videoElement, {
      attributes: true,
      attributeFilter: ['src']
    });
  }
}

function startAdSkipButtonObserver() {
  if (adSkipObserver) {
    adSkipObserver.disconnect();
  }
  
  adSkipObserver = new MutationObserver((mutations) => {
    skipAdInstantly();
  });
  
  const targetNode = document.body || document.documentElement;
  
  adSkipObserver.observe(targetNode, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });
}

function skipAdInstantly() {
  const skipSelectors = [
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button',
    '.ytp-skip-ad-button',
    'button.ytp-ad-skip-button',
    'button.ytp-ad-skip-button-modern',
    '.videoAdUiSkipButton',
    '.ytp-ad-skip-button-container button',
    '.ytp-ad-skip-button-slot button',
    '.ytp-skip-ad-button-modern',
    '.ytp-preview-ad__text button',
    '.ytp-ad-skip-button-slot',
    'button[class*="skip"]'
  ];
  
  for (const selector of skipSelectors) {
    const skipButtons = document.querySelectorAll(selector);
    for (const skipButton of skipButtons) {
      if (skipButton && skipButton.offsetParent !== null && !skipButton.disabled) {
        const buttonText = skipButton.textContent.toLowerCase();
        const buttonClass = skipButton.className.toLowerCase();
        
        if (buttonText.includes('skip') || buttonClass.includes('skip')) {
          try {
            skipButton.click();
            console.log('Ad skipped instantly via observer');
            return true;
          } catch (e) {
            console.log('Skip button click failed:', e);
          }
        }
      }
    }
  }
  
  const allButtons = document.querySelectorAll('button');
  for (const button of allButtons) {
    const text = button.textContent.toLowerCase().trim();
    const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
    
    if ((text.includes('skip') && (text.includes('ad') || text.includes('ads'))) || 
        (ariaLabel.includes('skip') && (ariaLabel.includes('ad') || ariaLabel.includes('ads'))) ||
        text === 'skip ad' || 
        text === 'skip ads') {
      if (button.offsetParent !== null && !button.disabled) {
        try {
          button.click();
          console.log('Ad skipped via generic button observer');
          return true;
        } catch (e) {
          console.log('Generic skip button click failed:', e);
        }
      }
    }
  }
  
  return false;
}

function startContinuousSettingsCheck() {
  if (settingsCheckInterval) {
    clearInterval(settingsCheckInterval);
  }
  
  settingsCheckInterval = setInterval(() => {
    if (videoElement && !isAdCurrentlyPlaying()) {
      const needsSpeedFix = Math.abs(videoElement.playbackRate - settings.playbackSpeed) > 0.01;
      const needsVolumeFix = Math.abs(videoElement.volume - (settings.volume / 100)) > 0.01 && !videoElement.muted;
      
      if (needsSpeedFix) {
        applyPlaybackSpeed();
      }
      
      if (needsVolumeFix) {
        applyVolume();
      }
      
      if (settings.disableCaptions) {
        disableCaptions();
      }
      
      if (settings.cinemaMode) {
        enableCinemaMode();
      }
    }
  }, 500);
}

function applyAllSettings() {
  if (!videoElement) {
    videoElement = document.querySelector('video');
  }
  
  if (!videoElement) return;
  
  const isAdPlaying = isAdCurrentlyPlaying();
  
  if (!isAdPlaying) {
    setTimeout(() => {
      applyPlaybackSpeed();
      applyVolume();
      
      if (settings.disableCaptions) {
        disableCaptions();
      }
      
      if (settings.cinemaMode) {
        enableCinemaMode();
      }
    }, 100);
  }
}

function isAdCurrentlyPlaying() {
  const adSelectors = [
    '.ad-showing',
    '.ytp-ad-player-overlay',
    '.ytp-ad-module',
    '.video-ads',
    '.ytp-ad-text',
    '.ytp-ad-preview-container'
  ];
  
  for (const selector of adSelectors) {
    if (document.querySelector(selector)) {
      return true;
    }
  }
  
  const playerAd = document.querySelector('.video-ads.ytp-ad-module');
  if (playerAd && playerAd.childElementCount > 0) {
    return true;
  }
  
  return false;
}

function applyPlaybackSpeed() {
  if (videoElement && !isNaN(settings.playbackSpeed) && settings.playbackSpeed > 0) {
    try {
      videoElement.playbackRate = settings.playbackSpeed;
    } catch (e) {
      console.log('Failed to set playback speed:', e);
    }
  }
}

function applyVolume() {
  if (videoElement && !isNaN(settings.volume)) {
    const targetVolume = settings.volume / 100;
    
    try {
      if (videoElement.muted && !isAdMuted) {
        videoElement.muted = false;
      }
      
      videoElement.volume = targetVolume;
    } catch (e) {
      console.log('Failed to set volume:', e);
    }
  }
}

function disableCaptions() {
  const tracks = videoElement?.textTracks;
  if (tracks) {
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].mode !== 'disabled') {
        tracks[i].mode = 'disabled';
      }
    }
  }
  
  const captionsButton = document.querySelector('.ytp-subtitles-button');
  if (captionsButton) {
    const ariaPressed = captionsButton.getAttribute('aria-pressed');
    if (ariaPressed === 'true') {
      captionsButton.click();
    }
  }
}

function enableCinemaMode() {
  const player = document.querySelector('#movie_player');
  if (!player) return;
  
  const classList = player.classList;
  
  if (!classList.contains('ytp-large-width-mode')) {
    const sizeButton = document.querySelector('.ytp-size-button');
    if (sizeButton) {
      sizeButton.click();
    }
  }
}

function startAdSkipper() {
  if (adCheckInterval) {
    clearInterval(adCheckInterval);
  }
  
  adCheckInterval = setInterval(() => {
    skipAdInstantly();
    muteAd();
  }, 50);
}

function muteAd() {
  if (!videoElement) return;
  
  const isAdPlaying = isAdCurrentlyPlaying();
  
  if (isAdPlaying) {
    if (!isAdMuted) {
      previousVolume = videoElement.volume * 100;
      videoElement.muted = true;
      isAdMuted = true;
    }
  } else {
    if (isAdMuted) {
      videoElement.muted = false;
      isAdMuted = false;
      setTimeout(() => {
        applyVolume();
      }, 100);
    }
  }
}

function removeShorts() {
  const shortsSelectors = [
    'ytd-guide-entry-renderer a[href="/shorts"]',
    'ytd-guide-entry-renderer a[href^="/shorts"]',
    'ytd-mini-guide-entry-renderer a[href="/shorts"]',
    'ytd-mini-guide-entry-renderer a[href^="/shorts"]',
    'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-reel-video-renderer',
    '[is-shorts]',
    'ytd-rich-section-renderer:has([is-shorts])'
  ];
  
  shortsSelectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const parent = el.closest('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytd-reel-shelf-renderer, ytd-rich-shelf-renderer, ytd-reel-video-renderer, ytd-rich-section-renderer');
        if (parent) {
          parent.style.display = 'none';
        } else {
          el.style.display = 'none';
        }
      });
    } catch (e) {
      console.log('Error removing shorts:', e);
    }
  });
  
  const homeSections = document.querySelectorAll('ytd-rich-section-renderer');
  homeSections.forEach(section => {
    const text = section.textContent || '';
    if (text.toLowerCase().includes('shorts')) {
      section.style.display = 'none';
    }
  });
}

function observeShorts() {
  if (!settings.disableShorts) return;
  
  const observer = new MutationObserver(() => {
    if (settings.disableShorts) {
      removeShorts();
    }
  });
  
  const targetNode = document.body || document.documentElement;
  
  observer.observe(targetNode, {
    childList: true,
    subtree: true
  });
}