/**
 * utils.js — Shared utility functions for the content script
 * 
 * Handles question extraction, autofill logic, and DOM helpers.
 */

const StudyUtils = (() => {

  /**
   * Debounce helper — prevents rapid re-firing of detection functions
   */
  function debounce(fn, delay = 1500) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  /**
   * Detect HTML5 video elements on the page
   */
  function detectVideo() {
    return document.querySelector('video');
  }

  /**
   * Detect "Next" navigation buttons using common selectors
   */
  function detectNextButton() {
    const selectors = [
      'button.next',
      '.next-btn',
      '[aria-label="Next"]',
      'button[title*="Next"]',
      'a.next',
      '.next-button',
      '[data-action="next"]',
      'button:not([disabled])'
    ];

    for (const sel of selectors) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        const text = el.textContent.trim().toLowerCase();
        if (
          sel !== 'button:not([disabled])' ||
          text.includes('next') ||
          text.includes('continue') ||
          text.includes('proceed')
        ) {
          if (!el.disabled && el.offsetParent !== null) {
            return el;
          }
        }
      }
    }
    return null;
  }

  /**
   * Detect if the current page contains a quiz / assessment
   * Checks for quiz-related keywords and form elements
   */
  function detectQuiz() {
    const bodyText = document.body.innerText.toLowerCase();
    const keywords = ['quiz', 'assessment', 'question', 'submit', 'exam', 'test', 'evaluate'];
    const hasKeywords = keywords.some(kw => bodyText.includes(kw));

    const hasRadios = document.querySelectorAll('input[type="radio"]').length > 0;
    const hasCheckboxes = document.querySelectorAll('input[type="checkbox"]').length > 0;
    const hasTextareas = document.querySelectorAll('textarea').length > 0;

    // Need at least a keyword AND some form inputs
    return hasKeywords && (hasRadios || hasCheckboxes || hasTextareas);
  }

  /**
   * Extract questions and their options from the DOM
   * Returns structured JSON array of { question, options }
   */
  function extractQuestions() {
    const questions = [];
    const seen = new Set();

    // Collect candidate question elements
    const questionSelectors = 'p, h1, h2, h3, h4, li, label, .question, .quiz-question, [class*="question"]';
    const elements = document.querySelectorAll(questionSelectors);

    elements.forEach(el => {
      const text = el.textContent.trim();

      // Filter: must be > 20 chars or end with '?'
      if (text.length < 20 && !text.endsWith('?')) return;
      if (text.length > 500) return; // too long, probably a paragraph
      if (seen.has(text)) return;
      seen.add(text);

      // Try to find associated options (radio/checkbox labels nearby)
      const options = extractOptionsNear(el);

      questions.push({
        question: text,
        options: options
      });
    });

    // Limit to top 15 questions
    return questions.slice(0, 15);
  }

  /**
   * Find option labels near a question element
   * Looks for radio buttons, checkboxes, and their labels in sibling/child elements
   */
  function extractOptionsNear(questionEl) {
    const options = [];
    const container = questionEl.closest('.question, .quiz-item, .assessment-item, form, fieldset') || questionEl.parentElement;
    if (!container) return options;

    // Look for labeled inputs
    const inputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    inputs.forEach(input => {
      let labelText = '';

      // Check for associated label element
      const labelEl = container.querySelector(`label[for="${input.id}"]`);
      if (labelEl) {
        labelText = labelEl.textContent.trim();
      } else {
        // Check if input is inside a label
        const parentLabel = input.closest('label');
        if (parentLabel) {
          labelText = parentLabel.textContent.trim();
        }
      }

      // Also check next sibling text
      if (!labelText && input.nextSibling) {
        labelText = input.nextSibling.textContent?.trim() || '';
      }

      if (labelText && !options.includes(labelText)) {
        options.push(labelText);
      }
    });

    // If no radio/checkbox options, check for list items
    if (options.length === 0) {
      const listItems = container.querySelectorAll('li, .option, [class*="option"], [class*="choice"]');
      listItems.forEach(li => {
        const text = li.textContent.trim();
        if (text.length > 0 && text.length < 200) {
          options.push(text);
        }
      });
    }

    return options;
  }

  /**
   * Autofill a single answer into the page
   * Matches the AI answer text against available options and selects/fills the best match
   */
  function fillAnswer(questionIndex, answerText, questionsData) {
    if (!questionsData || !questionsData[questionIndex]) return false;

    const qData = questionsData[questionIndex];
    const container = findQuestionContainer(qData.question);
    if (!container) return false;

    // Try radio buttons first
    const radios = container.querySelectorAll('input[type="radio"]');
    if (radios.length > 0) {
      return fillRadio(radios, answerText, container);
    }

    // Try checkboxes
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      return fillCheckbox(checkboxes, answerText, container);
    }

    // Try textarea
    const textarea = container.querySelector('textarea');
    if (textarea) {
      return fillTextInput(textarea, answerText);
    }

    // Try text input
    const textInput = container.querySelector('input[type="text"], input:not([type])');
    if (textInput) {
      return fillTextInput(textInput, answerText);
    }

    return false;
  }

  /**
   * Find the DOM container that contains a specific question text
   */
  function findQuestionContainer(questionText) {
    const allElements = document.querySelectorAll('p, h1, h2, h3, h4, li, label, .question, [class*="question"]');
    for (const el of allElements) {
      if (el.textContent.trim() === questionText) {
        return el.closest('.question, .quiz-item, .assessment-item, form, fieldset, div') || el.parentElement;
      }
    }
    return null;
  }

  /**
   * Fill a radio button by matching answer text to option labels
   */
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

  /**
   * Fill checkboxes by matching answer text to option labels
   */
  function fillCheckbox(checkboxes, answerText, container) {
    const answerLower = answerText.toLowerCase().trim();
    let filled = false;

    // Answer might contain multiple values separated by comma
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

  /**
   * Fill a text input or textarea by setting its value
   * Simulates normal user typing events
   */
  function fillTextInput(input, answerText) {
    // Focus the element
    input.focus();

    // Set the value using native setter to trigger React/Angular bindings
    const nativeSetter = Object.getOwnPropertyDescriptor(
      input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeSetter) {
      nativeSetter.call(input, answerText);
    } else {
      input.value = answerText;
    }

    // Dispatch events to simulate real user interaction
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

    return true;
  }

  /**
   * Get the label text for an input element
   */
  function getInputLabel(input, container) {
    // Try for= attribute
    if (input.id) {
      const label = container.querySelector(`label[for="${input.id}"]`);
      if (label) return label.textContent.trim();
    }

    // Try parent label
    const parentLabel = input.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();

    // Try next sibling
    if (input.nextSibling && input.nextSibling.textContent) {
      return input.nextSibling.textContent.trim();
    }

    // Try next element sibling
    if (input.nextElementSibling) {
      return input.nextElementSibling.textContent.trim();
    }

    return '';
  }

  /**
   * Simple fuzzy match: checks if strings share significant substrings
   */
  function fuzzyMatch(str1, str2) {
    if (str1.length < 3 || str2.length < 3) return false;
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    let matches = 0;
    for (const w1 of words1) {
      if (w1.length < 3) continue;
      if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
        matches++;
      }
    }
    return matches >= Math.min(2, words1.length);
  }

  // Public API
  return {
    debounce,
    detectVideo,
    detectNextButton,
    detectQuiz,
    extractQuestions,
    fillAnswer,
    findQuestionContainer
  };

})();
