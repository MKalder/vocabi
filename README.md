## What is VocAbi?

VocAbi is a Chrome Extension that turns any webpage into a vocabulary learning environment. You highlight a word or phrase while reading — VocAbi translates it using a **locally hosted LLM** (Ollama), explains it in context, and saves it to your personal vocabulary deck. You then review your vocabulary using the **SM-2 Spaced Repetition algorithm**, the same method behind Anki.

No external AI APIs. No subscription. No data leaving your server.

---

## Product Vision

> **"Learn vocabulary the way the brain actually works — in context, at the moment of encounter, and exactly when the time is right to review."**

Most vocabulary learning tools are disconnected from real reading. You either interrupt your flow to look something up, or you lose the word entirely. VocAbi solves this by meeting you where you already are: in your browser, reading real content in a foreign language.

The long-term vision is a tool that:

- **Captures** vocabulary passively, from any webpage, without breaking your reading flow
- **Explains** words intelligently, using the actual sentence they appeared in as context
- **Reviews** them at the scientifically optimal moment using Spaced Repetition
- **Runs entirely on your own infrastructure** — your data, your model, your control
- **Scales** to support multiple users, language pairs, and learning styles

VocAbi is not a translation tool. It is a **personal language acquisition system** built into the browser.

---

## Target Audience

### Primary: Adult Independent Language Learners

People who are actively learning a foreign language outside of formal education. They read articles, news, and long-form content in their target language and want an effortless way to capture and retain new vocabulary without switching tools.

**Characteristics:**

- Learning English, German, French, Spanish, or other languages independently
- Reading real-world content (news, Wikipedia, technical docs, books)
- Frustrated by the gap between "I looked it up" and "I actually learned it"
- Comfortable installing a browser extension
- Values privacy — prefers tools that don't send data to external services

### Secondary: Technical Professionals & Developers

People who read technical documentation, papers, or content in a second language. They often encounter domain-specific vocabulary that generic translation tools handle poorly.

**Characteristics:**

- Software developers, engineers, researchers reading in English (or other languages)
- Want concise, context-aware explanations — not just raw translations
- Interested in self-hosted, open-source tooling

### Future: Language Teachers & Students

With multi-user support and class management features, VocAbi could serve teachers who want to assign vocabulary from real readings, and students who need to build vocabulary for specific domains.

---

## Core Features

| Feature                                 | Status |
| --------------------------------------- | ------ |
| Highlight word/phrase → get translation | ✅     |
| Context-aware LLM explanation           | ✅     |
| SM-2 Spaced Repetition                  | ✅     |
| Word highlighting on visited pages      | ✅     |
| Flashcard learning mode                 | ✅     |
| Vocabulary dashboard with filters       | ✅     |
| Dark mode & settings persistence        | ✅     |
| Right-click context menu                | ✅     |
| Multi-language support                  | ✅     |
| User authentication                     | 🔜     |
| Multi-user support                      | 🔜     |

---

## Architecture Overview

```
Browser Extension (Manifest V3)
        │
        │ HTTPS POST /translate
        ▼
     nginx (Reverse Proxy + TLS)
        │
        ▼
  Node.js / Express API
        │
        ├──► PostgreSQL Job Queue (pending → processing → done)
        │
        ├──► Ollama (local LLM — qwen2.5:latest)
        │
        └──► SSE Stream ──► Browser (structured result)
```

The pipeline is fully asynchronous. The browser receives a `jobId` immediately, opens a Server-Sent Events connection, and receives the result as soon as Ollama finishes — without any polling.

---

## Tech Stack

| Layer             | Technology                           |
| ----------------- | ------------------------------------ |
| Browser Extension | Chrome Manifest V3, Vanilla JS       |
| Backend           | Node.js 18+, Express 5               |
| Database          | PostgreSQL 14+                       |
| LLM               | Ollama (self-hosted), qwen2.5:latest |
| Reverse Proxy     | nginx + Let's Encrypt                |
| Process Manager   | pm2                                  |
| Deployment        | rsync                                |

---

## Project Structure

```
vocabi/
├── vocabi-extension/          # Chrome Extension
│   ├── manifest.json
│   ├── background.js          # Service Worker, Context Menu
│   ├── content.js             # Selection, Tooltip, Highlighting, SSE
│   └── dashboard/
│       ├── dashboard.html
│       ├── dashboard.css
│       └── dashboard.js
│
└── node/                      # Node.js Backend
    ├── server.js
    ├── config.js
    ├── routes/
    │   ├── translate.js       # POST /translate, GET /stream/:id
    │   └── vocabulary.js      # CRUD + SM-2 review
    ├── services/
    │   ├── ollamaService.js   # LLM prompt + call
    │   ├── queueService.js    # Worker loop + recovery
    │   └── parserService.js   # Markdown → structured fields
    └── db/
        ├── pool.js
        └── translations.js    # All SQL queries
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- PostgreSQL >= 14
- Ollama installed and running locally
- nginx
- pm2 (`npm install -g pm2`)

### Backend Setup

```bash
# Clone the repo
git clone https://github.com/your-username/vocabi.git
cd vocabi/node

# Install dependencies
npm install

# Configure credentials
cp config.example.js config.js
# Edit config.js with your DB credentials and Ollama URL

# Create the database
psql -U postgres -c "CREATE DATABASE vocabi;"

# Run migrations (or execute schema.sql manually)
psql -U postgres -d vocabi -f schema.sql

# Start the server
pm2 start server.js --name vocabi-server
pm2 save
pm2 startup
```

### config.js for Ollama

```js
export const config = {
    port: 3000,
    model: '<SLECET_A_MODEL>',
    ollamaUrl: 'http://127.0.0.1:11434/api/generate',
    db: {
        host: 'localhost',
        port: 5432,
        database: '<DB_NAME>',
        user: '<USER_NAME>',
        password: '<PASSWORD>'
    }
};
```

### nginx Configuration

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    location /translate {
        proxy_pass http://127.0.0.1:3000;
        proxy_buffering off;        # required for SSE
        proxy_read_timeout 220s;
    }

    location /vocabulary {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

### Browser Extension

1. Open `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked** → select `vocabi-extension/`
4. Update `API_URL` and `API_BASE` in `content.js` to point to your domain

---

## API Reference

| Method | Endpoint                 | Description               |
| ------ | ------------------------ | ------------------------- |
| POST   | `/translate`             | Create a translation job  |
| GET    | `/stream/:id`            | SSE — wait for job result |
| GET    | `/vocabulary`            | All completed vocabulary (not implemented yet) |
| GET    | `/vocabulary/stats`      | Aggregate counts (not implemented yet)         |
| GET    | `/vocabulary/sm2-stats`  | Spaced repetition stats (not implemented yet)  |
| PATCH  | `/vocabulary/:id/review` | Submit SM-2 review rating |
| DELETE | `/vocabulary/:id`        | Delete an entry           |

---

## Roadmap

### Now — MVP Completion

### Next — Product Polish

- [ ] Vocabulary detail view
- [ ] CORS restriction to extension ID
- [ ] Dashboard login flow
- [ ] Job retry mechanism (max 3 attempts)

### Later — Growth Features

- [ ] Vocabulary export (CSV, Anki format)
- [ ] Keyboard shortcuts
- [ ] Offline indicator
- [ ] Uptime monitoring
- [ ] Smart highlighting (lemmatization)
- [ ] Account linking (Google + GitHub)
- [ ] Multi-user support

---

## Security

- All traffic over HTTPS (Let's Encrypt)
- Prepared statements throughout — SQL injection not possible
- Input sanitizing and whitelists on all endpoints
- Prompt injection protection in LLM prompts
- CSP-compliant extension (no inline scripts)
- Vocabulary data never leaves your server
