// ======================================================
// MUNICIPALITY MANAGEMENT SYSTEM — PAYTRACK
// archive.js
// A single master table of every company, across every
// service, so nothing needs to be hunted down table by
// table like on the Paiements page. Supports free-text
// search, filtering by service/start year, highlighting
// specific rows or columns for visual review, a full
// payment-history detail view per company, and export to
// PDF / Excel / Word (respecting whatever is currently
// visible after search + filters).
// ======================================================

const COMPANIES_KEY = "companies";
const PAYMENTS_KEY = "paymentAmounts";
const PERIODS_KEY = "paymentPeriodOverrides";
const ROW_HIGHLIGHTS_KEY = "archiveHighlightedRows";
const COL_HIGHLIGHTS_KEY = "archiveHighlightedColumns";

const archiveContainer = document.getElementById("archiveContainer");
const refreshBtn = document.getElementById("refreshArchive");
const searchInput = document.getElementById("archiveSearchInput");
const serviceFilter = document.getElementById("archiveServiceFilter");
const yearFilter = document.getElementById("archiveYearFilter");
const clearHighlightsBtn = document.getElementById("clearHighlightsBtn");
const archiveCount = document.getElementById("archiveCount");


// ======================================================
// STORAGE HELPERS
// (kept self-contained — this page loads independently of payments.js)
// ======================================================

function loadCompanies() {

    try {
        return JSON.parse(localStorage.getItem(COMPANIES_KEY)) || [];
    } catch (e) {
        return [];
    }

}

function loadPaymentAmounts() {

    try {
        return JSON.parse(localStorage.getItem(PAYMENTS_KEY)) || {};
    } catch (e) {
        return {};
    }

}

function loadPeriodOverrides() {

    try {
        return JSON.parse(localStorage.getItem(PERIODS_KEY)) || {};
    } catch (e) {
        return {};
    }

}

function loadSet(key) {

    try {
        const arr = JSON.parse(localStorage.getItem(key));
        return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) {
        return new Set();
    }

}

function saveSet(key, set) {

    localStorage.setItem(key, JSON.stringify(Array.from(set)));

}

function getCompanyKey(company) {

    if (company.number && String(company.number).trim() !== "") {
        return "num:" + String(company.number).trim();
    }

    return "gen:" + [company.name, company.category, company.startYear].join("|");

}

function sumRowAmounts(rowAmounts) {

    let total = 0;

    Object.keys(rowAmounts || {}).forEach(k => {
        const val = parseFloat(rowAmounts[k]);
        if (!isNaN(val)) total += val;
    });

    return total;

}

function formatMoney(value) {

    const num = Number(value) || 0;
    return num.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
}


// ======================================================
// PAYMENT HISTORY (id-aware, same convention as payments.js)
// Reconstructs a readable "year -> [{ label, amount }]" history
// from the raw storage keys, resolving editable-period ids back
// to whatever label they had that year.
// ======================================================

function resolvePeriodLabel(company, year, periodId) {

    const scheduleKey = JSON.stringify(Array.isArray(company.schedule) ? company.schedule : []);
    const overrides = loadPeriodOverrides();
    const tableOverrides = overrides[scheduleKey];

    if (tableOverrides && Array.isArray(tableOverrides[year])) {
        const found = tableOverrides[year].find(p => p.id === periodId);
        if (found) return found.label;
    }

    // Default (never customised) periods use ids "d0", "d1"... matching
    // their position in the company's recorded schedule.
    const match = /^d(\d+)$/.exec(periodId);
    if (match && Array.isArray(company.schedule)) {
        const idx = parseInt(match[1], 10);
        if (company.schedule[idx] != null) return company.schedule[idx];

        // The payment was recorded against a period slot that no longer
        // exists in the company's current échéancier (e.g. the schedule
        // was shortened/edited after this payment was entered). Rather
        // than leak the raw internal id ("d4") onto the screen or into
        // exports, show a short, readable label — kept compact like
        // every other period column ("01/01->31/03", "5/6", etc.) so it
        // doesn't blow out the table width in PDF/Word/Excel.
        return `Période ${idx + 1}`;
    }

    return periodId;

}

function buildPaymentHistory(company, rowAmounts) {

    const byYear = {};
    const currentYear = new Date().getFullYear();

    Object.keys(rowAmounts || {}).forEach(k => {

        const val = parseFloat(rowAmounts[k]);
        if (isNaN(val) || val === 0) return;

        let year, label;

        let m = /^(\d{4})::id::(.+)$/.exec(k);
        if (m) {
            year = parseInt(m[1], 10);
            label = resolvePeriodLabel(company, year, m[2]);
        } else if ((m = /^(\d{4})::(.+)$/.exec(k))) {
            year = parseInt(m[1], 10);
            label = m[2];
        } else {
            year = currentYear;
            label = k;
        }

        if (!byYear[year]) byYear[year] = [];
        byYear[year].push({ label, amount: val });

    });

    return Object.keys(byYear)
        .map(y => parseInt(y, 10))
        .sort((a, b) => b - a)
        .map(year => ({
            year,
            entries: byYear[year],
            yearTotal: byYear[year].reduce((sum, e) => sum + e.amount, 0)
        }));

}


// ======================================================
// STATE
// ======================================================

let rowHighlights = loadSet(ROW_HIGHLIGHTS_KEY);
let colHighlights = loadSet(COL_HIGHLIGHTS_KEY);
let currentRows = [];
const rowsByKey = new Map();

const COLUMNS = [
    { key: "index", label: "N°", sortable: false },
    { key: "number", label: "N° de marché" },
    { key: "name", label: "Entreprise" },
    { key: "category", label: "Service" },
    { key: "schedule", label: "Échéancier" },
    { key: "startYear", label: "Début" },
    { key: "total", label: "Total payé" },
    { key: "actions", label: "", sortable: false }
];


// ======================================================
// RENDER
// ======================================================

function renderEmptyState() {

    archiveContainer.innerHTML = `
        <div class="table-card" style="text-align:center; padding:60px 30px; color:#888;">
            <i class="fa-solid fa-box-archive" style="font-size:34px; color:#c7cad1; margin-bottom:14px;"></i>
            <h2 style="margin-bottom:8px;">Aucune entreprise à archiver</h2>
            <p>Ajoutez d'abord des entreprises depuis la page « Entreprises ».</p>
        </div>
    `;

    if (archiveCount) archiveCount.textContent = "";

}

function buildRows(companies, amounts) {

    return companies.map((company, index) => {

        const key = getCompanyKey(company);
        // key is used to look up payment amounts (matches the convention
        // used elsewhere in the app, keyed by N° de marché). If two
        // companies share the same N° de marché they will legitimately
        // share the same payment record — that's a data issue to fix on
        // the Entreprises page, not something this page can safely
        // second-guess. domKey is a SEPARATE, always-unique identifier
        // (key + row position) used only for DOM lookups, so that even
        // when two rows share `key`, filtering/highlighting/the details
        // button still target the correct individual <tr> instead of
        // both silently operating on whichever row happens to be first
        // in the DOM.
        const domKey = key + "::" + index;
        const schedule = Array.isArray(company.schedule) ? company.schedule : [];
        const rowAmounts = amounts[key] || {};
        const total = sumRowAmounts(rowAmounts);

        return {
            key,
            domKey,
            company,
            rowAmounts,
            index: index + 1,
            number: company.number || "",
            name: company.name || "",
            category: company.category || "Sans service",
            schedule,
            startYear: Number.isFinite(parseInt(company.startYear, 10)) ? parseInt(company.startYear, 10) : null,
            total,
            searchText: [company.number, company.name, company.category].join(" ").toLowerCase()
        };

    });

}

function renderScheduleCell(schedule) {

    if (!schedule.length) return `<span class="muted-dash">—</span>`;

    const count = schedule.length;
    const label = count === 1 ? "1 période/an" : `${count} périodes/an`;

    return `<span class="schedule-badge" title="${escapeHtml(schedule.join(" · "))}">
        <i class="fa-solid fa-calendar-days"></i> ${escapeHtml(label)}
    </span>`;

}

function renderTotalCell(total) {

    if (!total) return `<span class="total-empty">0,00</span>`;
    return `<span class="total-paid">${formatMoney(total)}</span>`;

}

function renderArchiveTable(rows) {

    const theadHtml = COLUMNS.map(col => `
        <th
            ${col.sortable === false ? "" : `class="archive-col-header" data-col="${col.key}"`}
            data-col-static="${col.key}">
            ${escapeHtml(col.label)}
        </th>
    `).join("");

    const rowsHtml = rows.map(row => `
        <tr data-key="${escapeHtml(row.domKey)}" class="${rowHighlights.has(row.domKey) ? "row-highlighted" : ""}">
            <td data-col="index">${row.index}</td>
            <td data-col="number">${escapeHtml(row.number) || "—"}</td>
            <td data-col="name">${escapeHtml(row.name)}</td>
            <td data-col="category"><span class="service-tag">${escapeHtml(row.category)}</span></td>
            <td data-col="schedule">${renderScheduleCell(row.schedule)}</td>
            <td data-col="startYear">${row.startYear || "—"}</td>
            <td data-col="total" class="row-total">${renderTotalCell(row.total)}</td>
            <td data-col="actions" style="text-align:center;">
                <button
                    type="button"
                    class="row-menu-btn"
                    data-key="${escapeHtml(row.domKey)}"
                    title="Voir les détails et l'historique des paiements">
                    <i class="fa-solid fa-circle-info"></i>
                </button>
            </td>
        </tr>
    `).join("");

    archiveContainer.innerHTML = `
        <div class="table-card">
            <div class="table-wrapper">
                <table class="payments-table archive-table">
                    <thead>
                        <tr>${theadHtml}</tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    applyColumnHighlights();

}


// ======================================================
// SEARCH + FILTER
// ======================================================

function populateFilterOptions(rows) {

    const services = Array.from(new Set(rows.map(r => r.category))).sort((a, b) => a.localeCompare(b));
    const years = Array.from(new Set(rows.map(r => r.startYear).filter(y => y != null))).sort((a, b) => a - b);

    const currentService = serviceFilter.value;
    const currentYear = yearFilter.value;

    serviceFilter.innerHTML = `<option value="">Tous</option>` +
        services.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

    yearFilter.innerHTML = `<option value="">Toutes années</option>` +
        years.map(y => `<option value="${y}">${y}</option>`).join("");

    // Keep the previous selection if it's still a valid option.
    if (services.includes(currentService)) serviceFilter.value = currentService;
    if (years.map(String).includes(currentYear)) yearFilter.value = currentYear;

}

function applyFilters(rows) {

    const term = (searchInput.value || "").trim().toLowerCase();
    const service = serviceFilter.value;
    const year = yearFilter.value;

    let visibleCount = 0;

    rows.forEach(row => {

        const rowEl = archiveContainer.querySelector(`tr[data-key="${cssEscape(row.domKey)}"]`);
        if (!rowEl) return;

        const matchesSearch = term === "" || row.searchText.includes(term);
        const matchesService = service === "" || row.category === service;
        const matchesYear = year === "" || String(row.startYear) === year;

        const visible = matchesSearch && matchesService && matchesYear;
        rowEl.style.display = visible ? "" : "none";

        if (visible) visibleCount++;

    });

    if (archiveCount) {
        archiveCount.textContent = visibleCount === rows.length
            ? `${rows.length} entreprise(s)`
            : `${visibleCount} / ${rows.length} entreprise(s)`;
    }

}

function getVisibleRows(rows) {

    return rows.filter(row => {
        const rowEl = archiveContainer.querySelector(`tr[data-key="${cssEscape(row.domKey)}"]`);
        return rowEl && rowEl.style.display !== "none";
    });

}

// CSS.escape polyfill-ish helper for building attribute selectors safely.
function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
}


// ======================================================
// HIGHLIGHTING
// ======================================================

function toggleRowHighlight(key) {

    if (rowHighlights.has(key)) {
        rowHighlights.delete(key);
    } else {
        rowHighlights.add(key);
    }

    saveSet(ROW_HIGHLIGHTS_KEY, rowHighlights);

    const rowEl = archiveContainer.querySelector(`tr[data-key="${cssEscape(key)}"]`);
    if (rowEl) rowEl.classList.toggle("row-highlighted", rowHighlights.has(key));

}

function toggleColumnHighlight(colKey) {

    if (colHighlights.has(colKey)) {
        colHighlights.delete(colKey);
    } else {
        colHighlights.add(colKey);
    }

    saveSet(COL_HIGHLIGHTS_KEY, colHighlights);
    applyColumnHighlights();

}

function applyColumnHighlights() {

    archiveContainer.querySelectorAll("[data-col]").forEach(cell => {
        cell.classList.toggle("col-highlighted", colHighlights.has(cell.dataset.col));
    });

    archiveContainer.querySelectorAll(".archive-col-header").forEach(th => {
        th.classList.toggle("col-highlighted-header", colHighlights.has(th.dataset.col));
    });

}

function clearAllHighlights() {

    if (!confirm("Effacer tous les surlignages (lignes et colonnes) de l'archive ?")) return;

    rowHighlights = new Set();
    colHighlights = new Set();

    saveSet(ROW_HIGHLIGHTS_KEY, rowHighlights);
    saveSet(COL_HIGHLIGHTS_KEY, colHighlights);

    archiveContainer.querySelectorAll("tr.row-highlighted").forEach(tr => tr.classList.remove("row-highlighted"));
    archiveContainer.querySelectorAll(".col-highlighted").forEach(el => el.classList.remove("col-highlighted"));
    archiveContainer.querySelectorAll(".col-highlighted-header").forEach(el => el.classList.remove("col-highlighted-header"));

}


// ======================================================
// EVENTS
// ======================================================

function attachEvents(rows) {

    archiveContainer.querySelectorAll(".archive-col-header").forEach(th => {

        th.addEventListener("click", function () {
            toggleColumnHighlight(this.dataset.col);
        });

    });

    archiveContainer.querySelectorAll("tbody tr").forEach(tr => {

        tr.addEventListener("click", function (e) {
            if (e.target.closest(".row-menu-btn")) return; // let the details button work on its own
            toggleRowHighlight(this.dataset.key);
        });

    });

    archiveContainer.querySelectorAll(".row-menu-btn").forEach(btn => {

        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            openDetailsModal(this.dataset.key);
        });

    });

    searchInput.addEventListener("input", () => applyFilters(rows));
    serviceFilter.addEventListener("change", () => applyFilters(rows));
    yearFilter.addEventListener("change", () => applyFilters(rows));

}


// ======================================================
// DETAILS MODAL (identity + full payment history)
// ======================================================

const detailsModal = document.getElementById("detailsModal");
const detailsModalTitle = document.getElementById("detailsModalTitle");
const detailsModalBody = document.getElementById("detailsModalBody");

function renderPaymentHistoryHtml(history) {

    if (!history.length) {
        return `<p class="muted-dash" style="margin-top:4px;">Aucun paiement enregistré.</p>`;
    }

    return history.map(yearGroup => `
        <div class="history-year-block">
            <div class="history-year-heading">
                <span>${yearGroup.year}</span>
                <span class="history-year-total">${formatMoney(yearGroup.yearTotal)}</span>
            </div>
            <table class="history-table">
                ${yearGroup.entries.map(e => `
                    <tr>
                        <td>${escapeHtml(e.label)}</td>
                        <td class="history-amount">${formatMoney(e.amount)}</td>
                    </tr>
                `).join("")}
            </table>
        </div>
    `).join("");

}

function openDetailsModal(key) {

    if (!detailsModal) return;

    const row = rowsByKey.get(key);
    if (!row) return;

    const company = row.company;
    const history = buildPaymentHistory(company, row.rowAmounts);

    detailsModalTitle.textContent = row.name || "Détails";

    detailsModalBody.innerHTML = `
        <div class="details-meta">
            <span><i class="fa-solid fa-hashtag"></i> ${escapeHtml(row.number) || "—"}</span>
            <span><i class="fa-solid fa-building"></i> ${escapeHtml(row.category)}</span>
            <span><i class="fa-solid fa-calendar"></i> Depuis ${row.startYear || "—"}</span>
        </div>

        <div class="details-section">
            <p class="details-label"><i class="fa-solid fa-calendar-days"></i> Échéancier</p>
            ${row.schedule.length
                ? `<div class="schedule-preview" style="margin:0;">${row.schedule.map(p => `<span>${escapeHtml(p)}</span>`).join("")}</div>`
                : `<p class="muted-dash">—</p>`}
        </div>

        <div class="details-section">
            <p class="details-label"><i class="fa-solid fa-file-lines"></i> Objet</p>
            <p>${company.object && String(company.object).trim() !== "" ? escapeHtml(company.object) : "—"}</p>
        </div>

        <div class="details-section">
            <p class="details-label"><i class="fa-solid fa-comment"></i> Commentaires</p>
            <p>${company.comment && String(company.comment).trim() !== "" ? escapeHtml(company.comment) : "—"}</p>
        </div>

        <div class="details-section">
            <p class="details-label"><i class="fa-solid fa-coins"></i> Historique des paiements</p>
            ${renderPaymentHistoryHtml(history)}
            <div class="history-grand-total">
                Total payé : <strong>${formatMoney(row.total)}</strong>
            </div>
        </div>
    `;

    detailsModal.classList.add("show");

}

function closeDetailsModal() {
    if (detailsModal) detailsModal.classList.remove("show");
}

const closeDetailsModalBtn = document.getElementById("closeDetailsModal");
if (closeDetailsModalBtn) closeDetailsModalBtn.addEventListener("click", closeDetailsModal);

if (detailsModal) {
    detailsModal.addEventListener("click", function (e) {
        if (e.target === detailsModal) closeDetailsModal();
    });
}

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDetailsModal();
});


// ======================================================
// EXPORTS — PDF / Excel / Word
// All three export exactly what's currently visible (i.e. respect
// the active search term and filters), matching the on-screen table.
// Each includes the full payment breakdown per period, per year, and
// the running grand total — not just the summary total.
// ======================================================

// One entry per currently-visible company, with its full chronological
// payment history (oldest year first — the natural reading order for
// a record/report, as opposed to the "most recent first" modal view).
function getExportPayload() {

    return getVisibleRows(currentRows).map(row => {

        const history = buildPaymentHistory(row.company, row.rowAmounts).slice().reverse();

        return {
            number: row.number || "—",
            name: row.name,
            category: row.category,
            scheduleText: row.schedule.length ? row.schedule.join(" · ") : "—",
            startYear: row.startYear || "—",
            total: row.total,
            history // [{ year, entries:[{label, amount}], yearTotal }, ...] oldest → newest
        };

    });

}

// Flattens the payload into one row per individual payment — a true
// "full table" suited to Excel (self-contained rows, nothing to fill
// down, easy to filter/pivot). Companies with no recorded payments
// still get one row so nothing is silently dropped from the export.
function buildFlatPaymentRows(payload) {

    const flat = [];

    payload.forEach(c => {

        if (!c.history.length) {
            flat.push({
                number: c.number, name: c.name, category: c.category,
                schedule: c.scheduleText, startYear: c.startYear,
                year: "—", period: "—", amount: "—",
                yearTotal: "—", total: formatMoney(c.total)
            });
            return;
        }

        c.history.forEach(yearGroup => {
            yearGroup.entries.forEach(entry => {
                flat.push({
                    number: c.number, name: c.name, category: c.category,
                    schedule: c.scheduleText, startYear: c.startYear,
                    year: yearGroup.year, period: entry.label, amount: formatMoney(entry.amount),
                    yearTotal: formatMoney(yearGroup.yearTotal), total: formatMoney(c.total)
                });
            });
        });

    });

    return flat;

}

// ======================================================
// PIVOT TABLE (year -> period columns, matching the reference
// spreadsheet exactly: N° de marché / Service / STE, then one
// column per period, grouped under its year — no total columns.
// ======================================================

// Pulls the first date (dd/mm/yyyy) out of a period label so
// periods can be sorted chronologically even if they weren't
// entered in order. Returns null when no date is found.
function extractSortDate(label) {

    const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(label));
    if (!m) return null;

    const time = new Date(`${m[3]}-${m[2]}-${m[1]}`).getTime();
    return isNaN(time) ? null : time;

}

// A period label like "01/12/2024 31/12/2024" is shown on two
// lines (start date / end date) in the header, same as the
// reference spreadsheet. Falls back to the raw label untouched.
function splitPeriodLabel(label) {

    const dates = String(label).match(/\d{2}\/\d{2}\/\d{4}/g);
    if (dates && dates.length >= 2) return [dates[0], dates[1]];
    return [String(label)];

}

// Scans every company's payment history and builds the sorted
// list of years, each with its own sorted list of distinct
// period labels (the union across all companies for that year).
function getYearPeriodStructure(payload) {

    const yearMap = new Map();

    payload.forEach(c => {
        c.history.forEach(yg => {

            if (!yearMap.has(yg.year)) yearMap.set(yg.year, new Map());
            const periods = yearMap.get(yg.year);

            yg.entries.forEach(entry => {
                if (!periods.has(entry.label)) {
                    periods.set(entry.label, {
                        order: periods.size,
                        sortDate: extractSortDate(entry.label)
                    });
                }
            });

        });
    });

    return Array.from(yearMap.keys())
        .sort((a, b) => a - b)
        .map(year => {

            const periods = Array.from(yearMap.get(year).entries())
                .sort((a, b) => {
                    const da = a[1].sortDate, db = b[1].sortDate;
                    if (da != null && db != null) return da - db;
                    return a[1].order - b[1].order;
                })
                .map(([label]) => label);

            return { year, periods };

        });

}

// One row per company: amounts keyed by "year::label", plus a
// running total per year and the overall grand total.
function buildPivotRows(payload, structure) {

    return payload.map(c => {

        const cells = {};

        c.history.forEach(yg => {
            yg.entries.forEach(entry => {
                const key = `${yg.year}::${entry.label}`;
                cells[key] = (cells[key] || 0) + entry.amount;
            });
        });

        const yearTotals = {};
        structure.forEach(y => {
            yearTotals[y.year] = y.periods.reduce((sum, p) => sum + (cells[`${y.year}::${p}`] || 0), 0);
        });

        return {
            number: c.number,
            name: c.name,
            category: c.category,
            cells,
            yearTotals,
            grandTotal: c.total
        };

    });

}

function buildPivotTable(payload) {

    const structure = getYearPeriodStructure(payload);
    const rows = buildPivotRows(payload, structure);
    return { structure, rows };

}

// ======================================================
// GROUPING FOR EXPORTS
// Two companies can share the same service (category) but run on
// different schedules (échéancier) — putting them in one shared
// table produces a messy, sparse pivot (columns that only really
// apply to some of the rows). Instead we bucket companies first by
// service, then within each service by their exact schedule, so
// every table that gets printed/exported only ever contains
// companies whose columns (years + periods) genuinely line up.
// Order follows first appearance in the (already filtered/sorted)
// export payload, so it matches whatever the user is currently
// looking at on screen.
// ======================================================

function groupPayloadForExport(payload) {

    const categoryOrder = [];
    const categoryMap = new Map();

    payload.forEach(c => {

        const category = c.category || "Sans service";

        if (!categoryMap.has(category)) {
            categoryMap.set(category, { scheduleOrder: [], scheduleMap: new Map() });
            categoryOrder.push(category);
        }

        const catEntry = categoryMap.get(category);
        const scheduleKey = c.scheduleText || "—";

        if (!catEntry.scheduleMap.has(scheduleKey)) {
            catEntry.scheduleOrder.push(scheduleKey);
            catEntry.scheduleMap.set(scheduleKey, []);
        }

        catEntry.scheduleMap.get(scheduleKey).push(c);

    });

    return categoryOrder.map(category => {

        const catEntry = categoryMap.get(category);

        return {
            category,
            scheduleGroups: catEntry.scheduleOrder.map(scheduleText => ({
                scheduleText,
                rows: catEntry.scheduleMap.get(scheduleText)
            }))
        };

    });

}

function exportFileName(extension) {

    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return `Archive_Entreprises_${stamp}.${extension}`;

}

// The whole export is a SINGLE custom-sized page — wide enough for
// the widest table and tall enough to stack every table one under
// the other, exactly like the Excel sheet does. Nothing is ever cut
// off and nothing spills onto a second page: the page itself is
// grown to fit everything before a single line is drawn.
// Companies are grouped by service first, then by schedule within
// that service (same grouping as the Excel export), and every
// service gets its own dark title bar — so which service each table
// belongs to is always clearly labelled, matching the Excel layout.
function exportToPdf() {

    if (!window.jspdf) {
        alert("Le module d'export PDF n'a pas pu se charger.");
        return;
    }

    const payload = getExportPayload();
    const grouped = groupPayloadForExport(payload);
    const { jsPDF } = window.jspdf;

    // Alternating colors per year block, same spirit as the reference
    // spreadsheet (blue for one year, green for the next, and so on).
    const YEAR_COLORS = [[37, 99, 235], [22, 163, 74], [217, 119, 6], [124, 58, 237], [220, 38, 38]];
    const CATEGORY_FILL = [15, 23, 42];
    const SUBTITLE_COLOR = [71, 85, 105];

    const marginLeft = 8;
    const marginRight = 8;
    const marginTop = 10;
    const marginBottom = 10;
    const COL = { number: 24, name: 46, period: 16 };
    const ROW_H = 6.5;
    const HEADER_H = 15;
    const TITLE_H = 9;
    const SUBTITLE_H = 7;
    const BLOCK_GAP = 6;
    const TOP_H = 16;

    // Pass 1 — build every block (one per service+schedule combo) and
    // work out how wide/tall the finished page needs to be.
    const blocks = [];
    grouped.forEach(catGroup => {
        catGroup.scheduleGroups.forEach((schedGroup, idx) => {

            const { structure, rows } = buildPivotTable(schedGroup.rows);
            const periodCols = structure.reduce((s, y) => s + y.periods.length, 0);
            const tableWidth = COL.number + COL.name + periodCols * COL.period;

            blocks.push({
                category: catGroup.category,
                isFirstOfCategory: idx === 0,
                scheduleText: schedGroup.scheduleText,
                structure,
                rows,
                tableWidth,
                tableHeight: HEADER_H + rows.length * ROW_H
            });

        });
    });

    const maxTableWidth = blocks.reduce((m, b) => Math.max(m, b.tableWidth), 0);
    const pageWidth = Math.max(maxTableWidth + marginLeft + marginRight, 110);

    let pageHeight = marginTop + TOP_H;
    blocks.forEach(b => {
        if (b.isFirstOfCategory) pageHeight += TITLE_H;
        pageHeight += SUBTITLE_H + b.tableHeight + BLOCK_GAP;
    });
    pageHeight += marginBottom;

    const doc = new jsPDF({ unit: "mm", format: [pageWidth, pageHeight] });

    let y = marginTop;

    doc.setFontSize(16);
    doc.setTextColor(20);
    doc.text("Archive des entreprises — PAYTRACK", marginLeft, y + 4);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")} — ${payload.length} entreprise(s)`, marginLeft, y + 11);
    y += TOP_H;

    blocks.forEach(t => {

        if (t.isFirstOfCategory) {
            doc.setFillColor(...CATEGORY_FILL);
            doc.rect(marginLeft, y, pageWidth - marginLeft - marginRight, TITLE_H, "F");
            doc.setFontSize(11);
            doc.setTextColor(255);
            doc.setFont(undefined, "bold");
            doc.text(t.category, marginLeft + 3, y + TITLE_H / 2 + 3);
            doc.setFont(undefined, "normal");
            y += TITLE_H + 1;
        }

        doc.setFontSize(10);
        doc.setTextColor(...SUBTITLE_COLOR);
        doc.setFont(undefined, "italic");
        doc.text(`Échéancier : ${t.scheduleText}`, marginLeft, y + 4);
        doc.setFont(undefined, "normal");
        y += SUBTITLE_H;

        // Header row 1: fixed columns span both header rows, each
        // year spans just its own period columns.
        const headRow1 = [
            { content: "N° de marché", rowSpan: 2, styles: { valign: "middle" } },
            { content: "STE", rowSpan: 2, styles: { valign: "middle" } }
        ];

        t.structure.forEach((y2, i) => {
            headRow1.push({
                content: String(y2.year),
                colSpan: y2.periods.length,
                styles: { halign: "center", fillColor: YEAR_COLORS[i % YEAR_COLORS.length] }
            });
        });

        const headRow2 = [];
        t.structure.forEach(y2 => {
            y2.periods.forEach(p => {
                headRow2.push({ content: splitPeriodLabel(p).join("\n"), styles: { fontSize: 6.5 } });
            });
        });

        const body = t.rows.map(r => {

            const line = [r.number, r.name];

            t.structure.forEach(y2 => {
                y2.periods.forEach(p => {
                    const val = r.cells[`${y2.year}::${p}`];
                    line.push(val ? formatMoney(val) : "");
                });
            });

            return line;

        });

        doc.autoTable({
            startY: y,
            margin: { left: marginLeft, right: marginRight },
            head: [headRow1, headRow2],
            body,
            theme: "grid",
            styles: { fontSize: 7, cellPadding: 1.6, halign: "right" },
            headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", halign: "center" },
            columnStyles: { 0: { halign: "left" }, 1: { halign: "left" } },
            alternateRowStyles: { fillColor: [245, 247, 251] },
            tableWidth: "auto",
            rowPageBreak: "avoid",
            pageBreak: "avoid"
        });

        y = doc.lastAutoTable.finalY + BLOCK_GAP;

    });

    doc.save(exportFileName("pdf"));

}

function exportToExcel() {

    if (!window.XLSX) {
        alert("Le module d'export Excel n'a pas pu se charger.");
        return;
    }

    const payload = getExportPayload();
    const grouped = groupPayloadForExport(payload);

    // Sheet 1 — one pivot grid per service, and within a service, one
    // per distinct schedule, stacked vertically with a heading row for
    // each — instead of a single table mixing companies whose columns
    // (years/periods) don't line up. Columns: N° de marché / STE, then
    // one block per year (one column per period), styled to match the
    // reference spreadsheet — colored year headers, bordered cells,
    // banded rows.
    const fixedCols = 2;
    const THIN = { style: "thin", color: { rgb: "94A3B8" } };
    const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };
    const YEAR_COLORS = ["2563EB", "16A34A", "D97706", "7C3AED", "DC2626"];

    // Pre-compute every table block so the widest one is known upfront
    // — title/subtitle rows are stretched to match it.
    const blocks = [];
    grouped.forEach(catGroup => {
        catGroup.scheduleGroups.forEach((schedGroup, idx) => {
            const { structure, rows } = buildPivotTable(schedGroup.rows);
            const periodCols = structure.reduce((sum, y) => sum + y.periods.length, 0);
            blocks.push({
                category: catGroup.category,
                isFirstOfCategory: idx === 0,
                scheduleText: schedGroup.scheduleText,
                structure, rows,
                cols: fixedCols + periodCols
            });
        });
    });

    const maxCols = blocks.reduce((m, b) => Math.max(m, b.cols), fixedCols);

    const aoa = [];
    const merges = [];
    const rowMeta = []; // one entry per aoa row, describes how to style it

    blocks.forEach(block => {

        if (block.isFirstOfCategory) {
            aoa.push([block.category]);
            merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: maxCols - 1 } });
            rowMeta.push({ kind: "title" });
        }

        aoa.push([`Échéancier : ${block.scheduleText}`]);
        merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: maxCols - 1 } });
        rowMeta.push({ kind: "subtitle" });

        const header1 = ["N° de marché", "STE"];
        const header2 = ["", ""];
        const headerRowIndex = aoa.length;
        merges.push({ s: { r: headerRowIndex, c: 0 }, e: { r: headerRowIndex + 1, c: 0 } });
        merges.push({ s: { r: headerRowIndex, c: 1 }, e: { r: headerRowIndex + 1, c: 1 } });

        const colYearIndex = [null, null];
        let col = fixedCols;

        block.structure.forEach((y, yi) => {

            const startCol = col;
            y.periods.forEach(p => {
                header1.push("");
                header2.push(splitPeriodLabel(p).join("\n"));
                colYearIndex.push(yi);
                col++;
            });

            merges.push({ s: { r: headerRowIndex, c: startCol }, e: { r: headerRowIndex, c: col - 1 } });
            header1[startCol] = y.year;

        });

        aoa.push(header1);
        rowMeta.push({ kind: "header0", fixedCols, colYearIndex, totalCols: col });
        aoa.push(header2);
        rowMeta.push({ kind: "header1", fixedCols, colYearIndex, totalCols: col });

        block.rows.forEach((r, i) => {

            const line = [r.number, r.name];

            block.structure.forEach(y => {
                y.periods.forEach(p => {
                    const val = r.cells[`${y.year}::${p}`];
                    line.push(val ? Number(val.toFixed(2)) : "");
                });
            });

            aoa.push(line);
            rowMeta.push({ kind: "data", fixedCols, totalCols: col, banded: i % 2 === 1 });

        });

        // Blank separator row between tables.
        aoa.push([]);
        rowMeta.push({ kind: "spacer" });

    });

    const pivotSheet = XLSX.utils.aoa_to_sheet(aoa);
    pivotSheet["!merges"] = merges;
    pivotSheet["!cols"] = [
        { wch: 16 }, { wch: 28 },
        ...Array(Math.max(0, maxCols - fixedCols)).fill({ wch: 13 })
    ];
    pivotSheet["!rows"] = rowMeta.map(m => {
        if (m.kind === "title") return { hpt: 20 };
        if (m.kind === "header0") return { hpt: 22 };
        if (m.kind === "header1") return { hpt: 32 };
        return undefined;
    });

    rowMeta.forEach((meta, r) => {

        if (meta.kind === "spacer") return;

        const totalCols = (meta.kind === "title" || meta.kind === "subtitle") ? maxCols : meta.totalCols;

        for (let c = 0; c < totalCols; c++) {

            const ref = XLSX.utils.encode_cell({ r, c });
            if (!pivotSheet[ref]) pivotSheet[ref] = { t: "s", v: "" };
            const cell = pivotSheet[ref];

            if (meta.kind === "title") {

                cell.s = {
                    fill: { fgColor: { rgb: "0F172A" } },
                    font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } },
                    alignment: { horizontal: "left", vertical: "center" }
                };

            } else if (meta.kind === "subtitle") {

                cell.s = {
                    fill: { fgColor: { rgb: "EEF2F7" } },
                    font: { italic: true, sz: 10, color: { rgb: "334155" } },
                    alignment: { horizontal: "left", vertical: "center" }
                };

            } else if (meta.kind === "header0" || meta.kind === "header1") {

                // Header rows: fixed columns get a dark navy fill, year
                // columns get their assigned color, period-date row
                // gets a soft blue-gray fill.
                let fill = "DCE6F1";
                if (c < meta.fixedCols) fill = "1E293B";
                else if (meta.kind === "header0") fill = YEAR_COLORS[(meta.colYearIndex[c] || 0) % YEAR_COLORS.length];

                cell.s = {
                    fill: { fgColor: { rgb: fill } },
                    font: { bold: true, sz: meta.kind === "header0" && c >= meta.fixedCols ? 11 : 9, color: { rgb: (c < meta.fixedCols || meta.kind === "header0") ? "FFFFFF" : "1E293B" } },
                    alignment: { horizontal: "center", vertical: "center", wrapText: true },
                    border: BORDER
                };

            } else if (meta.kind === "data") {

                const isFixed = c < meta.fixedCols;

                cell.s = {
                    fill: { fgColor: { rgb: meta.banded ? "F5F7FB" : "FFFFFF" } },
                    font: { sz: 10 },
                    alignment: { horizontal: isFixed ? "left" : "right", vertical: "center" },
                    border: BORDER,
                    numFmt: isFixed ? "@" : "#,##0.00"
                };

            }

        }

    });

    // Sheet 2 — the full flat table: every payment, one per row, kept
    // for anyone who wants to filter/pivot the raw data themselves.
    const detailData = buildFlatPaymentRows(payload).map(r => ({
        "N° de marché": r.number,
        "Entreprise": r.name,
        "Service": r.category,
        "Échéancier": r.schedule,
        "Début": r.startYear,
        "Année": r.year,
        "Période": r.period,
        "Montant": r.amount
    }));

    const detailSheet = XLSX.utils.json_to_sheet(detailData);
    detailSheet["!cols"] = [
        { wch: 14 }, { wch: 26 }, { wch: 16 }, { wch: 26 }, { wch: 8 },
        { wch: 8 }, { wch: 18 }, { wch: 14 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, pivotSheet, "Archives");
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Détail des paiements");

    XLSX.writeFile(workbook, exportFileName("xlsx"));

}

function exportToWord() {

    const payload = getExportPayload();
    const grouped = groupPayloadForExport(payload);

    // Alternating colors per year block, same spirit as the reference
    // spreadsheet (blue for one year, green for the next, and so on).
    const YEAR_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626"];

    // Same per-column widths (in mm) used for the PDF export, so both
    // documents size their pages the same way. Used here to (a) work
    // out how wide the page itself needs to be so Word never clips a
    // year off the right edge, and (b) give every table an explicit
    // <colgroup> so its columns keep sensible proportions instead of
    // Word auto-sizing them from cell content — that auto-sizing is
    // what let some tables grow wider than the page and lose their
    // rightmost (most recent) year columns.
    const COL_MM = { number: 24, name: 46, period: 16 };

    // One block per service, then per schedule within that service —
    // same grouping as the Excel export, so the Word doc reads the
    // same way. Every service gets its own title bar so which service
    // a table belongs to is always clearly labelled. Every block is
    // marked "avoid page break inside" so Word keeps each table (and
    // each of its rows) intact rather than splitting it across pages.
    const blocks = [];
    grouped.forEach(catGroup => {
        catGroup.scheduleGroups.forEach((schedGroup, idx) => {
            blocks.push({
                category: catGroup.category,
                isFirstOfCategory: idx === 0,
                scheduleText: schedGroup.scheduleText,
                pivot: buildPivotTable(schedGroup.rows)
            });
        });
    });

    let maxTableWidthMm = 0;
    blocks.forEach(b => {
        const periodCols = b.pivot.structure.reduce((s, y) => s + y.periods.length, 0);
        b.tableWidthMm = COL_MM.number + COL_MM.name + periodCols * COL_MM.period;
        maxTableWidthMm = Math.max(maxTableWidthMm, b.tableWidthMm);
    });

    const marginCm = 1.2;
    // The page is sized to the widest table (converted mm -> cm), with
    // a sane minimum of an A4-landscape width for narrow archives.
    const pageWidthCm = Math.max(maxTableWidthMm / 10 + marginCm * 2, 29.7);
    const pageHeightCm = 21;

    const sections = blocks.map(block => {

        const { structure, rows } = block.pivot;
        const periodCols = structure.reduce((s, y) => s + y.periods.length, 0);

        const numberPct = (COL_MM.number / block.tableWidthMm * 100).toFixed(2);
        const namePct = (COL_MM.name / block.tableWidthMm * 100).toFixed(2);
        const periodPct = (COL_MM.period / block.tableWidthMm * 100).toFixed(2);
        const colgroup = `
            <colgroup>
                <col style="width:${numberPct}%">
                <col style="width:${namePct}%">
                ${Array(periodCols).fill(`<col style="width:${periodPct}%">`).join("")}
            </colgroup>
        `;

        const yearHeaderCells = structure.map((y, i) =>
            `<th colspan="${y.periods.length}" class="year-head" style="background:${YEAR_COLORS[i % YEAR_COLORS.length]};">${y.year}</th>`
        ).join("");

        const periodHeaderCells = structure.map(y =>
            y.periods.map(p =>
                `<th class="period-head">${escapeHtml(splitPeriodLabel(p).join("<br>"))}</th>`
            ).join("")
        ).join("");

        const bodyRows = rows.map(r => {

            const cells = structure.map(y =>
                y.periods.map(p => {
                    const val = r.cells[`${y.year}::${p}`];
                    return `<td class="amount">${val ? formatMoney(val) : ""}</td>`;
                }).join("")
            ).join("");

            return `
                <tr>
                    <td>${escapeHtml(r.number)}</td>
                    <td>${escapeHtml(r.name)}</td>
                    ${cells}
                </tr>
            `;

        }).join("");

        return `
            ${block.isFirstOfCategory ? `<h2 class="category-title">${escapeHtml(block.category)}</h2>` : ""}
            <div class="table-block">
                <h3>Échéancier : ${escapeHtml(block.scheduleText)}</h3>
                <table class="pivot">
                    ${colgroup}
                    <thead>
                        <tr>
                            <th rowspan="2" style="background:#1e293b;">N° de marché</th>
                            <th rowspan="2" style="background:#1e293b;">STE</th>
                            ${yearHeaderCells}
                        </tr>
                        <tr>
                            ${periodHeaderCells}
                        </tr>
                    </thead>
                    <tbody>
                        ${bodyRows}
                    </tbody>
                </table>
            </div>
        `;

    }).join("");

    const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="utf-8">
            <title>Archive des entreprises</title>
            <style>
                @page {
                    /* Width/height are given directly as the final
                       printed dimensions (width already bigger than
                       height = landscape) — no mso-page-orientation
                       swap, which is what let the page render
                       narrower than intended and clip the right-most
                       (most recent) year columns off the page. Width
                       is computed from the widest table so every year
                       column always fits. */
                    size: ${pageWidthCm.toFixed(1)}cm ${pageHeightCm}cm;
                    margin: ${marginCm}cm;
                }
                body{ font-family:Calibri,Arial,sans-serif; }
                h1{ color:#2563eb; font-size:20px; }
                h2.category-title{ background:#0f172a; color:#fff; font-size:14px; padding:6px 10px; margin:18px 0 6px 0; }
                h3{ color:#475569; font-size:12px; font-style:italic; margin-top:0; margin-bottom:4px; }
                p.meta-top{ color:#666; font-size:12px; margin-bottom:20px; }
                .table-block{
                    page-break-inside: avoid;
                    break-inside: avoid;
                    margin-bottom:16px;
                }
                table.pivot{ border-collapse:collapse; width:100%; margin-bottom:10px; page-break-inside:avoid; table-layout:fixed; }
                table.pivot th, table.pivot td{ border:1px solid #94a3b8; padding:4px 6px; font-size:9px; word-wrap:break-word; overflow:hidden; }
                table.pivot thead th{ color:#fff; text-align:center; }
                table.pivot thead th.period-head{ background:#e6ebf5; color:#1e293b; font-size:8px; }
                table.pivot tbody td{ text-align:right; }
                table.pivot tbody td:nth-child(1),
                table.pivot tbody td:nth-child(2){ text-align:left; }
                /* If a table is still too tall for one page, at least
                   never split a single row across the page break. */
                table.pivot tr{ page-break-inside:avoid; }
                table.pivot tbody tr:nth-child(even){ background:#f5f7fb; }
            </style>
        </head>
        <body>
            <h1>Archive des entreprises — PAYTRACK</h1>
            <p class="meta-top">Généré le ${new Date().toLocaleDateString("fr-FR")} — ${payload.length} entreprise(s)</p>
            ${sections}
        </body>
        </html>
    `;

    const blob = new Blob(['\ufeff', html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName("doc");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

}



// ======================================================
// MAIN RENDER ENTRY POINT
// ======================================================

function renderArchivePage() {

    const companies = loadCompanies();
    const amounts = loadPaymentAmounts();

    if (companies.length === 0) {
        renderEmptyState();
        currentRows = [];
        rowsByKey.clear();
        return;
    }

    const rows = buildRows(companies, amounts);
    currentRows = rows;

    rowsByKey.clear();
    rows.forEach(row => rowsByKey.set(row.domKey, row));

    populateFilterOptions(rows);
    renderArchiveTable(rows);
    attachEvents(rows);
    applyFilters(rows);

}


// ======================================================
// INITIALIZE + AUTO-REFRESH
// ======================================================

renderArchivePage();

if (refreshBtn) {
    refreshBtn.addEventListener("click", renderArchivePage);
}

if (clearHighlightsBtn) {
    clearHighlightsBtn.addEventListener("click", clearAllHighlights);
}

window.addEventListener("storage", function (e) {

    if (e.key === COMPANIES_KEY || e.key === PAYMENTS_KEY) {
        renderArchivePage();
    }

});

const exportPdfBtn = document.getElementById("exportPDF");
if (exportPdfBtn) exportPdfBtn.addEventListener("click", exportToPdf);

const exportExcelBtn = document.getElementById("exportExcel");
if (exportExcelBtn) exportExcelBtn.addEventListener("click", exportToExcel);

const exportWordBtn = document.getElementById("exportWord");
if (exportWordBtn) exportWordBtn.addEventListener("click", exportToWord);