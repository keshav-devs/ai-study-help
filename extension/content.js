/**
 * content.js — Main Content Script
 * Handles video speed, slides helper, quiz detection, sidebar injection.
 * Debug logs prefixed with [AI-SA] for easy filtering in DevTools.
 */
(() => {
  'use strict';
  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.log('[AI-SA]', ...args); };
  const warn = (...args) => { if (DEBUG) console.warn('[AI-SA]', ...args); };

  let isActive = false;
  let currentMode = 'none';
  let speedInterval = null;
  let detectionInterval = null;
  let nextButtonObserver = null;
  let floatingHelper = null;
  let sidebarInjected = false;
  let currentSpeed = 3;
  let extractedQuestions = [];

  // ===== Message Listener =====
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_AUTOMATION') { startAutomation(); sendResponse({ success: true }); }
    else if (msg.type === 'STOP_AUTOMATION') { stopAutomation(); sendResponse({ success: true }); }
    return true;
  });

  function startAutomation() {
    if (isActive) return;
    isActive = true;
    log('▶ Automation STARTED');
    chrome.storage.sync.get({ playbackSpeed: 3 }, (s) => {
      currentSpeed = s.playbackSpeed;
      log('⚙ Speed preference:', currentSpeed + 'x');
      runDetection();
    });
    detectionInterval = setInterval(() => { if (isActive) runDetection(); }, 3000);
    document.addEventListener('keydown', handleHotkey);
    notify('Automation started — scanning page...');
  }

  function stopAutomation() {
    isActive = false;
    currentMode = 'none';
    log('■ Automation STOPPED');
    if (speedInterval) { clearInterval(speedInterval); speedInterval = null; }
    if (detectionInterval) { clearInterval(detectionInterval); detectionInterval = null; }
    removeFloatingHelper();
    removeSidebar();
    sidebarInjected = false;
    if (nextButtonObserver) { nextButtonObserver.disconnect(); nextButtonObserver = null; }
    document.removeEventListener('keydown', handleHotkey);
    reportMode('none');
    notify('Automation stopped.');
  }

  // ===== Detection =====
  function runDetection() {
    if (StudyUtils.detectQuiz()) {
      if (currentMode !== 'quiz') { log('🧠 Quiz DETECTED'); currentMode = 'quiz'; reportMode('quiz'); handleQuizMode(); notify('Quiz detected — AI assistant ready'); }
    } else if (StudyUtils.detectVideo()) {
      if (currentMode !== 'video') { log('🎬 Video DETECTED'); currentMode = 'video'; reportMode('video'); handleVideoMode(); notify('Video speed set to ' + currentSpeed + 'x'); }
    } else if (StudyUtils.detectNextButton()) {
      if (currentMode !== 'slides') { log('📄 Slides DETECTED (Next button found)'); currentMode = 'slides'; reportMode('slides'); handleSlidesMode(); }
    }
  }

  function reportMode(mode) { chrome.runtime.sendMessage({ type: 'MODE_DETECTED', mode }); }

  // ===== Video Mode =====
  function handleVideoMode() {
    applyVideoSpeed();
    if (speedInterval) clearInterval(speedInterval);
    speedInterval = setInterval(applyVideoSpeed, 1500);
  }

  function applyVideoSpeed() {
    document.querySelectorAll('video').forEach(v => { if (v.playbackRate !== currentSpeed) v.playbackRate = currentSpeed; });
  }

  // ===== Slides Mode =====
  function handleSlidesMode() {
    showFloatingHelper();
    if (nextButtonObserver) nextButtonObserver.disconnect();
    nextButtonObserver = new MutationObserver(StudyUtils.debounce(() => {
      StudyUtils.detectNextButton() ? showFloatingHelper() : removeFloatingHelper();
    }, 500));
    nextButtonObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'style', 'class'] });
  }

  function showFloatingHelper() {
    if (floatingHelper) return;
    floatingHelper = document.createElement('div');
    floatingHelper.id = 'ai-study-floating-helper';
    floatingHelper.innerHTML = '<button id="ai-study-next-btn">Next ▶</button>';
    Object.assign(floatingHelper.style, { position: 'fixed', bottom: '24px', right: '24px', zIndex: '2147483646' });
    document.body.appendChild(floatingHelper);
    const btn = floatingHelper.querySelector('#ai-study-next-btn');
    Object.assign(btn.style, { padding: '12px 24px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: '50px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 20px rgba(99,102,241,0.4)', transition: 'all 0.2s ease' });
    btn.onmouseenter = () => { btn.style.transform = 'translateY(-2px) scale(1.05)'; };
    btn.onmouseleave = () => { btn.style.transform = 'none'; };
    btn.onclick = () => { const nb = StudyUtils.detectNextButton(); if (nb) nb.click(); };
  }

  function removeFloatingHelper() { if (floatingHelper) { floatingHelper.remove(); floatingHelper = null; } }

  // ===== Quiz Mode =====
  function handleQuizMode() {
    extractedQuestions = StudyUtils.extractQuestions();
    log('📋 Extracted', extractedQuestions.length, 'questions');
    if (extractedQuestions.length === 0) { warn('No questions found on page'); return; }
    injectSidebar(extractedQuestions);
  }

  // ===== Sidebar =====
  function injectSidebar(questions) {
    if (sidebarInjected) { log('🔄 Updating existing sidebar'); updateSidebarQuestions(questions); return; }
    log('📌 Injecting AI sidebar with', questions.length, 'questions');
    sidebarInjected = true;
    const sb = document.createElement('div');
    sb.id = 'ai-study-sidebar';
    sb.innerHTML = buildSidebarHTML(questions);
    document.body.appendChild(sb);
    document.body.style.marginRight = '360px';
    document.body.style.transition = 'margin-right 0.3s ease';
    attachSidebarEvents(sb, questions);
  }

  function buildSidebarHTML(questions) {
    const cards = questions.map((q, i) => {
      const optHtml = q.options.length > 0 ? '<div class="ai-sidebar-options">' + q.options.map(o => '<span class="ai-sidebar-option">' + esc(o) + '</span>').join('') + '</div>' : '';
      return '<div class="ai-sidebar-card" data-index="' + i + '">' +
        '<div class="ai-sidebar-q-header"><span class="ai-sidebar-q-num">Q' + (i+1) + '</span><span class="ai-sidebar-q-text">' + esc(q.question.substring(0,120)) + '</span></div>' +
        optHtml +
        '<div class="ai-sidebar-answer" id="ai-answer-' + i + '"><div class="ai-sidebar-loading">Waiting for AI...</div></div>' +
        '<div class="ai-sidebar-actions" id="ai-actions-' + i + '" style="display:none;">' +
        '<button class="ai-btn ai-btn-copy" data-index="' + i + '">📋 Copy</button>' +
        '<button class="ai-btn ai-btn-fill" data-index="' + i + '">✏️ Fill</button></div></div>';
    }).join('');

    return '<div class="ai-sidebar-header"><div class="ai-sidebar-title"><span>🧠</span><span>AI Study Assistant</span></div>' +
      '<button class="ai-sidebar-close" id="ai-sidebar-close">✕</button></div>' +
      '<div class="ai-sidebar-model-badge" id="ai-model-badge" style="display:none;"></div>' +
      '<div class="ai-sidebar-content"><div class="ai-sidebar-section"><div class="ai-sidebar-section-title">Questions (' + questions.length + ')</div>' + cards + '</div>' +
      '<div class="ai-sidebar-global-actions"><button class="ai-btn ai-btn-getanswers" id="ai-get-answers">🤖 Get AI Answers</button>' +
      '<button class="ai-btn ai-btn-fillall" id="ai-fill-all" style="display:none;">⚡ Fill All</button></div></div>';
  }

  function attachSidebarEvents(sb, questions) {
    sb.querySelector('#ai-sidebar-close').onclick = () => removeSidebar();
    sb.querySelector('#ai-get-answers').onclick = async function() {
      this.textContent = '⏳ Getting answers...';
      this.disabled = true;
      try {
        log('🌐 Sending', questions.length, 'questions to backend...');
        const resp = await new Promise((res, rej) => {
          chrome.runtime.sendMessage({ type: 'GET_AI_ANSWERS', questions }, r => {
            r && r.success ? res(r.data) : rej(new Error(r?.error || 'Failed'));
          });
        });
        log('✅ Received', (resp.answers || []).length, 'answers from', resp.modelUsed || 'unknown model');
        displayAnswers(sb, resp.answers || [], resp.modelUsed || '');
      } catch(e) { warn('❌ Backend error:', e.message); this.textContent = '❌ Error — Retry'; this.disabled = false; }
    };
  }

  function displayAnswers(sb, answers, modelUsed) {
    // Show model badge in sidebar header
    const badge = sb.querySelector('#ai-model-badge');
    if (badge && modelUsed) {
      const isFallback = modelUsed.toLowerCase().includes('llama') || modelUsed.toLowerCase().includes('nemotron');
      const isCached = modelUsed.toLowerCase().includes('cached');
      let label = isCached ? '📦 CACHED' : (isFallback ? '🔄 FALLBACK' : '⚡ PRIMARY');
      let badgeClass = isCached ? 'badge-cached' : (isFallback ? 'badge-fallback' : 'badge-primary');
      badge.innerHTML = '<span class="' + badgeClass + '">' + label + '</span><span class="ai-model-name">' + esc(modelUsed) + '</span>';
      badge.style.display = 'flex';
    }
    answers.forEach((a, i) => {
      const el = sb.querySelector('#ai-answer-' + i);
      const act = sb.querySelector('#ai-actions-' + i);
      if (el) {
        const conf = a.confidence || 'medium';
        const cc = { high: '#34d399', medium: '#fbbf24', low: '#f87171' }[conf] || '#fbbf24';
        el.innerHTML = '<div class="ai-sidebar-answer-text">' + esc(a.answer || '') + '</div><span class="ai-sidebar-confidence" style="color:' + cc + '">● ' + conf.toUpperCase() + '</span>';
      }
      if (act) {
        act.style.display = 'flex';
        act.querySelector('.ai-btn-copy').onclick = () => navigator.clipboard.writeText(a.answer || '');
        act.querySelector('.ai-btn-fill').onclick = () => StudyUtils.fillAnswer(i, a.answer || '', extractedQuestions);
      }
    });
    const fillAll = sb.querySelector('#ai-fill-all');
    const getBtn = sb.querySelector('#ai-get-answers');
    if (fillAll) { fillAll.style.display = 'block'; fillAll.onclick = () => answers.forEach((a, i) => StudyUtils.fillAnswer(i, a.answer || '', extractedQuestions)); }
    if (getBtn) { getBtn.textContent = '🤖 Refresh Answers'; getBtn.disabled = false; }
  }

  function updateSidebarQuestions(q) {
    const sb = document.getElementById('ai-study-sidebar');
    if (sb) { sb.innerHTML = buildSidebarHTML(q); attachSidebarEvents(sb, q); }
  }

  function removeSidebar() {
    const sb = document.getElementById('ai-study-sidebar');
    if (sb) { sb.remove(); document.body.style.marginRight = '0'; sidebarInjected = false; }
  }

  // ===== Hotkeys =====
  function handleHotkey(e) {
    if (!isActive || ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    if (e.key === '1') { currentSpeed = 1; applyVideoSpeed(); notify('Speed: 1x'); }
    if (e.key === '2') { currentSpeed = 2; applyVideoSpeed(); notify('Speed: 2x'); }
    if (e.key === '3') { currentSpeed = 3; applyVideoSpeed(); notify('Speed: 3x'); }
  }

  function notify(text) { chrome.runtime.sendMessage({ type: 'SHOW_NOTIFICATION', text }); }
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
})();
