/**
 * utils.js — Detection Utilities & DOM Helpers for AI Study Assistant
 *
 * Redesigned for dynamic SPA websites like Infosys Springboard:
 *   - Targeted selectors instead of full-DOM scans
 *   - Platform-specific detection patterns
 *   - Efficient option extraction without body.innerText
 *   - Fuzzy matching for autofill
 */

const StudyUtils = (() => {

  // ===== Throttle / Debounce =====

  function debounce(fn, delay = 1500) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function throttle(fn, limit = 1000) {
    let inThrottle = false;
    return (...args) => {
      if (inThrottle) return;
      inThrottle = true;
      fn(...args);
      setTimeout(() => { inThrottle = false; }, limit);
    };
  }

  // ===== Video Detection =====
  // Finds <video> elements including those inside shadow DOM or iframes (same-origin)

  function detectVideo() {
    // Direct video elements
    const video = document.querySelector('video');
    if (video && video.readyState >= 0) return video;

    // Videos inside common player wrappers
    const playerSelectors = [
      '.video-js video',
      '.plyr video',
      '[data-player] video',
      '.jwplayer video',
      '.vjs-tech',
      '#player video',
      '.video-player video',
      '[class*="player"] video',
      '[class*="video"] video',
      'iframe + video',
      // Infosys Springboard patterns
      '.course-player video',
      '.learning-player video',
      '.content-area video',
      '[class*="media"] video'
    ];

    for (const sel of playerSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch { /* invalid selector — skip */ }
    }

    // Check same-origin iframes
    try {
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          const iframeVideo = iframe.contentDocument?.querySelector('video');
          if (iframeVideo) return iframeVideo;
        } catch { /* cross-origin — skip */ }
      }
    } catch { /* safety net */ }

    return null;
  }

  // ===== Next Button Detection =====
  // Expanded selectors for Infosys Springboard and common LMS platforms

  const NEXT_BUTTON_SELECTORS = [
    // Explicit next buttons
    'button.next', '.next-btn', '.next-button',
    '[aria-label="Next"]', '[aria-label="next"]',
    'button[title*="Next"]', 'button[title*="next"]',
    'a.next', 'a.next-btn',
    '[data-action="next"]', '[data-action="continue"]',

    // Infosys Springboard / LMS patterns
    '.btn-next', '.btn-continue', '.btn-proceed',
    '[class*="next-btn"]', '[class*="next-button"]',
    '[class*="continue-btn"]', '[class*="proceed"]',
    '.nav-next', '.navigation-next',
    '.course-nav button:last-child',
    '.pagination-next', '.page-next',
    '[class*="nav-right"]', '[class*="forward"]',

    // Icon-based next buttons (arrow icons)
    'button[class*="arrow-right"]',
    'button[class*="chevron-right"]',
    'a[class*="arrow-right"]'
  ];

  // Text patterns that indicate a "next" button
  const NEXT_TEXT_PATTERNS = /^(next|continue|proceed|go\s*to\s*next|forward|>>|›|→|▶)$/i;
  const NEXT_TEXT_INCLUDES = ['next', 'continue', 'proceed', 'forward'];

  function detectNextButton() {
    // Phase 1: Try explicit selectors
    for (const sel of NEXT_BUTTON_SELECTORS) {
      try {
        const elements = document.querySelectorAll(sel);
        for (const el of elements) {
          if (isClickableAndVisible(el)) return el;
        }
      } catch { /* invalid selector */ }
    }

    // Phase 2: Text-based search on buttons and links only (not full DOM)
    const clickables = document.querySelectorAll('button, a[role="button"], a.btn, [role="button"]');
    for (const el of clickables) {
      const text = el.textContent.trim().toLowerCase();
      if (text.length > 50) continue; // skip long-text elements
      if (NEXT_TEXT_INCLUDES.some(kw => text.includes(kw))) {
        if (isClickableAndVisible(el)) return el;
      }
    }

    return null;
  }

  function isClickableAndVisible(el) {
    if (!el) return false;
    if (el.disabled) return false;
    if (el.getAttribute('aria-disabled') === 'true') return false;
    if (el.offsetParent === null && el.style.position !== 'fixed') return false;
    if (el.closest('#ai-study-sidebar, #ai-study-floating-helper')) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // ===== Quiz Detection =====
  // Uses targeted element queries instead of body.innerText

  // Quiz container selectors for various platforms
  const QUIZ_CONTAINER_SELECTORS = [
    // Generic quiz/assessment
    '.quiz', '.assessment', '.exam', '.test-container',
    '[class*="quiz"]', '[class*="assessment"]', '[class*="exam"]',
    '[class*="question"]', '[data-type="quiz"]', '[data-type="assessment"]',

    // Infosys Springboard patterns
    '.assessment-container', '.quiz-container', '.test-section',
    '[class*="evaluate"]', '[class*="graded"]',
    '.question-panel', '.question-container',
    '.questionnaire',

    // Form patterns with inputs
    'form[class*="quiz"]', 'form[class*="assessment"]', 'form[class*="test"]',

    // General fieldsets with radio/checkbox
    'fieldset'
  ];

  function detectQuiz() {
    // Method 1: Check for known quiz container selectors
    for (const sel of QUIZ_CONTAINER_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          // Verify it has interactive inputs inside
          const hasInputs = el.querySelector('input[type="radio"], input[type="checkbox"], textarea, select');
          if (hasInputs) return true;
        }
      } catch { /* skip */ }
    }

    // Method 2: Count visible radio/checkbox inputs (fast — no innerText)
    const radioCount = document.querySelectorAll('input[type="radio"]').length;
    const checkboxCount = document.querySelectorAll('input[type="checkbox"]').length;
    const hasFormInputs = radioCount >= 2 || checkboxCount >= 2;

    if (!hasFormInputs) {
      // Also check for textareas that look like answer fields
      const textareas = document.querySelectorAll('textarea');
      const answerTextareas = Array.from(textareas).filter(ta =>
        ta.closest('[class*="question"], [class*="answer"], fieldset, .quiz, .assessment') !== null
      );
      if (answerTextareas.length === 0) return false;
    }

    // Method 3: Check headings and labels for quiz keywords (cheap targeted scan)
    const headings = document.querySelectorAll('h1, h2, h3, h4, .title, [class*="title"], [class*="heading"]');
    for (const h of headings) {
      const text = h.textContent.toLowerCase();
      if (/quiz|assessment|exam|test|evaluate|question/i.test(text)) {
        return true;
      }
    }

    // Method 4: If we have 3+ radio buttons, it's very likely a quiz
    if (radioCount >= 3) return true;

    return false;
  }

  // ===== Question Extraction =====
  // Structured extraction from quiz containers, not random paragraphs

  function extractQuestions() {
    const questions = [];
    const seen = new Set();

    // Strategy 1: Find question containers with numbered/labeled questions
    const questionBlocks = document.querySelectorAll(
      '.question, .quiz-question, .assessment-question, ' +
      '[class*="question-item"], [class*="quiz-item"], [class*="q-block"], ' +
      '[class*="question-container"], [class*="question-row"], ' +
      '[data-question], [data-quiz-question], ' +
      'fieldset, .form-group'
    );

    for (const block of questionBlocks) {
      const q = extractQuestionFromBlock(block, seen);
      if (q) questions.push(q);
    }

    // Strategy 2: If no structured blocks found, use proximity-based extraction
    if (questions.length === 0) {
      const questionEls = document.querySelectorAll(
        'p, h3, h4, label, .question, [class*="question"], li'
      );

      for (const el of questionEls) {
        // Skip elements inside our own sidebar
        if (el.closest('#ai-study-sidebar')) continue;

        const text = el.textContent.trim();
        if (text.length < 15 || text.length > 500) continue;
        if (seen.has(text)) continue;

        // Must look like a question (has ? or is near inputs)
        const hasQuestionMark = text.includes('?');
        const nearInputs = el.parentElement?.querySelector('input[type="radio"], input[type="checkbox"], textarea') !== null;

        if (!hasQuestionMark && !nearInputs) continue;

        seen.add(text);
        const options = extractOptionsNear(el);
        questions.push({ question: text, options });
      }
    }

    return questions.slice(0, 15);
  }

  /**
   * Extract a question + options from a structured question block
   */
  function extractQuestionFromBlock(block, seen) {
    // Skip our own sidebar elements
    if (block.closest('#ai-study-sidebar')) return null;

    // Find the question text within the block
    let questionText = '';
    const qTextEl = block.querySelector(
      '.question-text, .q-text, [class*="question-text"], ' +
      '[class*="q-title"], [class*="question-title"], ' +
      'h3, h4, p, label, legend'
    );

    if (qTextEl) {
      questionText = qTextEl.textContent.trim();
    } else {
      // Use first significant text content
      const textNodes = [];
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while (node = walker.nextNode()) {
        const t = node.textContent.trim();
        if (t.length > 10 && t.length < 500) textNodes.push(t);
      }
      questionText = textNodes[0] || '';
    }

    if (questionText.length < 10 || questionText.length > 500) return null;
    if (seen.has(questionText)) return null;
    seen.add(questionText);

    const options = extractOptionsNear(block);
    return { question: questionText, options };
  }

  /**
   * Find option labels near a question element
   * Looks for radio buttons, checkboxes, and their labels in sibling/child elements
   */
  function extractOptionsNear(questionEl) {
    const options = [];
    const container = questionEl.closest(
      '.question, .quiz-item, .assessment-item, .question-container, ' +
      '[class*="question"], form, fieldset, .form-group'
    ) || questionEl.parentElement;
    if (!container) return options;

    // Look for labeled inputs
    const inputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    inputs.forEach(input => {
      let labelText = '';

      // Check for associated label element
      if (input.id) {
        const labelEl = container.querySelector(`label[for="${input.id}"]`);
        if (labelEl) labelText = labelEl.textContent.trim();
      }

      if (!labelText) {
        // Check if input is inside a label
        const parentLabel = input.closest('label');
        if (parentLabel) labelText = parentLabel.textContent.trim();
      }

      // Check next sibling text
      if (!labelText && input.nextSibling) {
        labelText = input.nextSibling.textContent?.trim() || '';
      }

      // Check next element sibling
      if (!labelText && input.nextElementSibling) {
        labelText = input.nextElementSibling.textContent?.trim() || '';
      }

      // Check parent's text (for spans wrapping option text)
      if (!labelText) {
        const parent = input.parentElement;
        if (parent && parent.tagName !== 'FORM' && parent.tagName !== 'FIELDSET') {
          const clone = parent.cloneNode(true);
          clone.querySelectorAll('input').forEach(i => i.remove());
          labelText = clone.textContent.trim();
        }
      }

      if (labelText && labelText.length < 300 && !options.includes(labelText)) {
        options.push(labelText);
      }
    });

    // If no radio/checkbox options, check for list items or option divs
    if (options.length === 0) {
      const listItems = container.querySelectorAll(
        'li, .option, [class*="option"], [class*="choice"], [class*="answer-option"]'
      );
      listItems.forEach(li => {
        if (li.closest('#ai-study-sidebar')) return;
        const text = li.textContent.trim();
        if (text.length > 0 && text.length < 300 && !options.includes(text)) {
          options.push(text);
        }
      });
    }

    return options;
  }

  // ===== Autofill Logic =====

  function fillAnswer(questionIndex, answerText, questionsData) {
    if (!questionsData || !questionsData[questionIndex]) return false;

    const qData = questionsData[questionIndex];
    const container = findQuestionContainer(qData.question);
    if (!container) return false;

    // Try radio buttons first
    const radios = container.querySelectorAll('input[type="radio"]');
    if (radios.length > 0) return fillRadio(radios, answerText, container);

    // Try checkboxes
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) return fillCheckbox(checkboxes, answerText, container);

    // Try textarea
    const textarea = container.querySelector('textarea');
    if (textarea) return fillTextInput(textarea, answerText);

    // Try text input
    const textInput = container.querySelector('input[type="text"], input:not([type])');
    if (textInput) return fillTextInput(textInput, answerText);

    return false;
  }

  function findQuestionContainer(questionText) {
    const allElements = document.querySelectorAll(
      'p, h1, h2, h3, h4, li, label, legend, ' +
      '.question, .question-text, [class*="question"]'
    );
    for (const el of allElements) {
      if (el.closest('#ai-study-sidebar')) continue;
      if (el.textContent.trim() === questionText) {
        return el.closest(
          '.question, .quiz-item, .assessment-item, .question-container, ' +
          '[class*="question"], form, fieldset, .form-group, div'
        ) || el.parentElement;
      }
    }
    return null;
  }

  function fillRadio(radios, answerText, container) {
    const answerLower = answerText.toLowerCase().trim();
    for (const radio of radios) {
      const labelText = getInputLabel(radio, container).toLowerCase();
      if (labelText.includes(answerLower) || answerLower.includes(labelText) || fuzzyMatch(labelText, answerLower)) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        radio.dispatchEvent(new Event('input', { bubbles: true }));
        radio.click();
        return true;
      }
    }
    return false;
  }

  function fillCheckbox(checkboxes, answerText, container) {
    const answerLower = answerText.toLowerCase().trim();
    let filled = false;
    const answerParts = answerLower.split(',').map(s => s.trim());

    for (const cb of checkboxes) {
      const labelText = getInputLabel(cb, container).toLowerCase();
      const shouldCheck = answerParts.some(part =>
        labelText.includes(part) || part.includes(labelText) || fuzzyMatch(labelText, part)
      );
      if (shouldCheck) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        cb.dispatchEvent(new Event('input', { bubbles: true }));
        filled = true;
      }
    }
    return filled;
  }

  function fillTextInput(input, answerText) {
    input.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(
      input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeSetter) {
      nativeSetter.call(input, answerText);
    } else {
      input.value = answerText;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    return true;
  }

  function getInputLabel(input, container) {
    if (input.id) {
      const label = container.querySelector(`label[for="${input.id}"]`);
      if (label) return label.textContent.trim();
    }
    const parentLabel = input.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();
    if (input.nextSibling && input.nextSibling.textContent) return input.nextSibling.textContent.trim();
    if (input.nextElementSibling) return input.nextElementSibling.textContent.trim();
    return '';
  }

  function fuzzyMatch(str1, str2) {
    if (str1.length < 3 || str2.length < 3) return false;
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    let matches = 0;
    for (const w1 of words1) {
      if (w1.length < 3) continue;
      if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) matches++;
    }
    return matches >= Math.min(2, words1.length);
  }

  // Public API
  return {
    debounce,
    throttle,
    detectVideo,
    detectNextButton,
    detectQuiz,
    extractQuestions,
    fillAnswer,
    findQuestionContainer
  };

})();
