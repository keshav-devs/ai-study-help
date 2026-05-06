# AI Study Assistant

A production-ready Chrome Extension (Manifest V3) that helps users accelerate online learning workflows with semi-automation and AI assistance.

Powered by **NVIDIA NIM APIs** with a dual-model architecture for speed and reliability:
- ⚡ **Primary**: `deepseek-v4-flash` — fast, optimized for technical MCQs
- 🔄 **Fallback**: `llama-3.3-nemotron-super-49b-v1` — robust, broader knowledge

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎬 **Video Speed** | Auto-set playback to 3x with re-apply protection. Hotkeys: `1`/`2`/`3` |
| 📄 **Smart Next** | Floating "Next ▶" helper button for slide/page navigation |
| 🧠 **Quiz AI** | Detects quizzes, extracts questions, gets AI-suggested answers |
| ✏️ **Autofill** | Fill individual or all answers (never auto-submits) |
| 🔄 **Dual-Model** | Auto-fallback from primary → secondary model on failures |
| 📦 **Caching** | In-memory answer cache for repeated questions |
| 🏷️ **Model Badge** | Sidebar shows which model (Primary/Fallback/Cached) answered |
| ⚙️ **Settings** | Configurable backend URL, speed, and theme |

## 📁 Project Structure

```
CertAuto/
├── extension/                # Chrome Extension (Manifest V3)
│   ├── manifest.json         # Extension config
│   ├── background.js         # Service worker
│   ├── content.js            # Page injection & automation
│   ├── utils.js              # Detection & autofill utilities
│   ├── popup.html/js/css     # Extension popup UI
│   ├── sidebar.css           # AI sidebar styles
│   ├── options.html/js       # Settings page
│   └── icons/                # Extension icons
│
└── backend/                  # Express API Server
    ├── server.js             # Main server with /api/answers
    ├── package.json          # Dependencies
    └── .env.example          # Environment config template
```

## 🚀 Quick Start

### 1. Set up the Backend

```bash
cd backend
cp .env.example .env
# Edit .env and add your NVIDIA NIM API key (get one at https://build.nvidia.com)
npm install
npm start
```

The backend will run at `http://localhost:3000`.

On startup you'll see:
```
🚀 AI Study Assistant Backend v2.0 running on http://localhost:3000
   Primary model : deepseek-v4-flash
   Fallback model: llama-3.3-nemotron-super-49b-v1
   Timeout       : 15s
   Cache TTL     : 600s
```

### 2. Load the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. The extension icon appears in your toolbar

### 3. Usage

1. Navigate to any course/learning page
2. Click the extension icon → **Start Automation**
3. The extension will automatically detect:
   - **Video** → Speed set to 3x
   - **Slides** → Floating "Next" button appears
   - **Quiz** → AI sidebar opens with question extraction
4. For quizzes: click **Get AI Answers** → review → **Fill All** or individual fills
5. **You manually submit** the quiz when ready

## ⌨️ Hotkeys

| Key | Action |
|-----|--------|
| `1` | Set video speed to 1x |
| `2` | Set video speed to 2x |
| `3` | Set video speed to 3x |

## 🔒 Safety

- ❌ Never auto-submits quizzes
- ❌ No anti-cheat bypass
- ❌ No hidden background automation
- ✅ Everything is user-visible and user-controlled

## 🔧 Configuration

Open **Settings** from the extension popup to configure:

- **Backend API URL** — Where the Express server is running
- **Playback Speed** — Default video speed (1x–3x)
- **Theme** — Dark or Light sidebar

## 📡 API

### `POST /api/answers`

**Request:**
```json
{
  "questions": [
    {
      "question": "What is the capital of France?",
      "options": ["London", "Paris", "Berlin", "Rome"]
    }
  ]
}
```

**Response:**
```json
{
  "answers": [
    {
      "answer": "Paris",
      "confidence": "high"
    }
  ]
}
```

## 🛠 Tech Stack

- **Extension:** Manifest V3, Vanilla JS (ES6+)
- **Backend:** Node.js, Express, NVIDIA NIM API
- **Primary Model:** deepseek-v4-flash
- **Fallback Model:** llama-3.3-nemotron-super-49b-v1
- **Features:** 15s timeout + AbortController, in-memory caching, question deduplication
