# Vocabulary Learning System — Projektzusammenfassung & MVP

## Projektübersicht

Das Projekt ist ein AI-gestütztes Sprachlern-System, das Englischlernen direkt mit realen Inhalten aus dem Internet verbindet.

Der Nutzer kann beim Surfen auf Webseiten:

- einzelne Wörter,
- Sätze,
- oder ganze Absätze

markieren und dauerhaft speichern.

Die Inhalte werden anschließend:

- kontextbezogen analysiert,
- linguistisch verarbeitet,
- übersetzt,
- und automatisch in Lernmaterial umgewandelt.

Das System kombiniert dabei:

- Browser Extension,
- persönliche Wissensdatenbank,
- LLM-basierte Sprachverarbeitung,
- und ein Spaced-Repetition-Lernsystem.

Der Fokus liegt nicht auf isolierten Vokabeln, sondern auf:

- Lernen im echten Kontext,
- technischem Englisch,
- natürlichem Sprachgebrauch,
- und langfristiger Wiederholung.

⸻

Kernidee

Das System soll ermöglichen:

„Beim normalen Surfen im Internet automatisch wertvolle Sprachdaten zu sammeln und daraus personalisierte Lerninhalte zu generieren.“

Dadurch entsteht ein persönliches Sprachlern-Ökosystem, das sich kontinuierlich aus realem Content erweitert.

⸻

Hauptproblem, das gelöst wird

Klassische Vokabeltrainer leiden oft unter:

- isolierten Wörtern ohne Kontext,
- künstlichen Beispielsätzen,
- fehlender persönlicher Relevanz,
- geringer Wiederholung im Alltag,
- fehlendem technischen Englisch,
- geringer Langzeitmotivation.

Dieses System löst das Problem durch:

- Lernen aus echtem Internet-Content,
- kontextbezogene Speicherung,
- automatische Wiedererkennung bekannter Wörter,
- AI-generierte Übungen,
- und kontinuierliches passives Wiedersehen von Vokabeln.

⸻

Ziel des Systems

Das Ziel ist ein intelligentes Sprachlern-System, das:

- reale Inhalte verarbeitet,
- Lernmaterial automatisch erzeugt,
- persönliche Interessen berücksichtigt,
- technische Sprache versteht,
- und Lernen dauerhaft in den Alltag integriert.

⸻

Lernphilosophie

Das System basiert auf folgenden Prinzipien:

1. Context First

Wörter werden niemals isoliert betrachtet.

Beispiel:

Nicht:

property = Eigenschaft

Sondern:

All of the properties, methods, and events available...

Dadurch lernt der Nutzer:

- Satzmuster,
- Kollokationen,
- Fachsprache,
- Grammatik,
- und natürlichen Sprachgebrauch.

⸻

2. Passive Reinforcement

Bereits bekannte Wörter erscheinen erneut auf Webseiten.

Das erzeugt:

- passive Wiederholung,
- Wiedererkennung,
- unbewusstes Lernen,
- und stärkere Langzeitspeicherung.

⸻

3. Real-World Learning

Gelernt wird ausschließlich aus:

- echten Webseiten,
- echten Artikeln,
- echten Dokumentationen,
- echten Inhalten.

Nicht aus künstlichen Schulbuchsätzen.

⸻

4. Incremental Intelligence

Das System wird schrittweise intelligenter.

Phase 1:

- Speichern

Phase 2:

- Übersetzen

Phase 3:

- linguistische Analyse

Phase 4:

- adaptive Lernsysteme

⸻

Hauptkomponenten des Systems

Das System besteht aus mehreren Kernkomponenten.

⸻

1. Browser Extension

Die Browser Extension ist die wichtigste Komponente des Systems.

Sie integriert das Lernsystem direkt in das Internet.

⸻

Aufgaben der Extension

Inhalte markieren

Der Nutzer kann:

- Wörter,
- Sätze,
- Absätze

markieren.

⸻

Inhalte speichern

Speicherung via:

- Rechtsklick,
- Keyboard Shortcut,
- Kontextmenü.

⸻

Kontext erfassen

Gespeichert werden:

- markierter Text,
- umgebender Kontext,
- URL,
- Seitentitel,
- Sprache,
- Zeitstempel.

⸻

Highlighting

Bereits bekannte Wörter werden auf Webseiten hervorgehoben.

Optional:

- Highlight Toggle
- bekannte/unbekannte Wörter
- Schwierigkeitsfarben

⸻

DOM Integration

Die Extension manipuliert Webseiten dynamisch:

- ohne Inhalte zu zerstören,
- performant,
- und möglichst unsichtbar.

⸻

2. Backend API

Das Backend verwaltet:

- Speicherung,
- Authentifizierung,
- Datenzugriff,
- Queueing,
- Synchronisierung.

⸻

Aufgaben

Capture Management

Verwaltung aller gespeicherten Inhalte.

⸻

Vocabulary Management

Verwaltung bekannter Wörter.

⸻

Learning Data

Bereitstellung:

- Lernkarten,
- Wiederholungen,
- Statistiken,
- Fortschritt.

⸻

Queue Integration

Weiterleitung an AI-Worker.

⸻

3. PostgreSQL Datenbank

Die Datenbank speichert:

Rohdaten

Original markierte Inhalte.

⸻

Linguistische Daten

- Übersetzungen
- Difficulty
- Wortarten
- Themengebiete
- Grammatik

⸻

Lernstatus

- Wiederholungen
- Fortschritt
- bekannte Wörter
- SRS-Daten

⸻

4. Queue System

Da Ollama auf einem VPS ohne GPU läuft, erfolgt die Verarbeitung asynchron.

⸻

Flow

User markiert Inhalt
↓
Backend speichert sofort
↓
Job landet in Queue
↓
Worker verarbeitet später
↓
Analyse wird gespeichert

⸻

Vorteile

- bessere Performance
- keine Wartezeiten
- skalierbar
- robust

⸻

5. Ollama Worker

Der Worker verarbeitet Inhalte mit einem lokalen LLM.

⸻

Aufgaben

Linguistische Analyse

Erkennung von:

- schwierigen Wörtern,
- technischen Begriffen,
- Idiomen,
- Satzmustern,
- Grammatik.

⸻

Kontextanalyse

Das System erkennt:

- Themengebiet,
- technische Bedeutung,
- Schwierigkeitsgrad,
- Lernrelevanz.

⸻

Übersetzung

Kontext-sensitive Übersetzungen.

⸻

Lernmaterial

Automatische Generierung von:

- Cloze Tests,
- Flashcards,
- Satzübungen,
- Reverse Translation.

⸻

6. Web Application

Die Web-App ist die zentrale Lernoberfläche.

⸻

Aufgaben

Dashboard

Zeigt:

- neue Inhalte,
- offene Reviews,
- Lernstatistiken.

⸻

Vocabulary View

Zeigt:

- bekannte Wörter,
- Beispiele,
- Übersetzungen,
- Schwierigkeit.

⸻

Learning Mode

Zeigt:

- Lernkarten,
- Cloze Tests,
- Satzübungen.

⸻

Review System

Spaced Repetition:

- Again
- Hard
- Good
- Easy

⸻

Highlight System

Das Highlight-System ist eines der wichtigsten Features.

⸻

Ziel

Bekannte Wörter sollen beim Surfen sichtbar werden.

⸻

Beispiel

Auf einer Webseite erscheint:

properties
methods
events

Die Extension erkennt:

- bekannte Wörter,
- bereits gelernte Begriffe,
- schwierige Vokabeln.

Und markiert sie visuell.

⸻

Vorteile

- passive Wiederholung
- Wiedererkennung
- Kontext-Reaktivierung
- natürliches Lernen

⸻

MVP Definition

Das MVP fokussiert sich ausschließlich auf die Kernfunktionalität.

⸻

Ziel des MVP

Beweisen, dass:

- Inhalte zuverlässig gesammelt werden können,
- Kontext sinnvoll gespeichert werden kann,
- AI daraus Lernmaterial erzeugen kann,
- und Nutzer effektiv daraus lernen können.

⸻

MVP Features

Browser Extension

Enthalten

- Text markieren
- Speichern via Shortcut/Rechtsklick
- Highlight bekannter Wörter
- Toggle für Highlights

⸻

Backend

Enthalten

- REST API
- User Accounts
- JWT Auth
- Capture Speicherung

⸻

Datenbank

Enthalten

- Users
- Captures
- Vocabulary
- Sentence Analysis
- Learning Cards

⸻

Queue

Enthalten

- Redis
- BullMQ

⸻

Ollama Integration

Enthalten

- Kontextanalyse
- Übersetzung
- Wortextraktion
- Übungsgenerierung

⸻

Web-App

Enthalten

- Dashboard
- Vocabulary View
- Learning Mode
- Spaced Repetition

⸻

MVP Nicht enthalten

Diese Features kommen später:

- Audio
- Mobile Apps
- Semantic Search
- Embeddings
- AI Tutor
- Grammar Coaching
- Offline Mode
- Social Features
- Multiplayer Learning
- Adaptive Difficulty
- AI-generated Learning Paths

⸻

Empfohlener Tech Stack

Browser Extension

TypeScript
Manifest V3

⸻

Frontend

Next.js
React
Tailwind CSS

⸻

Backend

Node.js
Fastify
TypeScript

⸻

Datenbank

PostgreSQL
Prisma ORM

⸻

Queue

Redis
BullMQ

⸻

AI

Ollama
qwen2.5

⸻

Deployment

Ubuntu VPS
Docker
Nginx

⸻

Langfristige Vision

Langfristig soll das System:

- intelligente Lernpfade erzeugen,
- semantische Zusammenhänge verstehen,
- adaptive Übungen generieren,
- persönliche Schwächen erkennen,
- und als persönlicher AI-Sprachtutor fungieren.

Das System soll dabei kontinuierlich aus echtem Internet-Content lernen und wachsen.
