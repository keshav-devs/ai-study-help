/**
 * background.js — Service Worker (Manifest V3)
 * 
 * Routes messages between popup ↔ content script.
 * Manages automation state via chrome.storage.session.
 */

// Initialize default state on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.set({
    automationActive: false,
    detectedMode: 'none' // 'video' | 'slides' | 'quiz' | 'none'
  });
  console.log('[AI Study Assistant] Extension installed.');
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    // Popup requests: start automation on the active tab
    case 'START_AUTOMATION':
      chrome.storage.session.set({ automationActive: true });
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'START_AUTOMATION' }, (response) => {
            sendResponse(response || { success: true });
          });
        }
      });
      return true; // keep channel open for async sendResponse

    // Popup requests: stop automation
    case 'STOP_AUTOMATION':
      chrome.storage.session.set({ automationActive: false, detectedMode: 'none' });
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_AUTOMATION' }, (response) => {
            sendResponse(response || { success: true });
          });
        }
      });
      return true;

    // Content script reports detected mode
    case 'MODE_DETECTED':
      chrome.storage.session.set({ detectedMode: message.mode });
      sendResponse({ success: true });
      break;

    // Content script requests AI answers from backend
    case 'GET_AI_ANSWERS':
      handleAIRequest(message.questions)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    // Popup asks for current state
    case 'GET_STATE':
      chrome.storage.session.get(['automationActive', 'detectedMode'], (result) => {
        sendResponse(result);
      });
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

/**
 * Sends extracted questions to the AI backend and returns answers.
 */
async function handleAIRequest(questions) {
  // Get backend URL from settings (default: localhost:3000)
  const { backendUrl } = await chrome.storage.sync.get({ backendUrl: 'http://localhost:3000' });

  const response = await fetch(`${backendUrl}/api/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions })
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }

  return response.json();
}

/**
 * Show a Chrome notification
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOW_NOTIFICATION') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'AI Study Assistant',
      message: message.text,
      priority: 1
    });
    sendResponse({ success: true });
  }
});
