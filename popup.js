const playbackSpeedSelect = document.getElementById('playbackSpeed');
const volumeSlider = document.getElementById('volume');
const volumeValue = document.getElementById('volumeValue');
const disableCaptionsToggle = document.getElementById('disableCaptions');
const cinemaModeToggle = document.getElementById('cinemaMode');
const disableShortsToggle = document.getElementById('disableShorts');
const saveButton = document.getElementById('saveButton');
const statusMessage = document.getElementById('statusMessage');

chrome.storage.sync.get(['playbackSpeed', 'volume', 'disableCaptions', 'cinemaMode', 'disableShorts'], (result) => {
  if (result.playbackSpeed !== undefined) {
    playbackSpeedSelect.value = result.playbackSpeed;
  } else {
    playbackSpeedSelect.value = 1.5;
  }
  
  if (result.volume !== undefined) {
    volumeSlider.value = result.volume;
    volumeValue.textContent = result.volume;
  } else {
    volumeSlider.value = 40;
    volumeValue.textContent = 40;
  }
  
  if (result.disableCaptions !== undefined) {
    disableCaptionsToggle.checked = result.disableCaptions;
  } else {
    disableCaptionsToggle.checked = true;
  }
  
  if (result.cinemaMode !== undefined) {
    cinemaModeToggle.checked = result.cinemaMode;
  } else {
    cinemaModeToggle.checked = false;
  }
  
  if (result.disableShorts !== undefined) {
    disableShortsToggle.checked = result.disableShorts;
  } else {
    disableShortsToggle.checked = true;
  }
});

volumeSlider.addEventListener('input', () => {
  volumeValue.textContent = volumeSlider.value;
});

saveButton.addEventListener('click', () => {
  const settings = {
    playbackSpeed: parseFloat(playbackSpeedSelect.value),
    volume: parseInt(volumeSlider.value),
    disableCaptions: disableCaptionsToggle.checked,
    cinemaMode: cinemaModeToggle.checked,
    disableShorts: disableShortsToggle.checked
  };
  
  chrome.storage.sync.set(settings, () => {
    statusMessage.textContent = 'Settings saved successfully!';
    statusMessage.style.opacity = '1';
    
    setTimeout(() => {
      statusMessage.style.opacity = '0';
    }, 2000);
  });
});