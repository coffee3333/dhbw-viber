# MeetingAgent AI 🎓 — DHBW Student Manager & Lecture Recorder

**AI-powered Student Study Assistant & Lecture Recorder** designed specifically for **DHBW (Duale Hochschule Baden-Württemberg)** students. It connects directly to DHBW shared calendars (Rapla / Dualis), organizes lectures by subject, records lectures across **Zoom**, **Moodle (BigBlueButton)**, and **Microsoft Teams**, generates agentic AI study summaries, and synchronizes seamlessly with **Google Calendar**, **Google Tasks**, and **Google Drive**.

Built following production-grade FastAPI and Python best practices using **Astral `uv`**, **SQLAlchemy persistence**, and **multi-agent LLM orchestration**.

---

## 🌟 Key Features

### 📅 1. DHBW Schedule & Calendar Management
- **Rapla / Webcal / iCal URL Sync**: Paste your DHBW Rapla or Dualis calendar link (`webcal://` or `https://`) for automated recurring schedule updates.
- **Manual `.ics` File Upload**: Upload local timetable files exported from DHBW portals or exchange clients.
- **Cohort Code Stripping & Subject Clustering**: Intelligently cleans raw entries (e.g. `WWI22SEB - Software Engineering II (Prof. Dr. Schmidt)`) into clean canonical subjects, extracting lecturer names, physical campus room numbers, and direct Zoom/Teams meeting links.
- **Schedule Management**: Delete individual calendar sources, refresh live feeds, or clear the timetable anytime from the UI.
- **Interactive Google Calendar-Style UI**: Weekly, daily, and monthly views powered by FullCalendar 6 with dark mode and subject color tags.

### 🎙️ 2. Zero-Bot Universal Audio & Video Recorder
- **Dual-Stream Audio Mixing**: Records both **System Audio** (lecturer and remote attendees) and **Microphone** (your questions) in real time using the browser's Web Audio API.
- **Zero Bot Permissions**: Works client-side without requiring Zoom admin rights, Teams bot installations, or Moodle integration approvals.
- **One-Click Lecture Linking**: Automatically binds recordings and notes to the current or upcoming scheduled lecture.
- **Direct Video & Audio Uploads**: Supports `.mp4`, `.webm`, `.m4a`, `.mp3`, `.wav`, `.mkv` files.

### 🤖 3. Agentic AI Study Summarizer & Tutor
- **`MeetingOrchestrator`**: Orchestrates transcription, multi-stage semantic analysis, action item extraction, and cloud synchronization.
- **`SummarizerAgent`**: Produces academic lecture notes with executive summaries, core topics, technical formulas, exam-relevant takeaways, and homework action items with deadlines.
- **`ChatAgent`**: Chat directly with your lecture! Ask questions grounded exclusively in the lecture transcript.
- **Multi-Engine Speech-to-Text**:
  - **Google Gemini 2.0 Flash (Default)**: Multimodal native audio ingestion for fast, accurate German and English academic transcription.
  - **Local Whisper (`faster-whisper`)**: 100% offline, privacy-first transcription running directly on your CPU/GPU with no API keys.
  - **OpenAI Whisper API**: Cloud alternative.

### ☁️ 4. Google Workspace Integration
- **Google Calendar Sync**: Pushes all upcoming lectures to a dedicated personal Google Calendar ("DHBW Timetable") with room and link details.
- **Google Tasks Automation**: Automatically parses assignments, homework, and exam prep tasks from lecture notes and creates Google Tasks with due dates.
- **Google Drive Backup**: Automatically archives markdown study summaries, transcripts, and media files to `My Drive/DHBW/<Subject>/<Date_Lecture>/`.

### 🛡️ 5. Single-User Security Vault & Production Hardening
- **Single-User Master Passphrase (`APP_PASSWORD`)**: Set `APP_PASSWORD` in `.env` to enforce a lockscreen and authenticate all API routes via signed, encrypted `HttpOnly`, `SameSite=Lax` session cookies.
- **Brute-Force Rate Limiting**: Automatically limits repeated failed login attempts (5 attempts per 5 minutes per IP).
- **OAuth Token Encryption at Rest**: Encrypts Google OAuth `refresh_token` and `access_token` in the database using Fernet (AES-128-CBC + HMAC-SHA256) derived from `SECRET_KEY`.
- **Directory Traversal Protection**: Secure media file resolution preventing directory traversal attacks.
- **Security Headers Middleware**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection`, and `Referrer-Policy`.
- **Configurable CORS**: Tight origin control for production hosting.
- **Non-Root Docker Container**: Runs with minimal surface area and persistent data volumes.


---

## 🏗️ Dual-Application Architecture (MVVM + FastAPI)

```text
meeting-agent/
├── docker-compose.yml          # Dual-service container orchestration (backend:8000, frontend:3000)
├── run.sh                      # Unified launch script (FastAPI backend + React Vite dev server)
│
├── backend/                    # FASTAPI BACKEND APPLICATION
│   ├── main.py                 # Root backend entrypoint (Lifespan, security headers, SPA mounting)
│   ├── pyproject.toml          # Modern uv project dependencies (PEP 621)
│   ├── uv.lock                 # Fast deterministic lockfile
│   ├── .env & .env.example     # Backend environment configuration
│   ├── Dockerfile              # Production Debian-slim container with ffmpeg & uv
│   ├── run.sh                  # Backend standalone launch script
│   ├── data/                   # Persistent volume (meetings.db, recordings/)
│   └── app/                    # Modular Python application
│       ├── core/               # Database, settings, and security vault (Fernet tokens)
│       ├── models/             # SQLAlchemy ORM entities & Pydantic schemas
│       ├── api/v1/             # REST controllers (calendar, google, meetings, settings, chat, auth)
│       ├── services/           # Rapla parser, audio mixer, STT engines, Google Workspace
│       └── agents/             # Multi-agent orchestrator, lecture summarizer, tutor chat
│
└── frontend/                   # REACT VITE APPLICATION (MVVM Pattern)
    ├── package.json            # React 19, Vite 8, Zustand, Axios, Tailwind CSS, Lucide
    ├── vite.config.ts          # Vite configuration with Tailwind & backend proxy
    ├── Dockerfile & nginx.conf # Production Nginx container
    └── src/
        ├── types/              # MODEL LAYER (Domain entities & DTO contracts)
        ├── api/                # SEPARATE API LAYER (Axios client with Bearer & 401 interceptors)
        │   ├── client.ts       # Axios instance with request/response interceptors
        │   ├── authApi.ts      # Login, logout, status check
        │   ├── calendarApi.ts  # Rapla sync, .ics upload, schedule sources
        │   ├── meetingsApi.ts  # Audio uploads, live blobs, AI note exports
        │   ├── googleApi.ts    # Google OAuth, Calendar, Tasks & Drive sync
        │   └── settingsApi.ts  # Engine preferences & model selection
        ├── stores/             # ZUSTAND STORES (Data & password persistence)
        │   ├── useAuthStore.ts     # Auth state, login pass, session token persistence
        │   ├── useCalendarStore.ts # Schedule, lectures, subjects, active filters
        │   ├── useMeetingStore.ts  # Active recording, drawer, transcript, chat
        │   └── useSettingsStore.ts # Engine preferences & Google status
        ├── viewmodels/         # VIEWMODEL LAYER (Business logic, state binding & transitions)
        │   ├── useAuthViewModel.ts
        │   ├── useCalendarViewModel.ts
        │   ├── useLectureDrawerViewModel.ts
        │   ├── useRecorderViewModel.ts
        │   └── useAccountViewModel.ts
        ├── components/         # REUSABLE VIEW COMPONENTS
        │   ├── Navbar.tsx      # Page navigation, quick record, lock session button
        │   ├── CalendarGrid.tsx# Week, Day, Month interactive calendar grid
        │   ├── LectureDrawer.tsx# Summary, transcript, and AI tutor chat drawer
        │   ├── RecorderModal.tsx# Web Audio dual-stream recorder & file upload
        │   ├── ScheduleModal.tsx# Rapla URL sync & .ics file upload
        │   └── AuthLockscreen.tsx# Single-user master passphrase login screen
        └── pages/              # PAGE VIEWS
            ├── homePage/
            │   └── HomePage.tsx   # Main schedule, subjects filter, drawer & recorder
            └── accountPage/
                └── AccountPage.tsx# Google Workspace, AI models, and security settings
```


---

## 🚀 Quick Start Guide

### Prerequisites
- Python 3.12+
- [`uv`](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh` or `brew install uv`)
- [`ffmpeg`](https://ffmpeg.org/) (for local audio processing: `brew install ffmpeg` or `apt-get install ffmpeg`)

### 1. Clone & Configure Environment

```bash
cp .env.example .env
```

Edit `.env` to configure your keys:
- **`GEMINI_API_KEY`**: Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
- *(Optional)* For Google Calendar/Tasks/Drive sync, fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (see instructions below).

### 2. Run the Application

```bash
# Using the startup script:
./run.sh

# Or directly with uv:
uv run uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Open your browser at **[http://127.0.0.1:8000](http://127.0.0.1:8000)**.

---

## 📅 DHBW Calendar Setup

### Option A: Live Rapla / Dualis iCal URL (Recommended)
1. Open your DHBW Rapla schedule in your browser.
2. Click **iCal Export** / **Kalender exportieren** and copy the iCal or Webcal URL.
3. In MeetingAgent AI, click **"Manage Schedules"** in the top navigation bar.
4. Paste the URL into **"Sync from iCal / Rapla URL"** and click **"Sync Calendar URL"**.
5. Your lectures, rooms, online links, and subjects will appear instantly in the calendar!

### Option B: Upload `.ics` File
1. Download the `.ics` file from Rapla, Dualis, or your email calendar.
2. In MeetingAgent AI, click **"Manage Schedules"** -> drag and drop your file into **"Upload .ics Calendar File"**.
3. All lectures are parsed and populated.

### Schedule Management
- **Refresh All**: Click "Refresh All" to pull latest schedule updates from all registered URL sources.
- **Delete Source**: Delete a specific calendar source using the trash icon.
- **Clear All Data**: Reset your timetable anytime while preserving your recordings and lecture notes.

---

## ☁️ Google Workspace Setup (Calendar, Tasks, Drive)

To enable 1-click sync to your Google account:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (e.g. `dhbw-meeting-agent`).
3. Enable the following APIs under **APIs & Services > Library**:
   - **Google Calendar API**
   - **Google Tasks API**
   - **Google Drive API**
4. Configure the **OAuth Consent Screen** (User Type: *External*, add your own Google email as a *Test User*).
5. Go to **Credentials > Create Credentials > OAuth client ID**:
   - Application Type: **Web application**
   - Authorized redirect URIs: `http://localhost:8000/api/v1/google/oauth2callback` (or your production domain redirect URL).
6. Copy the **Client ID** and **Client Secret** into your `.env` file:
   ```env
   GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="your-client-secret"
   GOOGLE_REDIRECT_URI="http://localhost:8000/api/v1/google/oauth2callback"
   ```
7. In the Web UI, open **Settings** (gear icon) -> click **"Connect Google Account"** and grant access.

---

## 🐳 Docker Deployment

### Run with Docker Compose (Recommended)

```bash
docker compose up --build -d
```

- The app will be available at `http://localhost:8000`.
- Health checks automatically monitor `http://localhost:8000/health`.
- All database records and lecture recordings are persisted in the host `./data` folder.

### Run Standalone Container

```bash
docker build -t meeting-agent:latest .
docker run -d \
  --name meeting_agent_app \
  -p 8000:8000 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  meeting-agent:latest
```

---

## 🛡️ Production Security Checklist

When deploying to a public server or VPS:
- Set `APP_PASSWORD="your-strong-passphrase"` in `.env` to enforce master passphrase protection and lockscreen.
- Set `SECRET_KEY` in `.env` to a secure random 32+ character hex string (or let it auto-persist to `data/.secret_key`).
- Set `ALLOWED_ORIGINS` to your exact domain (e.g. `https://student.yourdomain.de`).
- Use an HTTPS reverse proxy (such as Caddy, Nginx, or Traefik) in front of port 8000.
- Update `GOOGLE_REDIRECT_URI` to your `https://` domain in Google Cloud Console and `.env`.

