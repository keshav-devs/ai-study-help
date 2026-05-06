Create a production-ready Chrome Extension (Manifest V3) called **"AI Study Assistant"** that helps users accelerate low-value online learning workflows using semi-automation and AI assistance.

The extension should be stable, lightweight, modern, and deployment-ready.

---

# 🎯 MAIN WORKFLOW

1. User opens a course page.
2. User clicks **Start Automation** in the extension popup.
3. Extension scans the current course page.
4. If a video is detected:
   - Automatically set playback speed to 3x.
   - Continuously maintain that speed if the site resets it.
5. If PPT/slides/pages are detected:
   - Detect when a Next button becomes available.
   - Show a floating “Next ▶” helper button.
   - Clicking helper triggers native next-page action.
6. If a quiz/assessment is detected:
   - Open a right-side AI Sidebar.
   - Extract questions and options from DOM.
   - Send extracted questions to AI backend.
   - Display concise suggested answers.
   - Provide:
     - “Fill Answer” button per question
     - “Fill All” button for all detected answers
7. User reviews answers.
8. User manually submits quiz.
9. User can Stop Automation anytime.

---

# 🔒 IMPORTANT CONSTRAINTS

- DO NOT auto-submit quizzes.
- DO NOT bypass anti-cheat systems.
- DO NOT perform hidden background automation.
- Everything must remain user-visible and user-controlled.
- Focus on stability and smooth UX.

---

# 🧩 REQUIRED TECH STACK

## Chrome Extension
- Manifest V3
- Vanilla JavaScript (ES6+)
- Lightweight architecture
- No React or heavy frameworks

## Backend
- Node.js + Express
- REST API endpoint for AI requests
- Use OpenAI API (gpt-4o-mini or latest efficient model)

---

# 📁 REQUIRED FILE STRUCTURE

extension/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── popup.css
├── sidebar.html
├── sidebar.js
├── sidebar.css
├── options.html
├── options.js
├── utils.js
├── icons/

backend/
├── server.js
├── package.json
├── .env.example

---

# ⚙️ FEATURES (DETAILED)

## 1) Popup UI
Create a clean popup with:
- Start Automation button
- Stop Automation button
- Current status indicator
- Current detected mode:
  - Video
  - Slides
  - Quiz

Persist state using chrome.storage.session.

---

## 2) Video Automation
Detect HTML5 videos.

Requirements:
- playbackRate configurable from 1x–3x
- Default 3x
- Reapply speed every 1–2 seconds
- Hotkeys:
  - 1 → 1x
  - 2 → 2x
  - 3 → 3x

Example logic:

```js
const video = document.querySelector('video');
if(video){
  video.playbackRate = 3;
}
```

---

## 3) Smart Next Helper
Detect next buttons using selectors:
- button.next
- .next-btn
- [aria-label="Next"]
- button[title*="Next"]

Requirements:
- Only show helper when next button exists and is enabled.
- Floating bottom-right helper.
- Rounded modern UI.
- High z-index.
- Trigger native click event.

---

## 4) Quiz Detection
Detect quizzes using:
- Keywords:
  - quiz
  - assessment
  - question
  - submit
- Presence of:
  - radio buttons
  - checkboxes
  - textarea

Use debouncing to avoid repeated triggers.

---

## 5) Question Extraction
Extract likely questions and options from:
- p
- h1–h4
- li
- label
- nearby input elements

Rules:
- Strings > 20 chars
- Questions ending with '?'
- Limit to top 10–15

Return structured JSON:

```json
[
  {
    "question": "...",
    "options": ["A", "B", "C"]
  }
]
```

---

## 6) AI Sidebar
Inject modern right-side panel.

Requirements:
- Width: 320–360px
- Dark theme
- Scrollable
- Sections:
  - Detected Questions
  - AI Suggestions

Each answer card must include:
- Suggested answer
- Confidence label
- Copy button
- Fill Answer button

Global button:
- Fill All Answers

Loading states required.

---

## 7) Autofill Logic (IMPORTANT)
Implement assistive autofill ONLY.

Requirements:
- Match AI answers with:
  - radio inputs
  - checkboxes
  - textareas
  - text inputs
- Simulate normal visible user interactions.
- Fill answers but NEVER submit forms.

---

## 8) Notifications
Use chrome.notifications.

Examples:
- “Quiz detected — AI assistant ready”
- “Video speed set to 3x”

---

## 9) Options Page
Create settings page with:
- Backend API URL
- Playback speed
- Theme toggle

Persist using chrome.storage.sync.

---

# 🔐 AI BACKEND REQUIREMENTS

Create Express backend with:

POST /api/answers

Input:
```json
{
  "questions": []
}
```

Backend should:
- Read OpenAI API key from .env
- Call OpenAI securely server-side
- Use efficient model
- Return concise answers

Response:
```json
{
  "answers": []
}
```

Include:
- Error handling
- Rate limiting
- CORS support
- Environment validation

---

# 🧠 PERFORMANCE REQUIREMENTS

- Use MutationObserver where appropriate.
- Safe intervals only:
  - 1500–3000ms
- Clear intervals on Stop.
- Prevent duplicate sidebar injection.
- Avoid memory leaks.

---

# 🎨 UI/UX REQUIREMENTS

Design style:
- Modern
- Minimal
- Dark theme
- Rounded corners
- Soft shadows
- Smooth transitions

Floating helper buttons should look premium.

---

# 📦 REQUIRED OUTPUT

Generate:
1. Complete extension source code
2. Complete backend source code
3. Working manifest.json
4. Installation instructions
5. How to load unpacked extension
6. How to run backend
7. Example .env file
8. Inline comments explaining critical logic

---

# 🚀 MAIN GOAL

Build a stable, semi-automated AI-powered learning assistant that:
- speeds up videos
- helps navigate course pages
- detects quizzes
- suggests answers using AI
- autofills answers
- remains user-controlled
- is robust and deployment-ready
- can later be customized for platforms like Infosys Springboard