# Vocabulary Learning System — MVP Definition

> AI-powered contextual vocabulary learning from real-world web content.

## Project Status

| Property     | Value                                     |
| ------------ | ----------------------------------------- |
| Version      | 0.3.0                                     |
| Status       | API, Ollama Translater and Browser Plugin |
| Last Updated | 2026-10-01                                |

## Vision

A personal local AI-powered language learning system that enables users to:

- Highlight content directly from the internet
- Save words, sentences, and paragraphs
- Generate context-aware translations
- Automatically create learning material using an LLM
- Learn vocabulary through real-world usage contexts
- Highlight already known words on websites

## MVP Goal

The MVP should prove that:

1. Content can be reliably collected from websites ✅
2. Context can be meaningfully preserved ✅
3. An LLM can generate quality learning material from it ✅
4. Users can effectively learn from the generated material
5. Previously learned words can later be recognized on websites

## Current State of Developement

- ✅ Browser Plugin → Icon, right click, validation, context
- ✅ Node.js API → Queue, SSE, sanitizing, separation of concerns
- ✅ Ollama Pipeline → Prompt, parser, sstructured DB
- ✅ PostgreSQL → translations table

## Workflow

- Plugin → POST /translate → Job in DB (pending)
- Plugin → GET /stream/:id → SSE Connection
- Worker → Ollama → done
- Server → push result

## Job Queue

![VocAbi Job Queue](/readme-assets/architecture/vocabi_queue_flow.svg)

## Core User Flow

```txt
User visits a website
        ↓
User highlights text
        ↓
Browser extension saves content
        ↓
Backend stores raw data
        ↓
Queue creates processing job
        ↓
LLM analyzes content
        ↓
Analysis is stored
        ↓
Web app displays learning material
        ↓
Spaced repetition begins
```

## MVP Features

1. Browser Extension
2. Backend API
3. Database
4. Queue System
5. LLM Worker
6. Web Application
7. Spaced Repetition
8. Highlight System

## Initial Tech Stack (Planed)

```txt
[ Browser Extension ]
        ↓
[ Node.js API (Express) ]
        ↓
[ PostgreSQL + Prisma ]
        ↓
[ Redis Queue ]
        ↓
[ Worker Service ]
        ↓
[ Ollama LLM ]
        ↓
[ PostgreSQL (Enriched Data) ]
        ↓
[ Next.js Web App ]
```
