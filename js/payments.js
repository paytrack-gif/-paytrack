// ======================================================
// MUNICIPALITY MANAGEMENT SYSTEM — PAYTRACK
// payments.js
// Reads companies from localStorage ("companies") and
// automatically builds payment tables grouped by Service.
// Within a service, companies with the same Échéancier
// share one table; different schedules get their own table,
// but the service name is only shown once per service.
// Each table covers every year from the earliest contract
// start date until today, displayed one year at a time via
// tabs (instead of stacking every year's columns at once)
// to keep things clean.
// ======================================================

const COMPANIES_KEY = "companies";
const PAYMENTS_KEY = "paymentAmounts";
const PERIODS_KEY = "paymentPeriodOverrides";

const paymentsContainer = document.getElementById("paymentsContainer");
const refreshBtn = document.getElementById("refreshPayments");

const CURRENT_YEAR = new Date().getFullYear();


// ======================================================
// STORAGE HELPERS
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

function savePaymentAmounts(data) {

    localStorage.setItem(PAYMENTS_KEY, JSON.stringify(data));

}

// Sums every value stored for a company, across every year — used for
// the "Total cumulé" column, which always reflects the full history
// regardless of which year tab is currently active.
function sumRowAmounts(rowAmounts) {

    let total = 0;

    Object.keys(rowAmounts || {}).forEach(k => {
        const val = parseFloat(rowAmounts[k]);
        if (!isNaN(val)) total += val;
    });

    return total;

}

// Formats a number the way the rest of the app should show money:
// thousands separator + 2 decimals, so big totals stay readable
// (e.g. 1 234 567,89 instead of 1234567.89).
function formatMoney(value) {

    const num = Number(value) || 0;
    return num.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

}


// ======================================================
// EDITABLE PERIODS (ÉCHÉANCIER PER YEAR)
// A table's default "schedule" (from the company records)
// is only a starting point. Any year can be customised —
// periods renamed, added, or removed — without affecting
// other years. Overrides are stored per table (identified
// by its default schedule) and per year.
// ======================================================

function loadPeriodOverrides() {

    try {
        return JSON.parse(localStorage.getItem(PERIODS_KEY)) || {};
    } catch (e) {
        return {};
    }

}

function savePeriodOverrides(data) {

    localStorage.setItem(PERIODS_KEY, JSON.stringify(data));

}

// Default periods get a stable id based on their position, so amounts
// saved before this feature existed can still be found and displayed.
function buildDefaultPeriods(scheduleArr) {

    return (scheduleArr || []).map((label, i) => ({ id: "d" + i, label }));

}

function makePeriodId() {

    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

}

// Returns the periods to use for a given table + year: the saved
// override if the user has customised that year, otherwise the
// table's default schedule.
function getYearPeriods(scheduleKey, year, defaultSchedule) {

    const overrides = loadPeriodOverrides();
    const tableOverrides = overrides[scheduleKey];

    if (tableOverrides && Array.isArray(tableOverrides[year])) {
        return tableOverrides[year].map(p => ({ ...p }));
    }

    return buildDefaultPeriods(defaultSchedule);

}

function setYearPeriods(scheduleKey, year, periods) {

    const overrides = loadPeriodOverrides();
    if (!overrides[scheduleKey]) overrides[scheduleKey] = {};
    overrides[scheduleKey][year] = periods.map(p => ({ id: p.id, label: p.label }));
    savePeriodOverrides(overrides);

}

// Looks up a stored amount for one period/year, falling back to the
// older storage formats used before periods were editable, so no
// historical data is ever lost or hidden.
function getStoredAmount(rowAmounts, year, period) {

    let value = rowAmounts[year + "::id::" + period.id];
    if (value != null) return value;

    // Legacy: saved back when periods were fixed and identified by label.
    value = rowAmounts[year + "::" + period.label];
    if (value != null) return value;

    // Very old legacy: saved before years existed at all.
    if (year === CURRENT_YEAR && rowAmounts[period.label] != null) {
        return rowAmounts[period.label];
    }

    return null;

}


// ======================================================
// COMPANY IDENTITY
// A company is identified by its "N° de marché" whenever
// possible (it is meant to be unique). If it is missing,
// fall back to a composite key so amounts still survive
// a page refresh without touching the company records.
// ======================================================

function getCompanyKey(company) {

    if (company.number && String(company.number).trim() !== "") {
        return "num:" + String(company.number).trim();
    }

    return "gen:" + [company.name, company.category, company.startYear].join("|");

}

function getCompanyStartYear(company, fallback) {

    const parsed = parseInt(company.startYear, 10);
    return Number.isFinite(parsed) ? parsed : fallback;

}


// ======================================================
// GROUPING
// Step 1 — group by Service (category), so the service name
// is only shown once, no matter how many schedule variants
// it contains.
// Step 2 — inside each service, group companies further by
// their full Échéancier (array of periods, in the same
// order). Same schedule => same table. Different schedule
// => a separate table under the same service heading.
// ======================================================

function groupByService(companies) {

    const serviceMap = new Map();

    companies.forEach((company, index) => {

        const schedule = Array.isArray(company.schedule) ? company.schedule : [];

        if (schedule.length === 0) {
            // Skip companies without a usable payment schedule instead of
            // crashing the whole page on bad/legacy data.
            return;
        }

        const category = company.category || "Sans service";

        if (!serviceMap.has(category)) {
            serviceMap.set(category, new Map());
        }

        const scheduleMap = serviceMap.get(category);
        const scheduleKey = JSON.stringify(schedule);

        if (!scheduleMap.has(scheduleKey)) {
            scheduleMap.set(scheduleKey, { schedule, companies: [] });
        }

        scheduleMap.get(scheduleKey).companies.push({ ...company, originalIndex: index });

    });

    // Stable, readable order: services alphabetically, then schedule variants by length/label
    return Array.from(serviceMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([category, scheduleMap]) => ({
            category,
            subgroups: Array.from(scheduleMap.values())
                .sort((a, b) => a.schedule.join(",").localeCompare(b.schedule.join(",")))
        }));

}


// ======================================================
// RENDER
// ======================================================

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
}

function renderEmptyState() {

    paymentsContainer.innerHTML = `
        <div class="table-card" style="text-align:center; padding:60px 30px; color:#888;">
            <i class="fa-solid fa-file-invoice-dollar" style="font-size:34px; color:#c7cad1; margin-bottom:14px;"></i>
            <h2 style="margin-bottom:8px;">Aucun paiement à afficher</h2>
            <p>Ajoutez d'abord des entreprises depuis la page « Entreprises » pour générer automatiquement les tableaux de paiement.</p>
        </div>
    `;

}

function renderGroups(serviceGroups, amounts) {

    paymentsContainer.innerHTML = "";

    serviceGroups.forEach(serviceGroup => {

        const section = document.createElement("div");
        section.className = "service-section";

        const heading = document.createElement("div");
        heading.className = "service-heading";
        heading.innerHTML = `<h2><i class="fa-solid fa-layer-group"></i> Service : ${escapeHtml(serviceGroup.category)}</h2>`;
        section.appendChild(heading);

        const showSubtitle = serviceGroup.subgroups.length > 1;

        serviceGroup.subgroups.forEach(subgroup => {

            section.appendChild(renderGroupTable(subgroup, amounts, showSubtitle));

        });

        paymentsContainer.appendChild(section);

    });

}

// Builds the <th> cells for a set of periods: an editable label plus a
// small delete button, so the échéancier can be corrected per year
// directly in the table (e.g. a company with 4 fixed periods in 2023
// but only 2 in 2024).
function buildPeriodHeadersHtml(periods) {

    return periods.map(p => `
        <th class="period-header-cell" data-period-id="${escapeHtml(p.id)}">
            <div class="period-header">
                <input
                    type="text"
                    class="period-label-input"
                    data-period-id="${escapeHtml(p.id)}"
                    value="${escapeHtml(p.label)}">
                <button
                    type="button"
                    class="period-remove-btn"
                    data-period-id="${escapeHtml(p.id)}"
                    title="Supprimer cette période">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </th>
    `).join("");

}

function renderPeriodPillsHtml(periods) {

    return periods.map(p => `<span>${escapeHtml(p.label)}</span>`).join("");

}

// Builds the amount <td> cells for one row, for a given set of periods.
// `active` reflects the whole year (company started that year or
// earlier) — every period in the year is left open for input even if
// its calendar date hasn't happened yet, since the user may want to
// leave it empty until then.
function buildRowPeriodCells(periods, key, rowAmounts, active, year) {

    return periods.map(p => {

        const value = getStoredAmount(rowAmounts, year, p);

        return `
            <td class="period-cell">
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    class="payment-input"
                    placeholder="${active ? "0.00" : "—"}"
                    data-key="${escapeHtml(key)}"
                    data-period-id="${escapeHtml(p.id)}"
                    data-period-label="${escapeHtml(p.label)}"
                    data-year="${year}"
                    value="${active && value != null ? escapeHtml(value) : ""}"
                    ${active ? "" : "disabled"}>
            </td>
        `;

    }).join("");

}

function renderGroupTable(group, amounts, showSubtitle) {

    const card = document.createElement("div");
    card.className = "table-card";
    card.style.marginBottom = "25px";

    // Identifies this table for period overrides — its default
    // (as-recorded) schedule, kept on the element itself so later
    // year-tab switches/edits don't need to re-derive it.
    const scheduleKey = JSON.stringify(group.schedule);
    card._scheduleKey = scheduleKey;
    card._defaultSchedule = group.schedule.slice();
    card._activeYear = CURRENT_YEAR;

    // Year range: from the earliest contract start date in this table, until today.
    const startYears = group.companies.map(c => getCompanyStartYear(c, CURRENT_YEAR));
    const minYear = Math.min(CURRENT_YEAR, ...startYears);

    const years = [];
    for (let y = minYear; y <= CURRENT_YEAR; y++) years.push(y);

    const activePeriods = getYearPeriods(scheduleKey, CURRENT_YEAR, group.schedule);

    const yearTabsHtml = years.map(y => `
        <button type="button" class="year-tab ${y === CURRENT_YEAR ? "active" : ""}" data-year="${y}">
            ${y}
        </button>
    `).join("");

    const periodHeadersHtml = buildPeriodHeadersHtml(activePeriods);

    const rowsHtml = group.companies.map((company, rowIndex) => {

        const key = getCompanyKey(company);
        const rowAmounts = amounts[key] || {};
        const companyStartYear = getCompanyStartYear(company, minYear);
        const active = CURRENT_YEAR >= companyStartYear;

        const periodCellsHtml = buildRowPeriodCells(activePeriods, key, rowAmounts, active, CURRENT_YEAR);

        return `
            <tr data-key="${escapeHtml(key)}" data-start-year="${companyStartYear}">
                <td>${rowIndex + 1}</td>
                <td>${escapeHtml(company.number)}</td>
                <td>${escapeHtml(company.name)}</td>
                <td class="row-actions-cell" style="text-align:center;">
                    <button
                        type="button"
                        class="row-menu-btn"
                        data-key="${escapeHtml(key)}"
                        data-name="${escapeHtml(company.name)}"
                        data-object="${escapeHtml(company.object)}"
                        data-comment="${escapeHtml(company.comment)}"
                        title="Actions">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </button>
                </td>
                ${periodCellsHtml}
                <td class="year-total-cell">0,00</td>
                <td class="row-total">0,00</td>
            </tr>
        `;

    }).join("");

    const subtitleHtml = showSubtitle ? `
        <p class="subgroup-subtitle">
            <i class="fa-solid fa-calendar-days"></i>
            Échéancier : ${group.schedule.length} période(s) par an — suivi depuis ${minYear}
        </p>
    ` : `
        <p class="subgroup-subtitle">
            <i class="fa-solid fa-calendar-days"></i>
            Suivi depuis ${minYear}
        </p>
    `;

    card.innerHTML = `
        ${subtitleHtml}

        <div class="schedule-preview-row">
            <div class="schedule-preview" data-role="schedule-preview">
                ${renderPeriodPillsHtml(activePeriods)}
            </div>
            <button type="button" class="btn btn-add-period" title="Ajouter une période pour l'année affichée">
                <i class="fa-solid fa-plus"></i> Période
            </button>
        </div>

        <div class="year-tabs">
            ${yearTabsHtml}
        </div>

        <div class="table-wrapper">
            <table class="payments-table">
                <thead>
                    <tr>
                        <th>N°</th>
                        <th>N° de marché</th>
                        <th>Entreprise</th>
                        <th></th>
                        ${periodHeadersHtml}
                        <th class="active-year-total-header">Total ${CURRENT_YEAR}</th>
                        <th>Total cumulé</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;

    return card;

}


// ======================================================
// TOTALS
// "Total {year}" columns/rows reflect whichever year tab is
// active. "Total cumulé" always reflects every year on record,
// regardless of the active tab.
// ======================================================

function recalculateGroupTotals(card) {

    const amounts = loadPaymentAmounts();

    card.querySelectorAll("tbody tr").forEach(row => {

        let rowYearTotal = 0;
        const key = row.dataset.key;

        row.querySelectorAll(".payment-input").forEach(input => {

            const val = parseFloat(input.value);
            const amount = (input.disabled || isNaN(val)) ? 0 : val;

            rowYearTotal += amount;

        });

        const yearTotalCell = row.querySelector(".year-total-cell");
        if (yearTotalCell) yearTotalCell.textContent = formatMoney(rowYearTotal);

        const rowAmounts = amounts[key] || {};
        const rowGlobalTotal = sumRowAmounts(rowAmounts);

        const globalCell = row.querySelector(".row-total");
        if (globalCell) globalCell.textContent = formatMoney(rowGlobalTotal);

    });

}

function recalculateAllTotals() {

    document.querySelectorAll(".table-card").forEach(card => {
        if (card.querySelector("tbody")) recalculateGroupTotals(card);
    });

}


// ======================================================
// YEAR TABS
// Only one year's periods are shown/editable at a time —
// switching tabs re-populates the same set of input cells
// with that year's stored values instead of stacking every
// year side by side.
// ======================================================

function activateYearTab(card, year) {

    year = parseInt(year, 10);
    card._activeYear = year;

    card.querySelectorAll(".year-tab").forEach(tab => {
        tab.classList.toggle("active", parseInt(tab.dataset.year, 10) === year);
    });

    const header = card.querySelector(".active-year-total-header");
    if (header) header.textContent = "Total " + year;

    // Periods can differ from one year to the next, so switching tabs
    // rebuilds the period columns for the newly-selected year rather
    // than just refilling the same set of cells.
    rebuildPeriodColumns(card, year);

}

// Rebuilds the period-related headers and row cells for a table to
// match whichever year is now active — used when switching year tabs,
// and when a period is added/renamed/removed.
function rebuildPeriodColumns(card, year) {

    const periods = getYearPeriods(card._scheduleKey, year, card._defaultSchedule);
    const amounts = loadPaymentAmounts();

    // --- Header row ---
    const headRow = card.querySelector("thead tr");
    headRow.querySelectorAll(".period-header-cell").forEach(th => th.remove());
    const headAnchor = headRow.querySelector(".active-year-total-header");
    headAnchor.insertAdjacentHTML("beforebegin", buildPeriodHeadersHtml(periods));

    // --- Pills preview ---
    const pillsWrap = card.querySelector('[data-role="schedule-preview"]');
    if (pillsWrap) pillsWrap.innerHTML = renderPeriodPillsHtml(periods);

    // --- Body rows ---
    card.querySelectorAll("tbody tr").forEach(row => {

        const key = row.dataset.key;
        const startYear = parseInt(row.dataset.startYear, 10);
        const active = year >= startYear;
        const rowAmounts = amounts[key] || {};

        row.querySelectorAll(".period-cell").forEach(td => td.remove());
        const rowAnchor = row.querySelector(".row-actions-cell");
        rowAnchor.insertAdjacentHTML("afterend", buildRowPeriodCells(periods, key, rowAmounts, active, year));

    });

    attachPeriodEvents(card);
    attachPaymentInputEvents(card);
    recalculateGroupTotals(card);

}


// ======================================================
// PERIOD EDITING — rename / add / remove
// ======================================================

function renamePeriod(card, periodId, newLabel) {

    newLabel = newLabel.trim();
    if (newLabel === "") newLabel = "Période";

    const year = card._activeYear;
    const periods = getYearPeriods(card._scheduleKey, year, card._defaultSchedule);
    const period = periods.find(p => p.id === periodId);
    if (!period) return;

    period.label = newLabel;
    setYearPeriods(card._scheduleKey, year, periods);

    // Update the pills preview and the amount inputs' label (used for
    // legacy lookups) without a full rebuild, so focus isn't lost.
    const pillsWrap = card.querySelector('[data-role="schedule-preview"]');
    if (pillsWrap) pillsWrap.innerHTML = renderPeriodPillsHtml(periods);

    card.querySelectorAll(`.payment-input[data-period-id="${periodId}"]`).forEach(input => {
        input.dataset.periodLabel = newLabel;
    });

}

function removePeriod(card, periodId) {

    const year = card._activeYear;
    const periods = getYearPeriods(card._scheduleKey, year, card._defaultSchedule);

    if (periods.length <= 1) {
        alert("Il doit rester au moins une période.");
        return;
    }

    const removedPeriod = periods.find(p => p.id === periodId);
    const label = removedPeriod ? removedPeriod.label : "";

    if (!confirm(`Supprimer la période « ${label} » pour l'année ${year} ? Les montants déjà saisis pour cette période et cette année seront supprimés.`)) {
        return;
    }

    const remaining = periods.filter(p => p.id !== periodId);
    setYearPeriods(card._scheduleKey, year, remaining);

    // Clean up any stored amounts tied to the removed period/year so the
    // cumulative total stays consistent with what's displayed.
    const amounts = loadPaymentAmounts();
    let changed = false;

    Object.keys(amounts).forEach(key => {

        const rowAmounts = amounts[key];
        if (!rowAmounts) return;

        const keysToDelete = [
            year + "::id::" + periodId,
            year + "::" + label
        ];

        if (year === CURRENT_YEAR) keysToDelete.push(label);

        keysToDelete.forEach(k => {
            if (rowAmounts[k] != null) {
                delete rowAmounts[k];
                changed = true;
            }
        });

    });

    if (changed) savePaymentAmounts(amounts);

    rebuildPeriodColumns(card, year);

}

function addPeriodToActiveYear(card) {

    const year = card._activeYear;
    const periods = getYearPeriods(card._scheduleKey, year, card._defaultSchedule);

    const newPeriod = { id: makePeriodId(), label: "Nouvelle période" };
    periods.push(newPeriod);
    setYearPeriods(card._scheduleKey, year, periods);

    rebuildPeriodColumns(card, year);

    // Focus the new period's label so it can be renamed right away.
    const newInput = card.querySelector(`.period-label-input[data-period-id="${newPeriod.id}"]`);
    if (newInput) {
        newInput.focus();
        newInput.select();
    }

}


// ======================================================
// EVENTS
// ======================================================

function attachPaymentEvents() {

    paymentsContainer.querySelectorAll(".year-tab").forEach(tab => {

        tab.addEventListener("click", function () {
            const card = this.closest(".table-card");
            if (card) activateYearTab(card, this.dataset.year);
        });

    });

    paymentsContainer.querySelectorAll(".row-menu-btn").forEach(btn => {

        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            toggleRowMenu(this);
        });

    });

    paymentsContainer.querySelectorAll(".btn-add-period").forEach(btn => {

        btn.addEventListener("click", function () {
            const card = this.closest(".table-card");
            if (card) addPeriodToActiveYear(card);
        });

    });

    paymentsContainer.querySelectorAll(".table-card").forEach(card => {
        attachPeriodEvents(card);
        attachPaymentInputEvents(card);
    });

}

// Binds the rename (label) and remove (×) controls for whichever period
// headers currently exist in a table — called on first render and again
// after every rebuild, since those header elements get recreated.
function attachPeriodEvents(card) {

    card.querySelectorAll(".period-label-input").forEach(input => {

        input.addEventListener("change", function () {
            renamePeriod(card, this.dataset.periodId, this.value);
        });

    });

    card.querySelectorAll(".period-remove-btn").forEach(btn => {

        btn.addEventListener("click", function () {
            removePeriod(card, this.dataset.periodId);
        });

    });

}

// Binds the amount inputs for whichever period cells currently exist in
// a table — called on first render and again after every rebuild.
function attachPaymentInputEvents(card) {

    card.querySelectorAll(".payment-input").forEach(input => {

        input.addEventListener("input", function () {

            const key = this.dataset.key;
            const periodId = this.dataset.periodId;
            const periodLabel = this.dataset.periodLabel;
            const year = this.dataset.year;
            const storageKey = year + "::id::" + periodId;

            const amounts = loadPaymentAmounts();
            if (!amounts[key]) amounts[key] = {};

            if (this.value.trim() === "") {
                delete amounts[key][storageKey];
            } else {
                amounts[key][storageKey] = this.value;
                // Clean up older-format keys for this same period/year so
                // the same figure is never counted twice in the totals.
                delete amounts[key][year + "::" + periodLabel];
                delete amounts[key][periodLabel];
            }

            savePaymentAmounts(amounts);

            recalculateGroupTotals(card);

        });

    });

}


// ======================================================
// ROW MENU (⋮) — Voir détails / Réinitialiser
// Rendered as a floating popover attached to <body> so it
// is never clipped by the table's scroll containers.
// ======================================================

function closeAllRowMenus() {

    document.querySelectorAll(".row-menu-popover").forEach(el => el.remove());
    document.querySelectorAll(".row-menu-btn.active").forEach(b => b.classList.remove("active"));

}

function toggleRowMenu(btn) {

    const alreadyOpen = btn.classList.contains("active");
    closeAllRowMenus();

    if (alreadyOpen) return;

    btn.classList.add("active");

    const rect = btn.getBoundingClientRect();

    const popover = document.createElement("div");
    popover.className = "row-menu-popover";

    const popoverWidth = 190;
    const popoverHeight = 92; // two menu items, ~46px each

    // The popover is position:fixed (viewport-relative), so its
    // coordinates come straight from getBoundingClientRect() —
    // adding window.scrollY/scrollX here would push it off-screen
    // as soon as the page (or the table) is scrolled.
    let top = rect.bottom + 6;
    let left = rect.right - popoverWidth;

    // Flip above the button if there isn't room below (e.g. last rows
    // of a long table), and keep it from spilling past either edge.
    if (top + popoverHeight > window.innerHeight) {
        top = rect.top - popoverHeight - 6;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8));

    popover.style.top = top + "px";
    popover.style.left = left + "px";

    popover.innerHTML = `
        <button type="button" class="row-menu-item">
            <i class="fa-solid fa-circle-info"></i> Voir détails
        </button>
        <button type="button" class="row-menu-item row-menu-danger">
            <i class="fa-solid fa-trash"></i> Réinitialiser
        </button>
    `;

    const [detailsItem, resetItem] = popover.querySelectorAll(".row-menu-item");

    detailsItem.addEventListener("click", function () {
        openDetailsModal(btn.dataset.name, btn.dataset.object, btn.dataset.comment);
        closeAllRowMenus();
    });

    resetItem.addEventListener("click", function () {

        closeAllRowMenus();

        if (!confirm("Réinitialiser tous les paiements de cette entreprise ?")) return;

        const key = btn.dataset.key;
        const amounts = loadPaymentAmounts();
        delete amounts[key];
        savePaymentAmounts(amounts);

        renderPaymentsPage();

    });

    document.body.appendChild(popover);

}

document.addEventListener("click", function (e) {
    if (!e.target.closest(".row-menu-btn") && !e.target.closest(".row-menu-popover")) {
        closeAllRowMenus();
    }
});


// ======================================================
// DETAILS MODAL (Objet / Commentaires on click)
// Keeps the tables compact — the two long text fields are
// only shown when the user opens the row menu.
// ======================================================

const detailsModal = document.getElementById("detailsModal");
const detailsModalTitle = document.getElementById("detailsModalTitle");
const detailsModalObject = document.getElementById("detailsModalObject");
const detailsModalComment = document.getElementById("detailsModalComment");
const closeDetailsModalBtn = document.getElementById("closeDetailsModal");

function openDetailsModal(name, object, comment) {

    if (!detailsModal) return;

    detailsModalTitle.textContent = name || "Détails";
    detailsModalObject.textContent = object && object.trim() !== "" ? object : "—";
    detailsModalComment.textContent = comment && comment.trim() !== "" ? comment : "—";

    detailsModal.classList.add("show");

}

function closeDetailsModal() {
    if (detailsModal) detailsModal.classList.remove("show");
}

if (closeDetailsModalBtn) {
    closeDetailsModalBtn.addEventListener("click", closeDetailsModal);
}

if (detailsModal) {

    // Close when clicking the dark overlay (outside the modal content)
    detailsModal.addEventListener("click", function (e) {
        if (e.target === detailsModal) closeDetailsModal();
    });

}

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
        closeDetailsModal();
        closeAllRowMenus();
    }
});


// ======================================================
// MAIN RENDER ENTRY POINT
// ======================================================

function renderPaymentsPage() {

    const companies = loadCompanies();
    const amounts = loadPaymentAmounts();

    if (companies.length === 0) {
        renderEmptyState();
        return;
    }

    const serviceGroups = groupByService(companies);

    if (serviceGroups.length === 0) {
        renderEmptyState();
        return;
    }

    renderGroups(serviceGroups, amounts);
    attachPaymentEvents();
    recalculateAllTotals();

}


// ======================================================
// INITIALIZE + AUTO-REFRESH
// ======================================================

renderPaymentsPage();

if (refreshBtn) {
    refreshBtn.addEventListener("click", renderPaymentsPage);
}

// Keep the page in sync if companies are added/edited/deleted
// in another browser tab (localStorage "storage" event only
// fires across tabs, not within the same tab — refreshing the
// page itself always re-reads localStorage from scratch).
window.addEventListener("storage", function (e) {

    if (e.key === COMPANIES_KEY || e.key === PAYMENTS_KEY) {
        renderPaymentsPage();
    }

});
doc.text("Service : Nettoyage", 14, 15);

doc.autoTable({
    html: "#paymentTable1",
    startY: 25
});

doc.save("Paiements_Nettoyage_2025.pdf");