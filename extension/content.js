/**
 * content.js — Main Content Script (MutationObserver Architecture)
 *
 * Replaces the old setInterval-based detection with a robust observer
 * architecture designed for dynamic SPAs like Infosys Springboard.
 *
 * Architecture:
 *   1. MutationObserver watches for DOM changes (throttled)
 *   2. SPA route change detector (popstate + URL polling)
 *   3. Video element watcher (new videos, source changes)
 *   4. Duplicate injection guards
 *
 * Debug logs prefixed with [AI-SA] — filter in DevTools Console.
 */
(() => {
  'use strict';

  // ===== Debug Logger =====
  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.log('[AI-SA]', ...args); };
  const warn = (...args) => { if (DEBUG) console.warn('[AI-SA]', ...args); };

  // ===== State =====
  let isActive = false;
  let currentMode = 'none';
  let speedInterval = null;
  let floatingHelper = null;
  let sidebarInjected = false;
  let currentSpeed = 3;
  let extractedQuestions = [];

  // Observer references (for cleanup)
  let domObserver = null;
  let routeCheckInterval = null;
  let lastUrl = location.href;
  let scanScheduled = false;

  // ===== Message Listener =====
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_AUTOMATION') { startAutomation(); sendResponse({ success: true }); }
    else if (msg.type === 'STOP_AUTOMATION') { stopAutomation(); sendResponse({ success: true }); }
    return true;
  });

  // ===== Start / Stop =====

  function startAutomation() {
    if (isActive) return;
    isActive = true;
    log('▶ Automation STARTED');

    chrome.storage.sync.get({ playbackSpeed: 3 }, (s) => {
      currentSpeed = s.playbackSpeed;
      log('⚙ Speed preference:', currentSpeed + 'x');

      // Initial scan
      runDetection('initial');

      // Start the observer architecture
      startDOMObserver();
      startRouteWatcher();
    });

    document.addEventListener('keydown', handleHotkey);
    notify('Automation started — scanning page...');
  }

  function stopAutomation() {
    isActive = false;
    currentMode = 'none';
    log('■ Automation STOPPED');

    // Tear down observers
    stopDOMObserver();
    stopRouteWatcher();

    if (speedInterval) { clearInterval(speedInterval); speedInterval = null; }
    removeFloatingHelper();
    removeSidebar();
    sidebarInjected = false;
    document.removeEventListener('keydown', handleHotkey);
    reportMode('none');
    notify('Automation stopped.');
  }

  // ═══════════════════════════════════════════════════
  //  CORE: MutationObserver Architecture
  // ═══════════════════════════════════════════════════

  /**
   * Start the MutationObserver on document.body.
   * Uses a throttled callback to avoid hammering detection
   * on rapid DOM changes (React re-renders, Angular digests, etc.)
   */
  function startDOMObserver() {
    if (domObserver) return;

    const throttledScan = StudyUtils.throttle(() => {
      if (!isActive) return;
      runDetection('mutation');
    }, 1500); // max 1 scan per 1.5 seconds

    domObserver = new MutationObserver((mutations) => {
      if (!isActive) return;

      // Quick relevance check — skip mutations from our own sidebar/helper
      const isRelevant = mutations.some(m => {
        const target = m.target;
        if (target.id === 'ai-study-sidebar' || target.id === 'ai-study-floating-helper') return false;
        if (target.closest?.('#ai-study-sidebar')) return false;
        return true;
      });

      if (isRelevant) {
        scheduleDetection(throttledScan);
      }
    });

    // Observe body subtree for childList + attribute changes on key properties
    const observeTarget = document.body || document.documentElement;
    domObserver.observe(observeTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'style', 'class', 'src', 'hidden', 'aria-hidden']
    });

    log('👁 MutationObserver STARTED');
  }

  function stopDOMObserver() {
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
      log('👁 MutationObserver STOPPED');
    }
  }

  /**
   * Schedule detection using requestAnimationFrame to batch
   * multiple synchronous mutations into a single scan.
   */
  function scheduleDetection(throttledScan) {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      throttledScan();
    });
  }

  // ═══════════════════════════════════════════════════
  //  SPA Route Change Detector
  // ═══════════════════════════════════════════════════

  function startRouteWatcher() {
    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', handleRouteChange);

    // Poll URL for pushState/replaceState changes (SPA frameworks)
    routeCheckInterval = setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handleRouteChange();
      }
    }, 1000);

    log('🔗 Route watcher STARTED');
  }

  function stopRouteWatcher() {
    window.removeEventListener('popstate', handleRouteChange);
    if (routeCheckInterval) {
      clearInterval(routeCheckInterval);
      routeCheckInterval = null;
    }
    log('🔗 Route watcher STOPPED');
  }

  function handleRouteChange() {
    if (!isActive) return;
    log('🔀 Route changed:', location.pathname);

    // Reset mode — new page content is loading
    currentMode = 'none';
    reportMode('none');

    // Remove old UI elements (new page, new content)
    removeFloatingHelper();
    if (speedInterval) { clearInterval(speedInterval); speedInterval = null; }

    // Wait for new content to render, then scan
    setTimeout(() => runDetection('route-change'), 1500);
    setTimeout(() => runDetection('route-change-delayed'), 4000);
  }

  // ═══════════════════════════════════════════════════
  //  Detection Engine
  // ═══════════════════════════════════════════════════

  function runDetection(trigger = 'unknown') {
    if (!isActive) return;

    // Priority: Quiz > Video > Slides
    if (StudyUtils.detectQuiz()) {
      if (currentMode !== 'quiz') {
        log(`🧠 Quiz DETECTED [trigger: ${trigger}]`);
        currentMode = 'quiz';
        reportMode('quiz');
        handleQuizMode();
        notify('Quiz detected — AI assistant ready');
      } else {
        // Re-extract if quiz content may have changed
        if (trigger === 'route-change' || trigger === 'route-change-delayed') {
          handleQuizMode();
        }
      }
    } else if (StudyUtils.detectVideo()) {
      if (currentMode !== 'video') {
        log(`🎬 Video DETECTED [trigger: ${trigger}]`);
        currentMode = 'video';
        reportMode('video');
        handleVideoMode();
        notify('Video speed set to ' + currentSpeed + 'x');
      }
    } else if (StudyUtils.detectNextButton()) {
      if (currentMode !== 'slides') {
        log(`📄 Slides DETECTED — Next button found [trigger: ${trigger}]`);
        currentMode = 'slides';
        reportMode('slides');
        handleSlidesMode();
      }
    }
  }

  function reportMode(mode) {
    try { chrome.runtime.sendMessage({ type: 'MODE_DETECTED', mode }); } catch { /* extension context invalidated */ }
  }

  // ═══════════════════════════════════════════════════
  //  Mode Handlers
  // ═══════════════════════════════════════════════════

  // ----- Video Mode -----
  function handleVideoMode() {
    log('🎬 Applying speed:', currentSpeed + 'x');
    applyVideoSpeed();
    if (speedInterval) clearInterval(speedInterval);
    // Re-apply periodically (some players reset playback rate)
    speedInterval = setInterval(applyVideoSpeed, 2000);
  }

  function applyVideoSpeed() {
    let applied = 0;
    document.querySelectorAll('video').forEach(v => {
      if (v.playbackRate !== currentSpeed) {
        v.playbackRate = currentSpeed;
        applied++;
      }
    });

    // Also try same-origin iframes
    try {
      document.querySelectorAll('iframe').forEach(iframe => {
        try {
          iframe.contentDocument?.querySelectorAll('video').forEach(v => {
            if (v.playbackRate !== currentSpeed) {
              v.playbackRate = currentSpeed;
              applied++;
            }
          });
        } catch { /* cross-origin */ }
      });
    } catch { /* safety */ }

    if (applied > 0) log(`⏩ Speed applied to ${applied} video(s): ${currentSpeed}x`);
  }

  // ----- Slides Mode -----
  function handleSlidesMode() {
    showFloatingHelper();
  }

  function showFloatingHelper() {
    if (document.getElementById('ai-study-floating-helper')) return; // duplicate guard
    if (floatingHelper) return;
    log('📌 Injecting floating Next helper');

    floatingHelper = document.createElement('div');
    floatingHelper.id = 'ai-study-floating-helper';
    floatingHelper.innerHTML = '<button id="ai-study-next-btn">Next ▶</button>';
    Object.assign(floatingHelper.style, { position: 'fixed', bottom: '24px', right: '24px', zIndex: '2147483646' });
    document.body.appendChild(floatingHelper);

    const btn = floatingHelper.querySelector('#ai-study-next-btn');
    Object.assign(btn.style, {
      padding: '12px 24px',
      background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
      color: '#fff', border: 'none', borderRadius: '50px',
      fontSize: '14px', fontWeight: '700', cursor: 'pointer',
      boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
      transition: 'all 0.2s ease'
    });
    btn.onmouseenter = () => { btn.style.transform = 'translateY(-2px) scale(1.05)'; };
    btn.onmouseleave = () => { btn.style.transform = 'none'; };
    btn.onclick = () => {
      const nb = StudyUtils.detectNextButton();
      if (nb) { log('➡ Next button clicked via helper'); nb.click(); }
    };
  }

  function removeFloatingHelper() {
    if (floatingHelper) { floatingHelper.remove(); floatingHelper = null; }
    // Also remove orphaned helpers (safety)
    const orphan = document.getElementById('ai-study-floating-helper');
    if (orphan) orphan.remove();
  }

  // ----- Quiz Mode -----
  function handleQuizMode() {
    extractedQuestions = StudyUtils.extractQuestions();
    log('📋 Extracted', extractedQuestions.length, 'questions');
    if (extractedQuestions.length === 0) { warn('No questions found on page — retrying in 3s'); setTimeout(() => { if (isActive && currentMode === 'quiz') handleQuizMode(); }, 3000); return; }
    injectSidebar(extractedQuestions);
  }

  // ═══════════════════════════════════════════════════
  //  Sidebar
  // ═══════════════════════════════════════════════════

  function injectSidebar(questions) {
    // Duplicate injection guard
    if (document.getElementById('ai-study-sidebar')) {
      log('🔄 Sidebar exists — updating content');
      updateSidebarQuestions(questions);
      sidebarInjected = true;
      return;
    }

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
      } catch(e) {
        warn('❌ Backend error:', e.message);
        this.textContent = '❌ Error — Retry';
        this.disabled = false;
      }
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
        act.querySelector('.ai-btn-copy').onclick = () => { navigator.clipboard.writeText(a.answer || ''); log('📋 Copied answer', i+1); };
        act.querySelector('.ai-btn-fill').onclick = () => { StudyUtils.fillAnswer(i, a.answer || '', extractedQuestions); log('✏️ Filled answer', i+1); };
      }
    });
    const fillAll = sb.querySelector('#ai-fill-all');
    const getBtn = sb.querySelector('#ai-get-answers');
    if (fillAll) {
      fillAll.style.display = 'block';
      fillAll.onclick = () => {
        log('⚡ Filling ALL answers');
        answers.forEach((a, i) => StudyUtils.fillAnswer(i, a.answer || '', extractedQuestions));
      };
    }
    if (getBtn) { getBtn.textContent = '🤖 Refresh Answers'; getBtn.disabled = false; }
  }

  function updateSidebarQuestions(q) {
    const sb = document.getElementById('ai-study-sidebar');
    if (sb) { sb.innerHTML = buildSidebarHTML(q); attachSidebarEvents(sb, q); }
  }

  function removeSidebar() {
    const sb = document.getElementById('ai-study-sidebar');
    if (sb) { sb.remove(); document.body.style.marginRight = '0'; sidebarInjected = false; log('🗑 Sidebar removed'); }
  }

  // ═══════════════════════════════════════════════════
  //  Hotkeys & Utilities
  // ═══════════════════════════════════════════════════

  function handleHotkey(e) {
    if (!isActive || ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    if (e.key === '1') { currentSpeed = 1; applyVideoSpeed(); notify('Speed: 1x'); }
    if (e.key === '2') { currentSpeed = 2; applyVideoSpeed(); notify('Speed: 2x'); }
    if (e.key === '3') { currentSpeed = 3; applyVideoSpeed(); notify('Speed: 3x'); }
  }

  function notify(text) {
    try { chrome.runtime.sendMessage({ type: 'SHOW_NOTIFICATION', text }); } catch { /* context invalidated */ }
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // ===== Initialization Log =====
  log('📦 Content script loaded on', location.hostname, '— waiting for automation start');
})();
