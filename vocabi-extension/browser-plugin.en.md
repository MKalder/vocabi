# Browser Plugin – Documentation

## Overview

This script implements a lightweight browser extension (Chrome Extension) feature that allows users to translate selected text on any webpage. When the user selects a valid text fragment, a floating action icon appears. Clicking the icon sends the selection to a backend API, which processes the translation asynchronously and returns the result via Server-Sent Events (SSE).

## Key Features

- Text selection detection in the browser
- Inline UI (floating action icon + tooltip)
- Basic validation of selected text
- Context extraction from surrounding sentence
- Async translation via backend API
- Real-time result streaming via SSE (`EventSource`)
- Chrome extension message support

## Architecture

The system consists of three main parts:

### 1. UI Layer (DOM Overlay)

- Floating circular icon (`icon`)
- Tooltip for feedback and results (`tooltip`)

### 2. Selection Layer

- Detects user text selection (`mouseup`)
- Validates and extracts context

### 3. API Layer

- Sends translation request (`fetch`)
- Receives async result via SSE (`EventSource`)

## Constants

```js
const API_URL = "https://api.prodowner.de/translate";
```

Base endpoint for:

- `POST /translate` → create translation job
- `GET /stream/:jobId` → SSE stream for result updates

## UI Components

### Floating Icon

Represents the "translate action trigger".

- Position: absolute near selection
- Visibility: temporary (auto-hide after 3 seconds)
- Style: circular purple button with "V"

### Tooltip

Used for:

- Errors
- Loading state
- Translation result

Displays near selected text or icon depending on state.

## Core Functions

### showIcon(rect)

Displays the floating action icon near the selected text.

### showError(message, rect)

Displays temporary error message in tooltip.

### analyzeSelection(text)

Validates selected text.

Rules:

- Too short (<2 chars)
- Numbers only
- Max 7 words

### extractContext(range)

Extracts sentence-level context from DOM text.

### sendToAPI(selection)

Sends POST request and receives jobId.

### waitForResult(jobId, rect)

Uses SSE (EventSource) to stream translation result.

## Event Flow

1. User selects text
2. Validation runs
3. Icon appears
4. User clicks icon
5. API request is sent
6. SSE streams result
7. Tooltip updates

## Chrome Extension Integration

Supports external trigger:

```js
chrome.runtime.onMessage.addListener(...)
```

Action:

```json
{ "action": "translate" }
```

## State

- savedSelection → stores last valid selection
- iconTimeout → controls icon visibility

## UX Behavior

- Icon auto-hides after 3s
- Tooltip auto-hides after 2s (errors)
- Click outside closes UI

## Error Handling

- API failure → "Error sending request."
- SSE failure → "Connection error."
- Validation failure → inline tooltip message

## Limitations

- Max 7 words per selection
- Regex-based sentence detection
- No persistent storage
- Basic context extraction only

## Future Improvements

- NLP-based context detection
- Translation history storage
- Smart positioning near viewport edges
- Keyboard shortcut support
- Offline caching

## Summary

A lightweight Chrome extension feature enabling fast in-page translation using selection-based interaction and real-time backend streaming.
