// ======================================================
// MUNICIPALITY MANAGEMENT SYSTEM — PAYTRACK
// dashboard.js
//
// Layout: KPIs -> quick actions -> "Périodes non payées"
// (by service / by year, in the original chart position) ->
// full Classement des entreprises (every company, not just
// a top slice) -> recently added companies.
//
// Every section renders inside its own try/catch so one
// failing section can never blank out the rest of the page.
// ======================================================

const COMPANIES_KEY = "companies";
const PAYMENTS_KEY = "paymentAmounts";
const PERIODS_KEY = "paymentPeriodOverrides";


// ======================================================
// STORAGE HELPERS
// ======================================================

function loadCompanies() {
    try {
        return JSON.parse(localStorage.getItem(COMPANIES_KEY)) || [];
    } catch (e) {
        console.error("PAYTRACK dashboard: could not read companies from storage", e);
        return [];
    }
}

function loadPaymentAmounts() {
    try {
        return JSON.parse(localStorage.getItem(PAYMENTS_KEY)) || {};
    } catch (e) {
        console.error("PAYTRACK dashboard: could not read payments from storage", e);
        return {};
    }
}

function loadPeriodOverrides() {
    try {
        return JSON.parse(localStorage.getItem(PERIODS_KEY)) || {};
    } catch (e) {
        console.error("PAYTRACK dashboard: could not read period overrides from storage", e);
        return {};
    }
}

function getCompanyKey(company) {
    if (company.number && String(company.number).trim() !== "") {
        return "num:" + String(company.number).trim();
    }
    return "gen:" + [company.name, company.category, company.startYear].join("|");
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

function safeText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function safeHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}


// ======================================================
// PAYMENT HISTORY (same convention as archive.js)
// ======================================================

function resolvePeriodLabel(company, year, periodId) {

    const scheduleKey = JSON.stringify(Array.isArray(company.schedule) ? company.schedule : []);
    const overrides = loadPeriodOverrides();
    const tableOverrides = overrides[scheduleKey];

    if (tableOverrides && Array.isArray(tableOverrides[year])) {
        const found = tableOverrides[year].find(p => p.id === periodId);
        if (found) return found.label;
    }

    const match = /^d(\d+)$/.exec(periodId);
    if (match && Array.isArray(company.schedule)) {
        const idx = parseInt(match[1], 10);
        if (company.schedule[idx] != null) return company.schedule[idx];
        return `Période ${idx + 1}`;
    }

    return periodId;

}

function buildPaymentHistory(company, rowAmounts) {

    const byYear = {};

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
            return;
        }

        if (!byYear[year]) byYear[year] = [];
        byYear[year].push({ label, amount: val });

    });

    return byYear;

}

function getScheduleLabelsForYear(company, year) {

    const scheduleKey = JSON.stringify(Array.isArray(company.schedule) ? company.schedule : []);
    const overrides = loadPeriodOverrides();
    const tableOverrides = overrides[scheduleKey];

    if (tableOverrides && Array.isArray(tableOverrides[year])) {
        return tableOverrides[year].map(p => p.label);
    }

    return Array.isArray(company.schedule) ? company.schedule.slice() : [];

}


// ======================================================
// DATA MODEL
// ======================================================

function buildDashboardModel() {

    const companies = loadCompanies();
    const amounts = loadPaymentAmounts();
    const currentYear = new Date().getFullYear();

    const rows = companies.map((company, index) => {

        const key = getCompanyKey(company);
        const rowAmounts = amounts[key] || {};
        const byYear = buildPaymentHistory(company, rowAmounts);

        let total = 0;
        const yearTotals = {};
        Object.keys(byYear).forEach(y => {
            const yearTotal = byYear[y].reduce((s, e) => s + e.amount, 0);
            yearTotals[y] = yearTotal;
            total += yearTotal;
        });

        const pending = [];
        const startYear = parseInt(company.startYear, 10) || currentYear;

        for (let year = startYear; year <= currentYear; year++) {
            const expectedLabels = getScheduleLabelsForYear(company, year);
            if (expectedLabels.length === 0) continue;
            const recordedLabels = new Set((byYear[year] || []).map(e => e.label));
            expectedLabels.forEach(label => {
                if (!recordedLabels.has(label)) pending.push({ year, label });
            });
        }

        return {
            index,
            company,
            number: company.number || "—",
            name: company.name || "—",
            category: company.category || "—",
            startYear,
            total,
            yearTotals,
            pending
        };

    });

    return { companies: rows, currentYear };

}

let model = null;
let selectedYear = "";

function filteredRows() {
    return model ? model.companies : [];
}

function scopedTotal(row) {
    if (selectedYear) return row.yearTotals[selectedYear] || 0;
    return row.total;
}

function scopedPending(row) {
    if (selectedYear) return row.pending.filter(p => String(p.year) === String(selectedYear));
    return row.pending;
}


// ======================================================
// GREETING + DATE
// ======================================================

function renderGreeting() {
    try {
        const hour = new Date().getHours();
        const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
        safeText("dashboardGreeting", `${greeting} — voici où en est PAYTRACK`);

        const dateStr = new Date().toLocaleDateString("fr-FR", {
            weekday: "long", year: "numeric", month: "long", day: "numeric"
        });
        safeText("dashboardDate", dateStr.charAt(0).toUpperCase() + dateStr.slice(1));
    } catch (e) {
        console.error("PAYTRACK dashboard: greeting failed", e);
    }
}


// ======================================================
// YEAR FILTER
// ======================================================

function populateYearFilter() {
    try {
        const el = document.getElementById("dashYearFilter");
        if (!el) return;

        const years = new Set();
        model.companies.forEach(r => {
            Object.keys(r.yearTotals).forEach(y => years.add(y));
            r.pending.forEach(p => years.add(String(p.year)));
        });

        const sorted = Array.from(years).sort((a, b) => b - a);
        el.innerHTML = `<option value="">Toutes années</option>` +
            sorted.map(y => `<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`).join("");
        el.value = selectedYear;
    } catch (e) {
        console.error("PAYTRACK dashboard: year filter failed", e);
    }
}

function renderScopeNote(rows) {
    try {
        const parts = [`${rows.length} entreprise(s)`];
        if (selectedYear) parts.push(`année ${selectedYear}`);
        safeText("dashScopeNote", parts.join(" · "));
    } catch (e) {
        console.error("PAYTRACK dashboard: scope note failed", e);
    }
}


// ======================================================
// KPI CARDS
// ======================================================

function renderKpis(rows) {
    try {
        const grid = document.getElementById("dashKpiGrid");
        if (!grid) return;

        const totalPaid = rows.reduce((s, r) => s + scopedTotal(r), 0);
        const totalCompanies = rows.length;
        const pendingCount = rows.reduce((s, r) => s + scopedPending(r).length, 0);

        const byService = {};
        rows.forEach(r => { byService[r.category] = (byService[r.category] || 0) + scopedTotal(r); });
        let topService = null, topAmount = 0;
        Object.keys(byService).forEach(cat => {
            if (byService[cat] > topAmount) { topAmount = byService[cat]; topService = cat; }
        });

        const cards = [
            {
                icon: "fa-sack-dollar", color: "#16a34a",
                label: selectedYear ? `Total payé — ${selectedYear}` : "Total payé (toutes années)",
                value: `${formatMoney(totalPaid)} DH`
            },
            {
                icon: "fa-building", color: "#2563eb",
                label: "Entreprises", value: String(totalCompanies)
            },
            {
                icon: "fa-triangle-exclamation", color: pendingCount > 0 ? "#dc2626" : "#16a34a",
                label: "Périodes non payées", value: String(pendingCount),
                hint: pendingCount > 0 ? "période(s) sans montant" : "tout est à jour"
            },
            {
                icon: "fa-crown", color: "#d97706",
                label: "Service le plus dépensier",
                value: topService ? escapeHtml(topService) : "—",
                hint: topService ? `${formatMoney(topAmount)} DH` : ""
            }
        ];

        grid.innerHTML = cards.map(c => `
            <div class="kpi-card">
                <div class="kpi-icon" style="background:${c.color}1a; color:${c.color};">
                    <i class="fa-solid ${c.icon}"></i>
                </div>
                <div class="kpi-body">
                    <div class="kpi-label">${c.label}</div>
                    <div class="kpi-value">${c.value}</div>
                    ${c.hint ? `<div class="kpi-hint">${escapeHtml(c.hint)}</div>` : ""}
                </div>
            </div>
        `).join("");
    } catch (e) {
        console.error("PAYTRACK dashboard: KPI cards failed to render", e);
        safeHtml("dashKpiGrid", `<div class="dash-section-error">Impossible d'afficher les statistiques.</div>`);
    }
}


// ======================================================
// PÉRIODES NON PAYÉES — grouped breakdowns, same table
// look as the old "Paiements en attente" (which this
// replaces entirely).
// ======================================================

function collectPendingItems(rows) {
    const items = [];
    rows.forEach(r => {
        scopedPending(r).forEach(p => {
            items.push({ name: r.name, number: r.number, category: r.category, year: p.year, label: p.label });
        });
    });
    return items;
}

function renderPendingPeriods(rows) {
    try {
        safeText("dashYearLabel", selectedYear || "toutes années");

        const wrap = document.getElementById("dashPendingPeriods");
        if (!wrap) return;

        const items = collectPendingItems(rows);

        if (items.length === 0) {
            wrap.innerHTML = `
                <div class="chart-empty chart-empty-ok">
                    <i class="fa-solid fa-circle-check"></i>
                    Aucune période non payée sur ce périmètre.
                </div>
            `;
            return;
        }

        const byService = {};
        items.forEach(it => {
            if (!byService[it.category]) byService[it.category] = [];
            byService[it.category].push(it);
        });

        // Within each service, most recent year first — keeps the
        // combined table scannable now that "by year" is a column
        // instead of a whole separate table.
        const services = Object.keys(byService).sort((a, b) => byService[b].length - byService[a].length);
        services.forEach(cat => byService[cat].sort((a, b) => b.year - a.year));

        const bodyRows = services.map(cat => `
            <tr class="pending-divider-row">
                <td colspan="4">
                    <span class="service-tag">${escapeHtml(cat)}</span>
                    <span class="pending-divider-count">${byService[cat].length} période(s) non payée(s)</span>
                </td>
            </tr>
            ${byService[cat].map(it => `
                <tr>
                    <td>${escapeHtml(it.name)}</td>
                    <td>${escapeHtml(it.number)}</td>
                    <td><span class="year-tag">${escapeHtml(it.year)}</span></td>
                    <td><span class="pending-badge"><i class="fa-solid fa-clock"></i> ${escapeHtml(it.label)}</span></td>
                </tr>
            `).join("")}
        `).join("");

        wrap.innerHTML = `
            <div class="table-wrapper" style="max-height:420px; overflow-y:auto;">
                <table class="pending-table">
                    <thead>
                        <tr>
                            <th>Entreprise</th>
                            <th>N° de marché</th>
                            <th>Année</th>
                            <th>Période non payée</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${bodyRows}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        console.error("PAYTRACK dashboard: pending-periods failed", e);
        safeHtml("dashPendingPeriods", `<div class="dash-section-error">Impossible d'afficher cette répartition.</div>`);
    }
}


// ======================================================
// CLASSEMENT DES ENTREPRISES — every company with at
// least one payment, ranked, no top-N cutoff.
// ======================================================

function renderLeaderboard(rows) {
    try {
        const wrap = document.getElementById("dashRankList");
        if (!wrap) return;

        const ranked = rows
            .map(r => ({ ...r, scopedAmount: scopedTotal(r) }))
            .filter(r => r.scopedAmount > 0)
            .sort((a, b) => b.scopedAmount - a.scopedAmount);

        if (ranked.length === 0) {
            wrap.innerHTML = `<div class="chart-empty">Aucun paiement enregistré pour l'instant.</div>`;
            return;
        }

        const badgeClass = i => i === 0 ? "rank-gold" : i === 1 ? "rank-silver" : i === 2 ? "rank-bronze" : "rank-default";

        wrap.innerHTML = ranked.map((r, i) => `
            <div class="rank-item">
                <div class="rank-badge ${badgeClass(i)}">${i + 1}</div>
                <div class="rank-info">
                    <div class="rank-name">${escapeHtml(r.name)}</div>
                    <div class="rank-meta">
                        <span class="service-tag">${escapeHtml(r.category)}</span>
                        <span class="rank-market-no">N° ${escapeHtml(r.number)}</span>
                    </div>
                </div>
                <div class="rank-amount">${formatMoney(r.scopedAmount)} DH</div>
            </div>
        `).join("");
    } catch (e) {
        console.error("PAYTRACK dashboard: leaderboard failed", e);
        safeHtml("dashRankList", `<div class="dash-section-error">Impossible d'afficher le classement.</div>`);
    }
}


// ======================================================
// PAIEMENTS PAR CATÉGORIE — donut chart + legend, sits
// next to the leaderboard (each takes half the row).
// ======================================================

function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeRingSlice(cx, cy, rOuter, rInner, startAngle, endAngle) {

    const startOuter = polarToCartesian(cx, cy, rOuter, startAngle);
    const endOuter = polarToCartesian(cx, cy, rOuter, endAngle);
    const endInner = polarToCartesian(cx, cy, rInner, endAngle);
    const startInner = polarToCartesian(cx, cy, rInner, startAngle);
    const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;

    // Full circle (single category = 100%): a plain arc degenerates,
    // so draw it as two half-ring slices instead.
    if (endAngle - startAngle >= 359.999) {
        const mid = startAngle + 180;
        return describeRingSlice(cx, cy, rOuter, rInner, startAngle, mid) + " " +
            describeRingSlice(cx, cy, rOuter, rInner, mid, endAngle);
    }

    return [
        `M ${startOuter.x} ${startOuter.y}`,
        `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
        `L ${endInner.x} ${endInner.y}`,
        `A ${rInner} ${rInner} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
        "Z"
    ].join(" ");

}

const DONUT_PALETTE = ["#16a34a", "#2563eb", "#d97706", "#7c3aed", "#dc2626", "#0ea5e9", "#db2777", "#9ca3af"];

function renderCategoryDonut(rows) {
    try {
        safeText("dashDonutYearLabel", selectedYear || "toutes années");

        const wrap = document.getElementById("dashCategoryDonut");
        if (!wrap) return;

        const byCategory = {};
        rows.forEach(r => {
            const amt = scopedTotal(r);
            if (amt <= 0) return;
            byCategory[r.category] = (byCategory[r.category] || 0) + amt;
        });

        const entries = Object.keys(byCategory)
            .map(category => ({ category, amount: byCategory[category] }))
            .sort((a, b) => b.amount - a.amount);

        if (entries.length === 0) {
            wrap.innerHTML = `<div class="chart-empty">Aucun paiement enregistré pour l'instant.</div>`;
            return;
        }

        const total = entries.reduce((s, e) => s + e.amount, 0);
        const cx = 90, cy = 90, rOuter = 80, rInner = 48;
        let angle = 0;

        const segments = entries.map((e, i) => {
            const pct = e.amount / total;
            const startAngle = angle;
            const endAngle = angle + pct * 360;
            angle = endAngle;
            return { ...e, pct, color: DONUT_PALETTE[i % DONUT_PALETTE.length], startAngle, endAngle };
        });

        const paths = segments.map(s => {

            const midAngle = (s.startAngle + s.endAngle) / 2;
            const labelPos = polarToCartesian(cx, cy, (rOuter + rInner) / 2, midAngle);
            const showLabel = s.pct >= 0.04;

            return `
                <path d="${describeRingSlice(cx, cy, rOuter, rInner, s.startAngle, s.endAngle)}" fill="${s.color}"></path>
                ${showLabel ? `<text x="${labelPos.x}" y="${labelPos.y}" class="donut-pct-label" text-anchor="middle" dominant-baseline="middle">${Math.round(s.pct * 100)}%</text>` : ""}
            `;

        }).join("");

        const legendItems = segments.map(s => `
            <div class="donut-legend-item">
                <span class="donut-legend-dot" style="background:${s.color};"></span>
                <span class="donut-legend-name">${escapeHtml(s.category)}</span>
                <span class="donut-legend-amount">${formatMoney(s.amount)} DH</span>
                <span class="donut-legend-pct">${Math.round(s.pct * 100)}%</span>
            </div>
        `).join("");

        wrap.innerHTML = `
            <div class="donut-wrap">
                <svg viewBox="0 0 180 180" class="donut-svg">${paths}</svg>
                <div class="donut-legend">${legendItems}</div>
            </div>
        `;
    } catch (e) {
        console.error("PAYTRACK dashboard: category donut failed", e);
        safeHtml("dashCategoryDonut", `<div class="dash-section-error">Impossible d'afficher cette répartition.</div>`);
    }
}


// ======================================================
// RECENTLY ADDED COMPANIES
// ======================================================

function renderRecentCompanies() {
    try {
        const wrap = document.getElementById("dashRecentCompanies");
        if (!wrap) return;

        const recent = model.companies.slice(-5).reverse();

        if (recent.length === 0) {
            wrap.innerHTML = `<div class="chart-empty">Aucune entreprise enregistrée pour l'instant.</div>`;
            return;
        }

        wrap.innerHTML = `
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>N° de marché</th>
                            <th>Entreprise</th>
                            <th>Service</th>
                            <th>Début du contrat</th>
                            <th>Total payé</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recent.map(r => `
                            <tr>
                                <td>${escapeHtml(r.number)}</td>
                                <td>${escapeHtml(r.name)}</td>
                                <td><span class="service-tag">${escapeHtml(r.category)}</span></td>
                                <td>${escapeHtml(r.startYear)}</td>
                                <td class="${r.total > 0 ? 'total-paid' : 'total-empty'}">${r.total > 0 ? formatMoney(r.total) + " DH" : "—"}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        console.error("PAYTRACK dashboard: recent companies failed", e);
        safeHtml("dashRecentCompanies", `<div class="dash-section-error">Impossible d'afficher les entreprises récentes.</div>`);
    }
}


// ======================================================
// PDF EXPORT
// ======================================================

function exportDashboardToPdf() {

    if (!window.jspdf) {
        alert("Le module d'export PDF n'a pas pu se charger.");
        return;
    }

    const rows = filteredRows();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const marginLeft = 14;
    let y = 18;

    doc.setFontSize(18);
    doc.setTextColor(20);
    doc.text("Tableau de bord — PAYTRACK", marginLeft, y);
    y += 7;

    doc.setFontSize(10);
    doc.setTextColor(120);
    const scopeBits = [`Généré le ${new Date().toLocaleDateString("fr-FR")}`];
    if (selectedYear) scopeBits.push(`Année : ${selectedYear}`);
    doc.text(scopeBits.join("  —  "), marginLeft, y);
    y += 10;

    const totalPaid = rows.reduce((s, r) => s + scopedTotal(r), 0);
    const pendingCount = rows.reduce((s, r) => s + scopedPending(r).length, 0);

    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text(`Total payé : ${formatMoney(totalPaid)} DH`, marginLeft, y);
    y += 6;
    doc.text(`Entreprises : ${rows.length}`, marginLeft, y);
    y += 6;
    doc.setTextColor(pendingCount > 0 ? 200 : 20, pendingCount > 0 ? 30 : 120, 30);
    doc.text(`Périodes non payées : ${pendingCount}`, marginLeft, y);
    doc.setTextColor(20);
    y += 10;

    const ranked = rows
        .map(r => ({ name: r.name, number: r.number, category: r.category, amount: scopedTotal(r) }))
        .filter(r => r.amount > 0)
        .sort((a, b) => b.amount - a.amount);

    doc.setFontSize(12);
    doc.text("Classement des entreprises", marginLeft, y);
    y += 3;
    doc.autoTable({
        startY: y,
        margin: { left: marginLeft, right: marginLeft },
        head: [["#", "Entreprise", "N° de marché", "Service", "Total payé"]],
        body: ranked.map((r, i) => [String(i + 1), r.name, r.number, r.category, formatMoney(r.amount) + " DH"]),
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
        columnStyles: { 4: { halign: "right" } }
    });
    y = doc.lastAutoTable.finalY + 10;

    const pendingItems = [];
    rows.forEach(r => {
        scopedPending(r).forEach(p => pendingItems.push([r.name, r.number, r.category, String(p.year), p.label]));
    });
    pendingItems.sort((a, b) => b[3].localeCompare(a[3]) || a[0].localeCompare(b[0]));

    if (pendingItems.length > 0) {
        if (y > 250) { doc.addPage(); y = 18; }
        doc.setFontSize(12);
        doc.setTextColor(180, 30, 30);
        doc.text("Périodes non payées", marginLeft, y);
        doc.setTextColor(20);
        y += 3;
        doc.autoTable({
            startY: y,
            margin: { left: marginLeft, right: marginLeft },
            head: [["Entreprise", "N° de marché", "Service", "Année", "Période non payée"]],
            body: pendingItems,
            theme: "grid",
            styles: { fontSize: 9, cellPadding: 2.5 },
            headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: "bold" }
        });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    doc.save(`Tableau_de_bord_PAYTRACK_${stamp}.pdf`);

}


// ======================================================
// MAIN RENDER
// ======================================================

function renderDashboard() {

    renderGreeting();

    try {
        model = buildDashboardModel();
    } catch (e) {
        console.error("PAYTRACK dashboard: fatal error building data model", e);
        const errBox = document.getElementById("dashboardFatalError");
        if (errBox) {
            errBox.style.display = "block";
            errBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Une erreur a empêché le chargement des données. Vérifiez la console du navigateur (F12) pour le détail.`;
        }
        return;
    }

    if (model.companies.length === 0) {
        safeHtml("dashKpiGrid", `
            <div class="table-card" style="grid-column:1 / -1; text-align:center; padding:60px 30px; color:#888;">
                <i class="fa-solid fa-chart-line" style="font-size:34px; color:#c7cad1; margin-bottom:14px;"></i>
                <h2 style="margin-bottom:8px;">Bienvenue sur PAYTRACK</h2>
                <p>Ajoutez votre première entreprise pour voir votre tableau de bord prendre vie.</p>
            </div>
        `);
        safeHtml("dashPendingPeriods", "");
        safeHtml("dashRankList", "");
        safeHtml("dashCategoryDonut", "");
        safeHtml("dashRecentCompanies", "");
        return;
    }

    populateYearFilter();

    const rows = filteredRows();

    renderScopeNote(rows);
    renderKpis(rows);
    renderPendingPeriods(rows);
    renderLeaderboard(rows);
    renderCategoryDonut(rows);
    renderRecentCompanies();

}


// ======================================================
// INITIALIZE + EVENTS
// ======================================================

function rerenderScopedSections() {
    const rows = filteredRows();
    renderScopeNote(rows);
    renderKpis(rows);
    renderPendingPeriods(rows);
    renderLeaderboard(rows);
    renderCategoryDonut(rows);
}

document.addEventListener("DOMContentLoaded", function () {

    renderDashboard();

    const refreshBtn = document.getElementById("refreshDashboard");
    if (refreshBtn) refreshBtn.addEventListener("click", renderDashboard);

    const exportBtn = document.getElementById("exportDashboardPDF");
    if (exportBtn) exportBtn.addEventListener("click", exportDashboardToPdf);

    const yearFilterEl = document.getElementById("dashYearFilter");
    if (yearFilterEl) yearFilterEl.addEventListener("change", e => {
        selectedYear = e.target.value;
        rerenderScopedSections();
    });

    window.addEventListener("storage", function (e) {
        if (e.key === COMPANIES_KEY || e.key === PAYMENTS_KEY || e.key === PERIODS_KEY) {
            renderDashboard();
        }
    });

});
