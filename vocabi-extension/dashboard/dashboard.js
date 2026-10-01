const API_BASE = 'https://api.prodowner.de';

// ── State ─────────────────────────────────────────────────────
const state = {
    theme: "light",
    dueOnly: true,
    flashLang: "all",
    autoFlip: false,
    highlightEnabled: true,
    currentPanel: "dashboard",
    currentCardIndex: 0,
    cards: [],
    filters: {
        status: "all",
        type: "all",
        lang: "all",
        search: ""
    },
    selectedIds: new Set()
};

// ── Hilfsfunktionen ───────────────────────────────────────────
const el = (sel) => document.querySelector(sel);
const els = (sel) => [...document.querySelectorAll(sel)];

const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });

const now = () => new Date();

function langLabel(lang) {
    const map = {
        english: 'Englisch',
        german: 'Deutsch',
        deutsch: 'Deutsch',
        french: 'Französisch',
        spanish: 'Spanisch',
        thai: 'Thailändisch'
    };
    return map[lang] || lang;
}

function statusOf(card) {
    if (card.mastered) return "Markiert";
    if (card.reviews === 0) return "Neu";
    return "Lernen";
}

function statusClass(card) {
    if (card.mastered) return "done";
    if (card.reviews === 0) return "new";
    return "";
}

// ── State persistieren ────────────────────────────────────────
function persistState() {
    chrome.storage.local.set({
        theme: state.theme,
        dueOnly: state.dueOnly,
        autoFlip: state.autoFlip,
        flashLang: state.flashLang,
        highlightEnabled: state.highlightEnabled,
        currentPanel: state.currentPanel
    });
}

// ── Beim Start: State aus Storage laden ───────────────────────
async function loadPersistedState() {
    const data = await chrome.storage.local.get([
        'theme', 'dueOnly', 'autoFlip', 'flashLang',
        'targetLang', 'highlightEnabled', 'vocabCache', 'currentPanel'
    ]);

    // State wiederherstellen
    if (data.theme) state.theme = data.theme;
    if (data.dueOnly !== undefined) state.dueOnly = data.dueOnly;
    if (data.autoFlip !== undefined) state.autoFlip = data.autoFlip;
    if (data.flashLang) state.flashLang = data.flashLang;
    if (data.highlightEnabled !== undefined) state.highlightEnabled = data.highlightEnabled;
    if (data.currentPanel) state.currentPanel = data.currentPanel;


    // Theme auf HTML-Element setzen
    document.documentElement.setAttribute("data-theme", state.theme);

    // UI-Elemente visuell korrekt setzen
    el("#dueOnlySwitch").classList.toggle("active", state.dueOnly);
    el("#autoFlipSwitch").classList.toggle("active", state.autoFlip);
    el("#darkSwitch").classList.toggle("active", state.theme === "dark");
    el("#highlightSwitch").classList.toggle("active", state.highlightEnabled);
    el("#flashLangSelect").value = state.flashLang || "all";
    if (data.targetLang) el("#targetLangSelect").value = data.targetLang;

    // Cache sofort rendern falls vorhanden (Stale-While-Revalidate)
    if (data.vocabCache && data.vocabCache.length > 0) {
        state.cards = data.vocabCache;
        rerender();
    }

    setPanel(state.currentPanel);
}

// ── Vokabeln laden (Stale-While-Revalidate) ───────────────────
async function loadVocabulary() {
    let cachedCards = null;

    // Schritt 1: Cache sofort anzeigen
    try {
        const cached = await chrome.storage.local.get('vocabCache');
        if (cached.vocabCache && cached.vocabCache.length > 0) {
            cachedCards = cached.vocabCache;
            state.cards = cachedCards;
            rerender();
        }
    } catch (err) {
        console.error('Cache lesen fehlgeschlagen:', err);
    }

    // Schritt 2: Frische Daten im Hintergrund holen
    try {
        const res = await fetch(`${API_BASE}/vocabulary`);
        const vocab = await res.json();

        state.cards = vocab.map(row => ({
            id: row.id,
            front: row.input_text,
            back: row.translation || '–',
            context: row.context || '',
            language: row.target_lang,
            tag: row.type,
            note: row.meaning || '',
            example: row.example || '',
            tip: row.tip || '',
            addedAt: row.created_at,
            mastered: row.mastered || false,
            interval: row.interval_days || 1,
            ease_factor: row.ease_factor || 2.5,
            review_count: row.review_count || 0,
            dueAt: row.next_review || row.created_at,
            reviews: row.review_count || 0
        }));

        // Schritt 3: Cache aktualisieren
        await chrome.storage.local.set({ vocabCache: state.cards });

        rerender();
    } catch (err) {
        console.error('Fehler beim Laden der Vokabeln:', err);
        // Falls API nicht erreichbar → gecachte Daten bleiben sichtbar
        if (!cachedCards) rerender();
    }
}

// ── SM-2 Statistiken laden ────────────────────────────────────
async function loadSm2Stats() {
    try {
        const res = await fetch(`${API_BASE}/vocabulary/sm2-stats`);
        const stats = await res.json();
        el("#statAvgEase").textContent = stats.avg_ease_factor || '–';
        el("#statAvgInterval").textContent = stats.avg_interval_days ? `${stats.avg_interval_days}d` : '–';
        el("#statMastered").textContent = stats.mastered_count || '0';
        el("#statNeverReviewed").textContent = stats.never_reviewed_count || '0';
    } catch (err) {
        console.error('Fehler beim Laden der SM-2 Stats:', err);
    }
}

// ── Filter ────────────────────────────────────────────────────
function filteredCards() {
    return state.cards.filter(card => {
        // Status-Filter
        if (state.filters.status !== "all") {
            const s = statusOf(card).toLowerCase();
            const map = { new: "neu", learning: "lernen", mastered: "markiert" };
            if (s !== map[state.filters.status] && s !== state.filters.status) return false;
        }
        // Sprach-Filter
        if (state.filters.lang !== "all") {
            const lang = card.language;
            if (state.filters.lang === 'german') {
                if (lang !== 'german' && lang !== 'deutsch') return false;
            } else {
                if (lang !== state.filters.lang) return false;
            }
        }
        // Typ-Filter
        if (state.filters.type !== "all" && card.tag !== state.filters.type) return false;
        // Suche
        if (state.filters.search) {
            const q = state.filters.search.toLowerCase();
            if (!card.front.toLowerCase().includes(q) && !card.back.toLowerCase().includes(q)) return false;
        }
        return true;
    });
}

// ── Flashcard Queue ───────────────────────────────────────────
const nextQueue = () =>
    state.cards
        .filter(card => {
            if (state.dueOnly && new Date(card.dueAt) > now()) return false;
            if (state.flashLang !== "all") {
                const lang = card.language;
                if (state.flashLang === "german") {
                    if (lang !== "german" && lang !== "deutsch") return false;
                } else {
                    if (lang !== state.flashLang) return false;
                }
            }
            return true;
        })
        .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

// ── Panel wechseln ────────────────────────────────────────────
function setPanel(name) {
    state.currentPanel = name;
    persistState();
    els(".panel").forEach((p) =>
        p.classList.toggle("active", p.id === `panel-${name}`)
    );
    els(".nav button").forEach((btn) =>
        btn.classList.toggle("active", btn.dataset.panel === name)
    );
    const titles = {
        dashboard: ["Dashboard", "Behalte Fortschritt, Lernstand und nächste Wiederholungen im Blick."],
        vocab: ["Vokabeln", "Erfasse neue Karten und prüfe Hinzufügedatum, Status und Reviews."],
        flashcards: ["Flash Cards", "Direkter Zugang zum Spaced-Repetition-Lernmodus."],
        settings: ["Settings", "Passe Ansicht und Wiederholungslogik an."],
    };
    el("#pageTitle").textContent = titles[name][0];
    el("#pageSubtitle").textContent = titles[name][1];
    if (window.innerWidth < 760) el("#nav").classList.remove("open");
    if (name === "flashcards") renderFlashcard();
    if (name === "settings") loadSm2Stats();
}

// ── Render: Dashboard ─────────────────────────────────────────
function renderDashboard() {
    const total = state.cards.length;
    const done = state.cards.filter((c) => c.mastered).length;
    const learning = total - done;
    const due = state.cards.filter((c) => new Date(c.dueAt) <= now()).length;

    el("#kpiTotal").textContent = total;
    el("#kpiDone").textContent = done;
    el("#kpiLearning").textContent = learning;
    el("#kpiDue").textContent = due;
    el("#dueNow").textContent = due;

    const recent = [...state.cards]
        .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
        .slice(0, 4);

    el("#recentList").innerHTML = recent.length
        ? recent.map(card => `
            <div class="word-row">
              <span class="status-dot ${statusClass(card)}"></span>
              <div class="word-main">
                <strong>${card.front} — ${card.back}</strong>
                <span>Hinzugefügt am ${fmtDate(card.addedAt)}</span>
              </div>
              <span class="tag">${statusOf(card)}</span>
            </div>`).join("")
        : '<div class="empty">Noch keine Vokabeln vorhanden.</div>';

    const dueItems = [...state.cards]
        .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
        .slice(0, 4);

    el("#dueList").innerHTML = dueItems.length
        ? dueItems.map(card => `
            <div class="word-row">
              <span class="status-dot ${statusClass(card)}"></span>
              <div class="word-main">
                <strong>${card.front}</strong>
                <span>Nächste Review: ${fmtDate(card.dueAt)}</span>
              </div>
              <span class="tag">${card.interval || 0}d</span>
            </div>`).join("")
        : '<div class="empty">Noch keine Reviews geplant.</div>';
}

// ── Render: Vokabelliste ──────────────────────────────────────
function renderTable() {
    const cards = filteredCards();

    el("#vocabCount").textContent = `${cards.length} Einträge`;

    const hasSelected = state.selectedIds.size > 0;
    el("#bulkActions").style.display = hasSelected ? "flex" : "none";
    el("#bulkCount").textContent = `${state.selectedIds.size} ausgewählt`;

    el("#vocabTable").innerHTML = cards.length
        ? cards.map(card => `
            <tr>
              <td>
                <input type="checkbox"
                  class="row-checkbox"
                  data-id="${card.id}"
                  ${state.selectedIds.has(card.id) ? "checked" : ""}
                />
              </td>
              <td><strong>${card.front}</strong></td>
              <td>${card.back}</td>
              <td><span class="tag">${langLabel(card.language)}</span></td>
              <td><span class="tag">${card.tag === "vocabulary" ? "Vokabel" : "Phrase"}</span></td>
              <td><span class="tag">${statusOf(card)}</span></td>
              <td>${fmtDate(card.addedAt)}</td>
              <td>${fmtDate(card.dueAt)}</td>
              <td><button class="btn ghost" data-delete-id="${card.id}">Löschen</button></td>
            </tr>`).join("")
        : '<tr><td colspan="9" class="empty">Keine Vokabeln gefunden.</td></tr>';
}

// ── Render: Flashcard ─────────────────────────────────────────
function renderFlashcard() {
    const queue = nextQueue();
    const card = queue[state.currentCardIndex] || queue[0];

    const total = queue.length;
    const current = state.currentCardIndex + 1;
    const percent = total ? Math.round((current / total) * 100) : 0;
    el("#flashProgressFill").style.width = `${percent}%`;
    el("#flashProgressLabel").textContent = total
        ? `${current} von ${total} Karten`
        : '0 von 0 Karten';

    if (!card) {
        const allCards = state.cards.filter(c => {
            if (state.flashLang === "all") return true;
            if (state.flashLang === "german") return c.language === "german" || c.language === "deutsch";
            return c.language === state.flashLang;
        });

        const nextDue = allCards
            .filter(c => new Date(c.dueAt) > now())
            .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))[0];

        let icon, headline, subtext;

        if (allCards.length === 0) {
            icon = "📭";
            headline = "Noch keine Vokabeln vorhanden.";
            subtext = state.flashLang === "all"
                ? "Markiere Wörter im Browser um zu starten."
                : `Noch keine ${langLabel(state.flashLang)} Vokabeln. Filter ändern oder Wörter markieren.`;
        } else if (nextDue) {
            icon = "🎉";
            headline = "Alle fälligen Karten gelernt!";
            subtext = `Super gemacht. Nächste Review: ${fmtDate(nextDue.dueAt)}`;
        } else {
            icon = "🔍";
            headline = "Keine Karten mit diesem Filter.";
            subtext = "Ändere die Sprachauswahl oder deaktiviere 'Nur fällige Karten'.";
        }

        el("#flashEmpty").style.display = "flex";
        el("#flashCard").style.display = "none";
        el("#flashEmptyIcon").textContent = icon;
        el("#flashEmptyTitle").textContent = headline;
        el("#flashEmptySubtext").textContent = subtext;
        el("#flashProgressFill").style.width = "0%";
        el("#flashProgressLabel").textContent = "0 von 0 Karten";
        return;
    }

    el("#flashEmpty").style.display = "none";
    el("#flashCard").style.display = "block";

    const index = queue.indexOf(card) + 1;
    el("#flashFront").textContent = card.front;
    el("#flashContext").textContent = card.context || "Kein Satzkontext gespeichert.";
    el("#flashBack").textContent = card.back || '–';
    el("#flashType").textContent = card.tag === 'vocabulary' ? 'Vokabel' : 'Phrase';
    el("#flashStatus").textContent = statusOf(card);
    el("#flashProgress").textContent = `${index} / ${queue.length}`;
    el("#flashLanguage").textContent = langLabel(card.language) || '–';
    el("#flashMeaning").textContent = card.note || '–';
    el("#flashExample").textContent = card.example || '–';
    el("#flashTip").textContent = card.tip || '–';
    el("#flashCard").classList.remove("flipped");

    if (state.autoFlip) {
        setTimeout(() => el("#flashCard").classList.add("flipped"), 15000);
    }
}

// ── Rerender ──────────────────────────────────────────────────
function rerender() {
    renderDashboard();
    renderTable();
    renderFlashcard();
}

// ── SM-2 Review ───────────────────────────────────────────────
async function applyReview(kind) {
    const queue = nextQueue();
    const card = queue[state.currentCardIndex] || queue[0];
    if (!card) return;

    try {
        const res = await fetch(`${API_BASE}/vocabulary/${card.id}/review`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating: kind })
        });

        const updated = await res.json();

        card.interval = updated.interval_days;
        card.ease_factor = updated.ease_factor;
        card.reviews = updated.review_count;
        card.mastered = updated.mastered;
        card.dueAt = updated.next_review;

        const newQueue = nextQueue();
        state.currentCardIndex = newQueue.length > 0
            ? state.currentCardIndex % newQueue.length
            : 0;

        rerender();
    } catch (err) {
        console.error('Review Fehler:', err);
    }
}

// ── Event Listener: Navigation ────────────────────────────────
els(".nav button").forEach((btn) =>
    btn.addEventListener("click", () => setPanel(btn.dataset.panel))
);
els("[data-panel-jump]").forEach((btn) =>
    btn.addEventListener("click", () => setPanel(btn.dataset.panelJump))
);
el("#mobileNavBtn").addEventListener("click", () =>
    el("#nav").classList.toggle("open")
);

// ── Event Listener: Theme ─────────────────────────────────────
el("#themeToggle").addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", state.theme);
    el("#darkSwitch").classList.toggle("active", state.theme === "dark");
    persistState();
});
el("#darkSwitch").addEventListener("click", () => el("#themeToggle").click());

// ── Event Listener: Settings Switches ────────────────────────
el("#dueOnlySwitch").addEventListener("click", (e) => {
    state.dueOnly = !state.dueOnly;
    e.currentTarget.classList.toggle("active", state.dueOnly);
    persistState();
    rerender();
});

el("#autoFlipSwitch").addEventListener("click", (e) => {
    state.autoFlip = !state.autoFlip;
    e.currentTarget.classList.toggle("active", state.autoFlip);
    persistState();
    renderFlashcard();
});

el("#highlightSwitch").addEventListener("click", (e) => {
    state.highlightEnabled = !state.highlightEnabled;
    e.currentTarget.classList.toggle("active", state.highlightEnabled);
    persistState();
    // content.js per Message informieren
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'setHighlight',
                enabled: state.highlightEnabled
            });
        }
    });
});

el("#targetLangSelect").addEventListener("change", (e) => {
    chrome.storage.local.set({ targetLang: e.target.value });
});

// ── Event Listener: Flashcard ─────────────────────────────────
el("#flipBtn").addEventListener("click", () =>
    el("#flashCard").classList.toggle("flipped")
);
el("#nextBtn").addEventListener("click", () => {
    const q = nextQueue();
    if (!q.length) return;
    state.currentCardIndex = (state.currentCardIndex + 1) % q.length;
    renderFlashcard();
});
els("[data-review]").forEach((btn) =>
    btn.addEventListener("click", () => applyReview(btn.dataset.review))
);
el("#flashLangSelect").addEventListener("change", (e) => {
    state.flashLang = e.target.value;
    state.currentCardIndex = 0;
    persistState();
    renderFlashcard();
});

// ── Event Listener: Vokabeln Filter ──────────────────────────
el("#filterStatus").addEventListener("change", (e) => {
    state.filters.status = e.target.value;
    state.selectedIds.clear();
    renderTable();
});
el("#filterType").addEventListener("change", (e) => {
    state.filters.type = e.target.value;
    state.selectedIds.clear();
    renderTable();
});
el("#filterLang").addEventListener("change", (e) => {
    state.filters.lang = e.target.value;
    state.selectedIds.clear();
    renderTable();
});
el("#filterSearch").addEventListener("input", (e) => {
    state.filters.search = e.target.value;
    state.selectedIds.clear();
    renderTable();
});

// ── Event Listener: Checkboxen & Bulk ────────────────────────
el("#selectAll").addEventListener("change", (e) => {
    const cards = filteredCards();
    if (e.target.checked) {
        cards.forEach(c => state.selectedIds.add(c.id));
    } else {
        state.selectedIds.clear();
    }
    renderTable();
});

el("#vocabTable").addEventListener("change", (e) => {
    if (!e.target.classList.contains("row-checkbox")) return;
    const id = parseInt(e.target.dataset.id);
    if (e.target.checked) {
        state.selectedIds.add(id);
    } else {
        state.selectedIds.delete(id);
    }
    renderTable();
});

el("#bulkSelectAll").addEventListener("click", () => {
    filteredCards().forEach(c => state.selectedIds.add(c.id));
    el("#selectAll").checked = true;
    renderTable();
});

el("#bulkDelete").addEventListener("click", async () => {
    if (!state.selectedIds.size) return;
    if (!confirm(`${state.selectedIds.size} Vokabeln wirklich löschen?`)) return;
    try {
        await Promise.all(
            [...state.selectedIds].map(id =>
                fetch(`${API_BASE}/vocabulary/${id}`, { method: "DELETE" })
            )
        );
        state.selectedIds.clear();
        await loadVocabulary();
    } catch (err) {
        console.error("Bulk-Löschen fehlgeschlagen:", err);
    }
});

// ── Event Listener: Einzeln löschen (Event Delegation) ───────
el("#vocabTable").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-delete-id]");
    if (!btn) return;
    const id = parseInt(btn.dataset.deleteId);
    if (!confirm("Diese Vokabel wirklich löschen?")) return;
    try {
        await fetch(`${API_BASE}/vocabulary/${id}`, { method: "DELETE" });
        state.selectedIds.delete(id);
        await loadVocabulary();
    } catch (err) {
        console.error("Löschen fehlgeschlagen:", err);
    }
});

// ── Live Update von content.js ────────────────────────────────
if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'vocabAdded') loadVocabulary();
    });
}

// ── Start ─────────────────────────────────────────────────────
loadPersistedState().then(() => loadVocabulary());
