# VocAbi — Entwicklungsdokumentation

**Stand:** Juni 2026  
**Typ:** Browser Extension + Backend API + LLM Pipeline  
**Ziel:** Kontextbewusstes Vokabellernen mit lokalem LLM und Spaced Repetition

---

## Inhaltsverzeichnis

1. [Produktvision](#1-produktvision)
2. [Technologie-Stack](#2-technologie-stack)
3. [Systemarchitektur](#3-systemarchitektur)
4. [Was bereits entwickelt wurde](#4-was-bereits-entwickelt-wurde)
5. [Datenbankschema](#5-datenbankschema)
6. [API-Referenz](#6-api-referenz)
7. [Projektstruktur](#7-projektstruktur)
8. [Deployment & Infrastruktur](#8-deployment--infrastruktur)
9. [Sicherheit](#9-sicherheit)
10. [Was noch entwickelt werden muss (MVP-Roadmap)](#10-was-noch-entwickelt-werden-muss-mvp-roadmap)
11. [Bekannte Limitierungen](#11-bekannte-limitierungen)

---

## 1. Produktvision

VocAbi ist eine Chrome Extension die es Nutzern ermöglicht, Wörter und Phrasen auf beliebigen Webseiten zu markieren und kontextbewusste Übersetzungen und Erklärungen zu erhalten. Die Vokabeln werden persistent gespeichert und können mit einem Spaced-Repetition-System (SM-2 Algorithmus) gelernt werden.

**Kernprinzipien:**
- Lernen im natürlichen Kontext — Vokabeln werden direkt beim Lesen gelernt
- Lokale KI — keine externen API-Kosten, keine Datenweitergabe an Dritte
- Wissenschaftlich fundiert — SM-2 Algorithmus für optimale Wiederholungsintervalle
- Minimale Friction — Wort markieren, Icon klicken, fertig

---

## 2. Technologie-Stack

| Bereich | Technologie | Begründung |
|---|---|---|
| Browser Extension | Manifest V3, Vanilla JS | Chrome-Standard, kein Framework-Overhead |
| Backend | Node.js, Express 5 | Async-first, einfache SSE-Integration |
| Datenbank | PostgreSQL 14 | Relational, ACID-konform, gut für Queue-Pattern |
| LLM | Ollama (lokal) | Keine API-Kosten, Datenschutz, volle Kontrolle |
| LLM-Modell | qwen2.5:latest (7.6B) | Gutes Preis-Leistungs-Verhältnis für Übersetzungen |
| Reverse Proxy | nginx | TLS-Terminierung, SSE-Buffering-Kontrolle |
| Prozessmanager | pm2 | Autostart, Logging, Zero-Downtime-Restart |
| HTTPS | Let's Encrypt / Certbot | Kostenlos, automatisch erneuerbar |

---

## 3. Systemarchitektur

### Hinweg — Anfrage

```
Browser Plugin (content.js)
  → Wort markieren, Icon anklicken
  → POST /translate (HTTPS)
  → nginx (Reverse Proxy, TLS)
  → Node.js API (Sanitizing, Validierung)
  → Job in PostgreSQL (status = pending)
  → Worker Loop (alle 2s, queueService.js)
  → Ollama API (LLM lokal)
  → Parser (Markdown → strukturierte Felder)
  → PostgreSQL (status = done, Felder gespeichert)
```

### Rückweg — Antwort via SSE

```
PostgreSQL (status = done)
  → Worker markiert Job als done
  → SSE Endpoint (GET /stream/:id, pollt DB alle 1s)
  → nginx (leitet SSE-Stream durch, Buffering deaktiviert)
  → Browser Plugin (EventSource empfängt Ergebnis)
  → Tooltip wird angezeigt
```

### Designentscheidungen

**Warum Job Queue statt synchroner Verarbeitung?**  
Ollama benötigt je nach Modell und Hardware 5–60 Sekunden pro Anfrage. Eine synchrone Verbindung würde bei mehreren gleichzeitigen Nutzern zu Timeouts führen. Die Queue entkoppelt Anfrage und Verarbeitung und macht das System robust gegen temporäre Ollama-Ausfälle.

**Warum SSE statt Polling?**  
Server-Sent Events halten eine einzige persistente HTTP-Verbindung offen. Der Server pusht das Ergebnis aktiv sobald es fertig ist. Polling würde alle N Sekunden einen neuen Request schicken — unnötiger Traffic und höhere Latenz.

**Warum Ollama lokal statt OpenAI/Anthropic?**  
Keine variablen API-Kosten, keine Datenweitergabe der Nutzervokabeln an externe Dienste, volle Kontrolle über Modellauswahl und Prompting.

---

## 4. Was bereits entwickelt wurde

### 4.1 Browser Extension (Manifest V3)

**Dateien:** `content.js`, `background.js`, `manifest.json`, `icons/`

**Implementierte Features:**

- **Text-Selektion abfangen** — `mouseup` Event Listener erkennt Textmarkierungen auf jeder Webseite
- **Validierung der Selektion** — min. 2 Zeichen, max. 7 Wörter, keine reinen Zahlen
- **Typ-Erkennung** — automatische Klassifizierung als `vocabulary` (1 Wort) oder `phrase` (2–7 Wörter)
- **Kontext-Extraktion** — der umgebende Satz wird aus dem DOM extrahiert und mitgesendet
- **Floating Icon** — erscheint rechts neben der Selektion, verschwindet nach 3 Sekunden automatisch
- **Fehler-Tooltip** — zeigt Validierungsfehler direkt neben der Selektion an
- **Rechtsklick-Menü** — Context Menu Eintrag "Add to VocAbi" über `chrome.contextMenus` API
- **SSE-Verbindung** — `EventSource` wartet auf das Ergebnis des Jobs
- **Tooltip** — zeigt das Ergebnis direkt auf der Webseite an
- **Dashboard-Öffnung** — Klick auf das Extension-Icon öffnet `dashboard/dashboard.html` als neuen Tab
- **Live-Update** — nach erfolgreichem Job wird das Dashboard per `chrome.runtime.sendMessage` informiert

**Sicherheit:**
- CSP-konform: kein Inline-JavaScript
- `chrome.storage.local` für Token-Speicherung vorbereitet

---

### 4.2 Node.js Backend

**Dateien:** `node/server.js`, `node/config.js`, `node/routes/`, `node/services/`, `node/db/`

#### routes/translate.js

- `POST /translate` — empfängt Markierungen, validiert, sanitiert und erstellt einen Job
- `GET /stream/:id` — SSE-Endpoint, pollt DB alle 1s und pusht Ergebnis wenn `status = done`

**Validierung & Sanitizing:**
- Typ-Prüfung aller Felder
- Whitelist für `targetLang` (`english`, `deutsch`, `french`, `spanish`)
- Whitelist für `type` (`vocabulary`, `phrase`)
- Längenbegrenzung: Text max. 100 Zeichen, Kontext max. 500 Zeichen, URL max. 2000 Zeichen
- Wortanzahl-Prüfung: max. 5 Wörter serverseitig

#### routes/vocabulary.js

- `GET /vocabulary` — gibt alle abgeschlossenen Jobs zurück (status = done), sortiert nach `created_at DESC`
- `GET /vocabulary/stats` — Gesamtanzahl, vocabulary_count, phrase_count
- `PATCH /vocabulary/:id/review` — verarbeitet eine Flashcard-Bewertung (hard/good/easy) mit SM-2 Algorithmus

#### services/ollamaService.js

Baut den Prompt kontextbewusst auf, unterscheidet zwischen `vocabulary` und `phrase`:

```
- vocabulary: Focus auf Bedeutung, Verwendung und Formen
- phrase: Prüft auf idiomatische Bedeutung jenseits des Wortsinns
```

Prompt-Struktur:
- Untrusted Content explizit markiert (Prompt Injection Schutz)
- Antwortformat erzwungen: Translation, Meaning, Example, Tip
- Antwort ausschließlich in der Zielsprache

#### services/queueService.js

- Worker Loop mit `setInterval` alle 2 Sekunden
- `FOR UPDATE SKIP LOCKED` in PostgreSQL verhindert Race Conditions bei parallelen Workern
- Fehlerbehandlung: bei Ollama-Fehler wird Job auf `status = failed` gesetzt mit Fehlermeldung

#### services/parserService.js

Zerlegt den Markdown-Output von Ollama in strukturierte Felder via Regex:

```
**Translation:** → translation
**Meaning:**     → meaning
**Example:**     → example
**Tip:**         → tip
```

#### services/sm2Service.js (integriert in vocabulary.js)

Implementierung des SM-2 Algorithmus:

```
hard: interval = 1, ease_factor -= 0.2 (min. 1.3)
good: interval = interval × ease_factor
easy: interval = interval × ease_factor × 1.3, ease_factor += 0.1 (max. 4.0)

mastered = true wenn ease_factor >= 3.0 AND interval_days >= 21
```

#### db/pool.js

PostgreSQL Connection Pool via `pg` Package.

#### db/translations.js

Alle SQL-Queries als dedizierte Funktionen:
- `insertJob(text, type, context, targetLang, sourceUrl)`
- `getJob(id)`
- `claimNextJob()` — atomares Update mit `FOR UPDATE SKIP LOCKED`
- `markDone(id, parsed)`
- `markFailed(id, error)`

---

### 4.3 Dashboard (Browser Extension Page)

**Dateien:** `vocabi-extension/dashboard/dashboard.html`, `dashboard.css`, `dashboard.js`

**Implementierte Panels:**

**Dashboard:**
- 4 KPI-Karten: Gesamt, Markiert, Zu lernen, Heute fällig
- "Zuletzt hinzugefügt" — letzte 4 Vokabeln mit Status und Datum
- "Nächste Reviews" — nächste 4 fällige Karten mit Intervall
- Live-Update wenn neue Vokabel über Plugin hinzugefügt wird

**Vokabeln:**
- Fortschrittslogik-Erklärung (Neu, Lernen, Markiert)
- Vollständige Vokabelliste aus der Datenbank
- Spalten: Vokabel, Bedeutung, Status, Hinzugefügt, Nächste Review, Aktion

**Flash Cards:**
- Einzelne Flashcard, zentriert, maximale Fokussierung
- Vorderseite: Wort + Typ-Badge
- Rückseite: Translation, Meaning, Example, Tip strukturiert
- Flip-Animation (CSS 3D Transform)
- Bewertungsbuttons: Schwer / Gut / Leicht
- SM-2 Review wird per `PATCH /vocabulary/:id/review` in DB persistiert
- Kompakter Fortschrittsbalken mit Label ("X von Y Karten")
- Auto-Flip Option (3 Sekunden)

**Settings:**
- Dark Mode Toggle
- "Nur fällige Karten" Filter
- Auto-Flip Toggle
- Lernintervall-Übersicht (1d / 3d / 7d)

**Technische Details:**
- Lädt echte Daten von `GET /vocabulary` beim Start
- `chrome.runtime.onMessage` Listener für Live-Updates
- Dark/Light Theme mit CSS Custom Properties
- Responsive (Mobile Toggle für Navigation)

---

### 4.4 Infrastruktur

**VPS:** Ubuntu 24, 1 vCore, Ollama lokal installiert

**nginx Konfiguration:**
- HTTP → HTTPS Redirect
- TLS mit Let's Encrypt (Certbot)
- Reverse Proxy für `/translate` und `/vocabulary`
- `proxy_buffering off` für SSE-Streams
- `proxy_read_timeout 220s` für lange Ollama-Anfragen

**pm2:**
- Autostart bei Serverrestart
- Logs unter `~/.pm2/logs/`
- Prozessname: `vocabi-server`

**Deployment:**
- `rsync` von lokalem Entwicklungsordner auf VPS
- `npm install` nach Deployment
- `pm2 restart vocabi-server`

---

## 5. Datenbankschema

### Tabelle: `translations`

```sql
CREATE TABLE translations (
  id              SERIAL PRIMARY KEY,
  input_text      TEXT NOT NULL,
  type            VARCHAR(20),           -- 'vocabulary' | 'phrase'
  context         TEXT,                  -- umgebender Satz
  target_lang     VARCHAR(50) NOT NULL,
  source_url      TEXT,
  status          VARCHAR(20) DEFAULT 'pending',  -- pending|processing|done|failed
  result          TEXT,                  -- roher Ollama-Output
  translation     TEXT,                  -- geparste Übersetzung
  meaning         TEXT,                  -- geparste Bedeutung
  example         TEXT,                  -- geparster Beispielsatz
  tip             TEXT,                  -- geparster Lerntipp
  error           TEXT,                  -- Fehlermeldung bei status=failed
  mastered        BOOLEAN DEFAULT FALSE,
  interval_days   INTEGER DEFAULT 1,
  ease_factor     FLOAT DEFAULT 2.5,
  review_count    INTEGER DEFAULT 0,
  next_review     TIMESTAMP DEFAULT NOW(),
  created_at      TIMESTAMP DEFAULT NOW()
);
```

**Status-Übergänge:**
```
pending → processing → done
                     → failed
```

---

## 6. API-Referenz

### POST /translate

Erstellt einen neuen Übersetzungs-Job.

**Request:**
```json
{
  "text": "serendipity",
  "type": "vocabulary",
  "context": "It was pure serendipity that brought them together.",
  "targetLang": "english",
  "sourceUrl": "https://example.com"
}
```

**Response:**
```json
{ "jobId": 42 }
```

---

### GET /stream/:id

SSE-Stream für Job-Ergebnis.

**Response Events:**
```
data: {"status":"done","result":"**Translation:** ..."}
data: {"status":"failed","error":"Ollama error: 500"}
```

---

### GET /vocabulary

Alle abgeschlossenen Vokabeln.

**Response:**
```json
[
  {
    "id": 42,
    "input_text": "serendipity",
    "translation": "Serendipität",
    "meaning": "...",
    "example": "...",
    "tip": "...",
    "type": "vocabulary",
    "mastered": false,
    "interval_days": 1,
    "ease_factor": 2.5,
    "review_count": 0,
    "next_review": "2026-06-01T00:00:00Z",
    "created_at": "2026-05-26T10:00:00Z"
  }
]
```

---

### GET /vocabulary/stats

Statistiken.

**Response:**
```json
{
  "total": "115",
  "vocabulary_count": "14",
  "phrase_count": "48"
}
```

---

### PATCH /vocabulary/:id/review

SM-2 Bewertung persistieren.

**Request:**
```json
{ "rating": "good" }
```

**Response:**
```json
{
  "interval_days": 3,
  "ease_factor": 2.5,
  "review_count": 1,
  "mastered": false,
  "next_review": "2026-06-02T00:00:00Z"
}
```

---

## 7. Projektstruktur

```
vocabi/
├── vocabi-extension/               # Chrome Extension
│   ├── manifest.json               # Manifest V3, Permissions
│   ├── background.js               # Service Worker, Context Menu, Dashboard-Öffnung
│   ├── content.js                  # Selektion, Icon, Tooltip, SSE
│   ├── popup.html                  # (veraltet, wird nicht mehr genutzt)
│   ├── icons/                      # icon16/32/48/128.png
│   └── dashboard/
│       ├── dashboard.html          # Extension Dashboard Page
│       ├── dashboard.css           # Styles mit CSS Custom Properties
│       └── dashboard.js            # State, Render-Funktionen, API-Calls
│
├── node/                           # Node.js Backend
│   ├── server.js                   # Express App, Middleware, Routen
│   ├── config.js                   # Konfiguration, DB-Credentials
│   ├── routes/
│   │   ├── translate.js            # POST /translate, GET /stream/:id
│   │   └── vocabulary.js           # GET /vocabulary, stats, PATCH review
│   ├── services/
│   │   ├── ollamaService.js        # Prompt-Bau, Ollama-Call
│   │   ├── queueService.js         # Worker Loop
│   │   └── parserService.js        # Markdown → Felder
│   ├── db/
│   │   ├── pool.js                 # PostgreSQL Pool
│   │   └── translations.js         # SQL Queries
│   └── package.json
│
└── docs/                           # Dokumentation
    ├── architecture.md
    ├── architecture-en.md
    └── vocabi-development-status.md
```

---

## 8. Deployment & Infrastruktur

### Voraussetzungen

```
VPS:        Ubuntu 24, min. 4GB RAM (für Ollama)
Node.js:    >= 18
PostgreSQL: >= 14
Ollama:     lokal installiert
nginx:      mit Certbot
pm2:        global installiert
```

### Deployment-Prozess

```bash
# Lokal → VPS synchronisieren
rsync -avz "/lokaler/pfad/vocabi/" marius@VPS-IP:/home/marius/vocabi-server/

# Auf dem VPS
cd ~/vocabi-server/node
npm install
pm2 restart vocabi-server
```

### Verfügbare Ollama-Modelle

| Modell | Größe | Verwendung |
|---|---|---|
| qwen2.5:latest | 7.6B | Aktiv — Hauptmodell |
| qwen2.5:14b | 14.8B | Verfügbar — höhere Qualität |
| granite4.1:3b | 3.4B | Verfügbar — schneller |
| qwen3.5:latest | 9.7B | Verfügbar |
| llama3.2:1b | 1.2B | Verfügbar — sehr schnell |

---

## 9. Sicherheit

| Schicht | Maßnahme | Status |
|---|---|---|
| Plugin | Validierung: max. 7 Wörter, min. 2 Zeichen, keine Zahlen | ✅ implementiert |
| nginx | HTTPS erzwungen, HTTP → HTTPS Redirect | ✅ implementiert |
| Node.js | Sanitizing, Typ-Prüfung, Whitelist für Sprachen und Typen | ✅ implementiert |
| Node.js | try/catch auf allen Route-Handlern | ✅ implementiert |
| PostgreSQL | Prepared Statements ($1, $2) — SQL Injection nicht möglich | ✅ implementiert |
| Ollama Prompt | Untrusted Content explizit markiert, Prompt Injection Schutz | ✅ implementiert |
| Auth | JWT + bcrypt + Google/GitHub SSO | ❌ noch nicht implementiert |
| Rate Limiting | nginx rate limiting | ❌ noch nicht implementiert |
| CORS | Aktuell `*` — sollte auf Extension-ID eingeschränkt werden | ⚠️ für MVP ausreichend |

---

## 10. Was noch entwickelt werden muss (MVP-Roadmap)

### 🔴 Kritisch — ohne diese Features kein Multi-User MVP

#### 10.1 Authentifizierung

**Warum kritisch:** Ohne Auth gehören alle Vokabeln niemandem. Jeder Nutzer sieht alle Daten aller anderen Nutzer.

**Was zu bauen ist:**

```
users Tabelle:
  id, email, password_hash, google_id, github_id, created_at

Endpoints:
  POST /auth/register   → Email + Passwort, bcrypt Hash
  POST /auth/login      → JWT ausstellen
  GET  /auth/google     → OAuth2 Flow starten
  GET  /auth/google/callback → JWT ausstellen
  GET  /auth/github     → OAuth2 Flow starten
  GET  /auth/github/callback → JWT ausstellen

Middleware:
  JWT-Validierung auf allen geschützten Endpoints

translations Tabelle:
  + user_id (Foreign Key → users.id)

Alle DB-Queries:
  + WHERE user_id = $1
```

**Pakete:**
```bash
npm install bcrypt jsonwebtoken passport passport-google-oauth20 passport-github2
```

**Plugin:**
- Login-Seite in der Extension
- Token in `chrome.storage.local` speichern
- `Authorization: Bearer <token>` Header bei jedem Request

---

#### 10.2 Rate Limiting

**Warum kritisch:** Ohne Rate Limiting kann ein einzelner Nutzer (oder Bot) Ollama mit Anfragen fluten und den Server für alle blockieren.

**nginx Konfiguration:**
```nginx
limit_req_zone $binary_remote_addr zone=vocabi:10m rate=10r/m;

location /translate {
    limit_req zone=vocabi burst=5 nodelay;
    ...
}
```

---

### 🟡 Wichtig — deutlich besser mit diesen Features

#### 10.3 Error Handling im Plugin

Aktuell zeigt das Plugin nur generische Fehlermeldungen. Sinnvoller wäre:
- Unterscheidung zwischen Netzwerkfehler, Server-Error und Timeout
- Retry-Logik bei temporären Fehlern
- Klare Meldung wenn der Job `failed` ist

#### 10.4 Dashboard Login-Flow

Das Dashboard muss nach der Auth-Implementierung:
- Login/Register-Seite anzeigen wenn kein Token vorhanden
- Token aus `chrome.storage.local` lesen und bei API-Calls mitsenden
- Bei 401-Response Token löschen und zu Login weiterleiten

#### 10.5 Vokabelliste — Detailansicht

Aktuell zeigt die Tabelle nur `input_text` und `translation`. Ein Klick auf eine Zeile sollte eine Detailansicht öffnen mit:
- Vollständiger `meaning`
- `example` Satz
- `tip`
- `context` (der Originalsatz)
- `source_url` als Link

#### 10.6 Vokabeln löschen

Aktuell gibt es keinen Delete-Endpoint und keinen Button im Dashboard.

```
DELETE /vocabulary/:id
```

---

### 🟢 Nice-to-have — für eine starke erste Version

#### 10.7 Mehrsprachigkeit im Dashboard

Das Dashboard ist aktuell auf Deutsch. Die `targetLang` aus dem Plugin sollte steuerbar sein — entweder pro Vokabel oder global in den Settings.

#### 10.8 Keyboard Shortcuts im Plugin

- `Escape` — Icon/Tooltip schließen
- Konfigurierbare Taste für schnellen Trigger

#### 10.9 Offline-Indikator

Wenn der VPS nicht erreichbar ist, sollte das Plugin eine klare Meldung zeigen statt stumm zu versagen.

#### 10.10 Export-Funktion

CSV oder Anki-Export der Vokabelliste für Nutzer die ihre Daten portieren wollen.

---

## 11. Bekannte Limitierungen

| Limitation | Beschreibung | Lösung |
|---|---|---|
| Ollama-Geschwindigkeit | Je nach Modell 5–60s Antwortzeit | Kleineres Modell wählen oder GPU nutzen |
| Kontext-Extraktion | Regex-basiert, funktioniert nicht bei komplexem HTML | NLP-basierte Extraktion |
| Keine Offline-Fähigkeit | Plugin funktioniert nur mit VPS-Verbindung | Service Worker Cache |
| Kein Account Linking | Google und GitHub SSO können nicht nachträglich verknüpft werden | Account Linking Flow |
| CORS auf `*` | Jeder kann die API ansprechen | Nach Auth auf Extension-ID einschränken |
| Kein Monitoring | Kein Alerting bei Server-Ausfall | Uptime-Monitoring (z.B. UptimeRobot) |
| `popup.html` veraltet | Datei existiert noch aber wird nicht mehr genutzt | Aufräumen |

---

## Zusammenfassung

```
✅ Fertig:          Browser Plugin, Backend API, Queue, SSE,
                    Ollama Pipeline, Parser, PostgreSQL,
                    SM-2 Algorithmus, Dashboard (4 Panels),
                    nginx, HTTPS, pm2

🔴 Kritisch fehlt:  Authentifizierung (Email + Google + GitHub SSO)
                    Rate Limiting

🟡 Wichtig fehlt:   Error Handling, Dashboard Login-Flow,
                    Detailansicht, Löschen-Funktion

🟢 Nice-to-have:    Mehrsprachigkeit, Keyboard Shortcuts,
                    Offline-Indikator, Export-Funktion
```

**Geschätzte Entwicklungszeit bis MVP (mit Auth + Rate Limiting):** 3–5 Tage

---

*Dokumentation erstellt: Juni 2026*  
*Autor: VocAbi Development Team*
