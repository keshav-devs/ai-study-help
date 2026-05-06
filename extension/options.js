/**
 * options.js — Settings Page Controller
 * Persists user preferences via chrome.storage.sync
 */

const backendUrl = document.getElementById('backendUrl');
const playbackSpeed = document.getElementById('playbackSpeed');
const theme = document.getElementById('theme');
const btnSave = document.getElementById('btnSave');
const toast = document.getElementById('toast');

// Load saved settings
chrome.storage.sync.get({
  backendUrl: 'http://localhost:3000',
  playbackSpeed: 3,
  theme: 'dark'
}, (settings) => {
  backendUrl.value = settings.backendUrl;
  playbackSpeed.value = settings.playbackSpeed;
  theme.value = settings.theme;
});

// Save settings
btnSave.addEventListener('click', () => {
  chrome.storage.sync.set({
    backendUrl: backendUrl.value.trim() || 'http://localhost:3000',
    playbackSpeed: parseFloat(playbackSpeed.value),
    theme: theme.value
  }, () => {
    // Show toast notification
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  });
});
