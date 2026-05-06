/**
 * popup.js — Extension Popup Controller
 * 
 * Handles Start/Stop automation buttons and syncs state
 * with the background service worker.
 */

const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const statusCard = document.getElementById('statusCard');
const modeValue = document.getElementById('modeValue');
const openOptions = document.getElementById('openOptions');

// Mode display map
const MODE_LABELS = {
  none: '—',
  video: '🎬 Video',
  slides: '📄 Slides',
  quiz: '🧠 Quiz'
};

/**
 * Update the popup UI to reflect current automation state
 */
function updateUI(active, mode = 'none') {
  if (active) {
    statusDot.classList.add('active');
    statusText.textContent = 'Active';
    statusCard.classList.add('active');
    btnStart.disabled = true;
    btnStop.disabled = false;
  } else {
    statusDot.classList.remove('active');
    statusText.textContent = 'Inactive';
    statusCard.classList.remove('active');
    btnStart.disabled = false;
    btnStop.disabled = true;
  }
  modeValue.textContent = MODE_LABELS[mode] || MODE_LABELS.none;
}

// Load persisted state on popup open
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
  if (response) {
    updateUI(response.automationActive, response.detectedMode);
  }
});

// Start Automation
btnStart.addEventListener('click', () => {
  btnStart.disabled = true;
  chrome.runtime.sendMessage({ type: 'START_AUTOMATION' }, (response) => {
    updateUI(true, 'none');
  });
});

// Stop Automation
btnStop.addEventListener('click', () => {
  btnStop.disabled = true;
  chrome.runtime.sendMessage({ type: 'STOP_AUTOMATION' }, (response) => {
    updateUI(false, 'none');
  });
});

// Open Options page
openOptions.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Listen for mode changes while popup is open
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session') {
    if (changes.detectedMode) {
      modeValue.textContent = MODE_LABELS[changes.detectedMode.newValue] || MODE_LABELS.none;
    }
    if (changes.automationActive) {
      const mode = changes.detectedMode ? changes.detectedMode.newValue : 'none';
      updateUI(changes.automationActive.newValue, mode);
    }
  }
});

// ===== Backend Connection Status Badge =====
const backendDot = document.getElementById('backendDot');
const backendText = document.getElementById('backendText');

/**
 * Ping the backend health endpoint and update the badge.
 * Shows: Backend Connected (green) | Backend Offline (red) | AI Ready (green+bold)
 */
async function checkBackendStatus() {
  const { backendUrl } = await chrome.storage.sync.get({ backendUrl: 'http://localhost:3000' });

  try {
    const response = await fetch(backendUrl + '/', { method: 'GET', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Non-OK status');

    const data = await response.json();
    backendDot.className = 'backend-dot connected';
    backendText.textContent = data.status === 'ok' ? '✅ Backend Connected' : '⚠️ Backend Degraded';

    // If both models info present, show AI Ready
    if (data.primaryModel && data.fallbackModel) {
      backendText.textContent = '🧠 AI Ready';
      backendDot.className = 'backend-dot ai-ready';
    }
  } catch (err) {
    backendDot.className = 'backend-dot offline';
    backendText.textContent = '❌ Backend Offline';
  }
}

// Check on popup open, then every 15s while popup is visible
checkBackendStatus();
setInterval(checkBackendStatus, 15000);
