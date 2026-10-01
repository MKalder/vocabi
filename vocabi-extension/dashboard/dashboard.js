const API_BASE = "https://api.prodowner.de";

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
    autoFlipTimer: null,
    filters: {
        status: "all",
        type: "all",
        lang: "all",
        search: "",
    },
    selectedIds: new Set(),
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
        english: "Englisch",
        german: "Deutsch",
        deutsch: "Deutsch",
        french: "Französisch",
        spanish: "Spanisch",
        thai: "Thailändisch",
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

function resetFlashcardView() {
    if (state.autoFlipTimer) {
        clearTimeout(state.autoFlipTimer);
        state.autoFlipTimer = null;
    }

    el("#flashCard").classList.remove("flipped");
    el("#flashDetails").hidden = true;
    el("#detailsBtn").setAttribute("aria-expanded", "false");
    el("#detailsBtn").textContent = "Kontext und Erklärung anzeigen";
}

// ── State persistieren ────────────────────────────────────────
function persistState() {
    chrome.storage.local.set({
        theme: state.theme,
        dueOnly: state.dueOnly,
        autoFlip: state.autoFlip,
        flashLang: state.flashLang,
        highlightEnabled: state.highlightEnabled,
        currentPanel: state.currentPanel,
    });
}

// ── Beim Start: State aus Storage laden ───────────────────────
async function loadPersistedState() {
    const data = await chrome.storage.local.get([
        "theme",
        "dueOnly",
        "autoFlip",
        "flashLang",
        "targetLang",
        "highlightEnabled",
        "vocabCache",
        "currentPanel",
    ]);

    if (data.theme) state.theme = data.theme;
    if (data.dueOnly !== undefined) state.dueOnly = data.dueOnly;
    if (data.autoFlip !== undefined) state.autoFlip = data.autoFlip;
    if (data.flashLang) state.flashLang = data.flashLang;
    if (data.highlightEnabled !== undefined) {
        state.highlightEnabled = data.highlightEnabled;
    }
    if (data.currentPanel) state.currentPanel = data.currentPanel;

    document.documentElement.setAttribute("data-theme", state.theme);

    el("#dueOnlySwitch").classList.toggle("active", state.dueOnly);
    el("#autoFlipSwitch").classList.toggle("active", state.autoFlip);
    el("#darkSwitch").classList.toggle("active", state.theme === "dark");
    el("#highlightSwitch").classList.toggle(
        "active",
        state.highlightEnabled,
    );
    el("#flashLangSelect").value = state.flashLang || "all";

    if (data.targetLang) {
        el("#targetLangSelect").value = data.targetLang;
    }

    if (data.vocabCache && data.vocabCache.length > 0) {
        state.cards = data.vocabCache;
        rerender();
    }

    setPanel(state.currentPanel);
}

// ── Vokabeln laden ────────────────────────────────────────────
async function loadVocabulary() {
    let cachedCards = null;

    try {
        const cached = await chrome.storage.local.get("vocabCache");

        if (cached.vocabCache && cached.vocabCache.length > 0) {
            cachedCards = cached.vocabCache;
            state.cards = cachedCards;
            rerender();
        }
    } catch (err) {
        console.error("Cache lesen fehlgeschlagen:", err);
    }

    try {
        const res = await fetch(`${API_BASE}/vocabulary`);

        if (!res.ok) {
            throw new Error(`Vokabeln laden fehlgeschlagen: ${res.status}`);
        }

        const vocab = await res.json();

        state.cards = vocab.map((row) => ({
            id: row.id,
            front: row.input_text,
            back: row.translation || "–",
            context: row.context || "",
            language: row.target_lang,
            tag: row.type,
            note: row.meaning || "",
            example: row.example || "",
            tip: row.tip || "",
            addedAt: row.created_at,
            mastered: row.mastered || false,
            interval: row.interval_days || 1,
            ease_factor: row.ease_factor || 2.5,
            review_count: row.review_count || 0,
            dueAt: row.next_review || row.created_at,
            reviews: row.review_count || 0,
        }));

        await chrome.storage.local.set({ vocabCache: state.cards });

        rerender();
    } catch (err) {
        console.error("Fehler beim Laden der Vokabeln:", err);

        if (!cachedCards) {
            rerender();
        }
    }
}

// ── SM-2 Statistiken laden ────────────────────────────────────
async function loadSm2Stats() {
    try {
        const res = await fetch(`${API_BASE}/vocabulary/sm2-stats`);

        if (!res.ok) {
            throw new Error(`Statistiken laden fehlgeschlagen: ${res.status}`);
        }

        const stats = await res.json();

        el("#statAvgEase").textContent = stats.avg_ease_factor || "–";
        el("#statAvgInterval").textContent = stats.avg_interval_days
            ? `${stats.avg_interval_days}d`
            : "–";
        el("#statMastered").textContent = stats.mastered_count || "0";
        el("#statNeverReviewed").textContent =
            stats.never_reviewed_count || "0";
    } catch (err) {
        console.error("Fehler beim Laden der SM-2 Stats:", err);
    }
}

// ── Filter ────────────────────────────────────────────────────
function filteredCards() {
    return state.cards.filter((card) => {
        if (state.filters.status !== "all") {
            const status = statusOf(card).toLowerCase();
            const map = {
                new: "neu",
                learning: "lernen",
                mastered: "markiert",
            };

            if (
                status !== map[state.filters.status] &&
                status !== state.filters.status
            ) {
                return false;
            }
        }

        if (state.filters.lang !== "all") {
            const lang = card.language;

            if (state.filters.lang === "german") {
                if (lang !== "german" && lang !== "deutsch") {
                    return false;
                }
            } else if (lang !== state.filters.lang) {
                return false;
            }
        }

        if (
            state.filters.type !== "all" &&
            card.tag !== state.filters.type
        ) {
            return false;
        }

        if (state.filters.search) {
            const query = state.filters.search.toLowerCase();

            if (
                !card.front.toLowerCase().includes(query) &&
                !card.back.toLowerCase().includes(query)
            ) {
                return false;
            }
        }

        return true;
    });
}

// ── Flashcard Queue ───────────────────────────────────────────
const nextQueue = () =>
    state.cards
        .filter((card) => {
            if (state.dueOnly && new Date(card.dueAt) > now()) {
                return false;
            }

            if (state.flashLang !== "all") {
                const lang = card.language;

                if (state.flashLang === "german") {
                    if (lang !== "german" && lang !== "deutsch") {
                        return false;
                    }
                } else if (lang !== state.flashLang) {
                    return false;
                }
            }

            return true;
        })
        .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

// ── Panel wechseln ────────────────────────────────────────────
function setPanel(name) {
    state.currentPanel = name;
    persistState();

    els(".panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === `panel-${name}`);
    });

    els(".nav button").forEach((button) => {
        button.classList.toggle("active", button.dataset.panel === name);
    });

    const titles = {
        dashboard: [
            "Dashboard",
            "Behalte Fortschritt, Lernstand und nächste Wiederholungen im Blick.",
        ],
        vocab: [
            "Vokabeln",
            "Erfasse neue Karten und prüfe Hinzufügedatum, Status und Reviews.",
        ],
        flashcards: [
            "Flash Cards",
            "Direkter Zugang zum Spaced-Repetition-Lernmodus.",
        ],
        settings: [
            "Settings",
            "Passe Ansicht und Wiederholungslogik an.",
        ],
    };

    el("#pageTitle").textContent = titles[name][0];
    el("#pageSubtitle").textContent = titles[name][1];

    if (window.innerWidth < 760) {
        el("#nav").classList.remove("open");
    }

    if (name === "flashcards") {
        renderFlashcard();
    }

    if (name === "settings") {
        loadSm2Stats();
    }
}

// ── Render: Dashboard ─────────────────────────────────────────
function renderDashboard() {
    const total = state.cards.length;
    const done = state.cards.filter((card) => card.mastered).length;
    const learning = total - done;
    const due = state.cards.filter(
        (card) => new Date(card.dueAt) <= now(),
    ).length;

    el("#kpiTotal").textContent = total;
    el("#kpiDone").textContent = done;
    el("#kpiLearning").textContent = learning;
    el("#kpiDue").textContent = due;
    el("#dueNow").textContent = due;

    const recent = [...state.cards]
        .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
        .slice(0, 4);

    el("#recentList").innerHTML = recent.length
        ? recent
            .map(
                (card) => `
                    <div class="word-row">
                        <span class="status-dot ${statusClass(card)}"></span>
                        <div class="word-main">
                            <strong>${card.front} — ${card.back}</strong>
                            <span>Hinzugefügt am ${fmtDate(card.addedAt)}</span>
                        </div>
                        <span class="tag">${statusOf(card)}</span>
                    </div>
                `,
            )
            .join("")
        : '<div class="empty">Noch keine Vokabeln vorhanden.</div>';

    const dueItems = [...state.cards]
        .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
        .slice(0, 4);

    el("#dueList").innerHTML = dueItems.length
        ? dueItems
            .map(
                (card) => `
                    <div class="word-row">
                        <span class="status-dot ${statusClass(card)}"></span>
                        <div class="word-main">
                            <strong>${card.front}</strong>
                            <span>Nächste Review: ${fmtDate(card.dueAt)}</span>
                        </div>
                        <span class="tag">${card.interval || 0}d</span>
                    </div>
                `,
            )
            .join("")
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
        ? cards
            .map(
                (card) => `
                    <tr>
                        <td>
                            <input
                                type="checkbox"
                                class="row-checkbox"
                                data-id="${card.id}"
                                ${state.selectedIds.has(card.id) ? "checked" : ""}
                            />
                        </td>
                        <td><strong>${card.front}</strong></td>
                        <td>${card.back}</td>
                        <td><span class="tag">${langLabel(card.language)}</span></td>
                        <td>
                            <span class="tag">
                                ${card.tag === "vocabulary" ? "Vokabel" : "Phrase"}
                            </span>
                        </td>
                        <td><span class="tag">${statusOf(card)}</span></td>
                        <td>${fmtDate(card.addedAt)}</td>
                        <td>${fmtDate(card.dueAt)}</td>
                        <td>
                            <button
                                class="btn ghost"
                                data-delete-id="${card.id}"
                                type="button"
                            >
                                Löschen
                            </button>
                        </td>
                    </tr>
                `,
            )
            .join("")
        : '<tr><td colspan="9" class="empty">Keine Vokabeln gefunden.</td></tr>';
}

// ── Render: Flashcard ─────────────────────────────────────────
function renderFlashcard() {
    const queue = nextQueue();
    const card = queue[state.currentCardIndex] || queue[0];
    const total = queue.length;

    console.log("Flashcard:", {
        card,
        context: card?.context,
        note: card?.note,
        example: card?.example,
        tip: card?.tip,
        detailsHidden: el("#flashDetails")?.hidden
    });

    if (!card) {
        resetFlashcardView();

        const allCards = state.cards.filter((item) => {
            if (state.flashLang === "all") return true;

            if (state.flashLang === "german") {
                return (
                    item.language === "german" ||
                    item.language === "deutsch"
                );
            }

            return item.language === state.flashLang;
        });

        const nextDue = allCards
            .filter((item) => new Date(item.dueAt) > now())
            .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))[0];

        let icon;
        let headline;
        let subtext;

        if (allCards.length === 0) {
            icon = "📭";
            headline = "Noch keine Vokabeln vorhanden.";
            subtext =
                state.flashLang === "all"
                    ? "Markiere Wörter im Browser, um zu starten."
                    : `Noch keine ${langLabel(state.flashLang)} Vokabeln. Filter ändern oder Wörter markieren.`;
        } else if (nextDue) {
            icon = "🎉";
            headline = "Alle fälligen Karten gelernt!";
            subtext = `Super gemacht. Nächste Review: ${fmtDate(nextDue.dueAt)}`;
        } else {
            icon = "🔍";
            headline = "Keine Karten mit diesem Filter.";
            subtext =
                "Ändere die Sprachauswahl oder deaktiviere „Nur fällige Karten“.";
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

    const index = queue.indexOf(card) + 1;
    const percent = Math.round((index / total) * 100);

    el("#flashEmpty").style.display = "none";
    el("#flashCard").style.display = "block";

    el("#flashProgressFill").style.width = `${percent}%`;
    el("#flashProgressLabel").textContent = `${index} von ${total} Karten`;

    el("#flashFront").textContent = card.front;
    el("#flashContext").textContent =
        card.context || "Kein Satzkontext gespeichert.";
    el("#flashBack").textContent = card.back || "–";
    el("#flashType").textContent =
        card.tag === "vocabulary" ? "Vokabel" : "Phrase";
    el("#flashStatus").textContent = statusOf(card);
    el("#flashProgress").textContent = `${index} / ${total}`;
    el("#flashLanguage").textContent = langLabel(card.language) || "–";
    el("#flashMeaning").textContent = card.note || "–";
    el("#flashExample").textContent = card.example || "–";
    el("#flashTip").textContent = card.tip || "–";

    resetFlashcardView();

    if (state.autoFlip) {
        state.autoFlipTimer = setTimeout(() => {
            el("#flashCard").classList.add("flipped");
            state.autoFlipTimer = null;
        }, 15000);
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
        const res = await fetch(
            `${API_BASE}/vocabulary/${card.id}/review`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rating: kind }),
            },
        );

        if (!res.ok) {
            throw new Error(`Review fehlgeschlagen: ${res.status}`);
        }

        const updated = await res.json();

        card.interval = updated.interval_days;
        card.ease_factor = updated.ease_factor;
        card.reviews = updated.review_count;
        card.review_count = updated.review_count;
        card.mastered = updated.mastered;
        card.dueAt = updated.next_review;

        await chrome.storage.local.set({ vocabCache: state.cards });

        const newQueue = nextQueue();

        state.currentCardIndex = newQueue.length
            ? state.currentCardIndex % newQueue.length
            : 0;

        rerender();
    } catch (err) {
        console.error("Review Fehler:", err);
    }
}

// ── Event Listener: Navigation ────────────────────────────────
els(".nav button").forEach((button) => {
    button.addEventListener("click", () => setPanel(button.dataset.panel));
});

els("[data-panel-jump]").forEach((button) => {
    button.addEventListener("click", () =>
        setPanel(button.dataset.panelJump),
    );
});

el("#mobileNavBtn").addEventListener("click", () => {
    el("#nav").classList.toggle("open");
});

// ── Event Listener: Theme ─────────────────────────────────────
el("#themeToggle").addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";

    document.documentElement.setAttribute("data-theme", state.theme);
    el("#darkSwitch").classList.toggle(
        "active",
        state.theme === "dark",
    );

    persistState();
});

el("#darkSwitch").addEventListener("click", () => {
    el("#themeToggle").click();
});

// ── Event Listener: Settings ──────────────────────────────────
el("#dueOnlySwitch").addEventListener("click", (event) => {
    state.dueOnly = !state.dueOnly;

    event.currentTarget.classList.toggle("active", state.dueOnly);

    state.currentCardIndex = 0;

    persistState();
    rerender();
});

el("#autoFlipSwitch").addEventListener("click", (event) => {
    state.autoFlip = !state.autoFlip;

    event.currentTarget.classList.toggle("active", state.autoFlip);

    persistState();
    renderFlashcard();
});

el("#highlightSwitch").addEventListener("click", (event) => {
    state.highlightEnabled = !state.highlightEnabled;

    event.currentTarget.classList.toggle(
        "active",
        state.highlightEnabled,
    );

    persistState();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "setHighlight",
                enabled: state.highlightEnabled,
            });
        }
    });
});

el("#targetLangSelect").addEventListener("change", (event) => {
    chrome.storage.local.set({ targetLang: event.target.value });
});

// ── Event Listener: Flashcards ────────────────────────────────
el("#flipBtn").addEventListener("click", () => {
    el("#flashCard").classList.toggle("flipped");
});

el("#backToFrontBtn").addEventListener("click", () => {
    el("#flashCard").classList.remove("flipped");
});

el("#detailsBtn").addEventListener("click", () => {
    const details = el("#flashDetails");
    const isHidden = details.hidden;

    details.hidden = !isHidden;

    el("#detailsBtn").setAttribute("aria-expanded", String(isHidden));

    el("#detailsBtn").textContent = isHidden
        ? "Kontext und Erklärung ausblenden"
        : "Kontext und Erklärung anzeigen";
});

el("#nextBtn").addEventListener("click", () => {
    const queue = nextQueue();

    if (!queue.length) return;

    state.currentCardIndex =
        (state.currentCardIndex + 1) % queue.length;

    renderFlashcard();
});

els("[data-review]").forEach((button) => {
    button.addEventListener("click", () => applyReview(button.dataset.review));
});

el("#flashLangSelect").addEventListener("change", (event) => {
    state.flashLang = event.target.value;
    state.currentCardIndex = 0;

    persistState();
    renderFlashcard();
});

// ── Event Listener: Vokabel-Filter ────────────────────────────
el("#filterStatus").addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    state.selectedIds.clear();
    renderTable();
});

el("#filterType").addEventListener("change", (event) => {
    state.filters.type = event.target.value;
    state.selectedIds.clear();
    renderTable();
});

el("#filterLang").addEventListener("change", (event) => {
    state.filters.lang = event.target.value;
    state.selectedIds.clear();
    renderTable();
});

el("#filterSearch").addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    state.selectedIds.clear();
    renderTable();
});

// ── Event Listener: Checkboxen und Bulk ───────────────────────
el("#selectAll").addEventListener("change", (event) => {
    const cards = filteredCards();

    if (event.target.checked) {
        cards.forEach((card) => state.selectedIds.add(card.id));
    } else {
        state.selectedIds.clear();
    }

    renderTable();
});

el("#vocabTable").addEventListener("change", (event) => {
    if (!event.target.classList.contains("row-checkbox")) return;

    const id = Number(event.target.dataset.id);

    if (event.target.checked) {
        state.selectedIds.add(id);
    } else {
        state.selectedIds.delete(id);
    }

    renderTable();
});

el("#bulkSelectAll").addEventListener("click", () => {
    filteredCards().forEach((card) => state.selectedIds.add(card.id));

    el("#selectAll").checked = true;

    renderTable();
});

el("#bulkDelete").addEventListener("click", async () => {
    if (!state.selectedIds.size) return;

    if (!confirm(`${state.selectedIds.size} Vokabeln wirklich löschen?`)) {
        return;
    }

    try {
        await Promise.all(
            [...state.selectedIds].map((id) =>
                fetch(`${API_BASE}/vocabulary/${id}`, {
                    method: "DELETE",
                }),
            ),
        );

        state.selectedIds.clear();

        await loadVocabulary();
    } catch (err) {
        console.error("Bulk-Löschen fehlgeschlagen:", err);
    }
});

// ── Event Listener: Einzelnes Löschen ─────────────────────────
el("#vocabTable").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-id]");

    if (!button) return;

    const id = Number(button.dataset.deleteId);

    if (!confirm("Diese Vokabel wirklich löschen?")) return;

    try {
        const res = await fetch(`${API_BASE}/vocabulary/${id}`, {
            method: "DELETE",
        });

        if (!res.ok) {
            throw new Error(`Löschen fehlgeschlagen: ${res.status}`);
        }

        state.selectedIds.delete(id);

        await loadVocabulary();
    } catch (err) {
        console.error("Löschen fehlgeschlagen:", err);
    }
});

// ── Live Update von content.js ────────────────────────────────
if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "vocabAdded") {
            loadVocabulary();
        }
    });
}

// ── Start ─────────────────────────────────────────────────────
loadPersistedState().then(() => loadVocabulary());