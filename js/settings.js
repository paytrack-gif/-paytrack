// ======================================================
// MUNICIPALITY MANAGEMENT SYSTEM — PAYTRACK
// settings.js — export / import / reset, with a data
// summary, a custom reset modal, and an "À propos" panel.
// ======================================================

const COMPANIES_KEY = "companies";
const PAYMENTS_KEY = "paymentAmounts";
const PERIODS_KEY = "paymentPeriodOverrides";
const APP_SETTINGS_KEY = "appSettings"; // kept in the export for compatibility with earlier versions

const ALL_DATA_KEYS = [COMPANIES_KEY, PAYMENTS_KEY, PERIODS_KEY, APP_SETTINGS_KEY];


// ======================================================
// STORAGE HELPERS
// ======================================================

function loadJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        const parsed = JSON.parse(raw);
        return parsed == null ? fallback : parsed;
    } catch (e) {
        console.error(`PAYTRACK settings: could not read "${key}"`, e);
        return fallback;
    }
}

function saveJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.error(`PAYTRACK settings: could not save "${key}"`, e);
        showToast("Impossible d'enregistrer — stockage local indisponible.", true);
        return false;
    }
}

function loadCompanies() { return loadJson(COMPANIES_KEY, []); }
function loadPaymentAmounts() { return loadJson(PAYMENTS_KEY, {}); }
function loadLastExport() { return loadJson("lastExportDate", null); }
function saveLastExport(iso) { saveJson("lastExportDate", iso); }

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
}

function formatMoney(value) {
    const num = Number(value) || 0;
    return num.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCompanyKey(company) {
    if (company.number && String(company.number).trim() !== "") {
        return "num:" + String(company.number).trim();
    }
    return "gen:" + [company.name, company.category, company.startYear].join("|");
}

// Counts every filled-in payment period across every company —
// used for both the pre-export summary and the post-import confirmation.
function countPaymentsAndTotal(companies, amounts) {
    let paymentCount = 0;
    let total = 0;
    companies.forEach(company => {
        const rowAmounts = amounts[getCompanyKey(company)] || {};
        Object.keys(rowAmounts).forEach(k => {
            const val = parseFloat(rowAmounts[k]);
            if (!isNaN(val) && rowAmounts[k] !== "" && rowAmounts[k] != null) {
                paymentCount++;
                total += val;
            }
        });
    });
    return { paymentCount, total };
}


// ======================================================
// TOAST
// ======================================================

let toastTimer = null;
function showToast(text, isError) {
    const toast = document.getElementById("settToast");
    const label = document.getElementById("settToastText");
    if (!toast || !label) return;

    label.textContent = text;
    toast.classList.toggle("error", !!isError);
    toast.querySelector("i").className = isError
        ? "fa-solid fa-circle-exclamation"
        : "fa-solid fa-circle-check";

    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3400);
}


// ======================================================
// DATA SUMMARY (shown above the export button)
// ======================================================

function renderDataSummary() {
    const wrap = document.getElementById("settDataSummary");
    if (!wrap) return;

    try {
        const companies = loadCompanies();
        const amounts = loadPaymentAmounts();
        const { paymentCount, total } = countPaymentsAndTotal(companies, amounts);

        wrap.innerHTML = `
            <div class="stat">
                <div class="val">${companies.length}</div>
                <div class="lbl">entreprise${companies.length === 1 ? "" : "s"}</div>
            </div>
            <div class="stat">
                <div class="val">${paymentCount}</div>
                <div class="lbl">paiement${paymentCount === 1 ? "" : "s"} enregistré${paymentCount === 1 ? "" : "s"}</div>
            </div>
            <div class="stat">
                <div class="val">${formatMoney(total)} DH</div>
                <div class="lbl">total payé</div>
            </div>
        `;
    } catch (e) {
        console.error("PAYTRACK settings: data summary failed", e);
        wrap.innerHTML = `<div class="dash-section-error">Impossible de résumer vos données.</div>`;
    }
}

function renderLastExport() {
    const el = document.getElementById("settLastExport");
    if (!el) return;
    const iso = loadLastExport();
    el.textContent = iso
        ? `Dernière exportation : ${new Date(iso).toLocaleString("fr-FR")}`
        : "Dernière exportation : jamais";
}


// ======================================================
// EXPORT
// ======================================================

function exportAllData() {
    const dump = {};
    ALL_DATA_KEYS.forEach(key => {
        const raw = localStorage.getItem(key);
        if (raw != null) {
            try { dump[key] = JSON.parse(raw); } catch (e) { dump[key] = raw; }
        }
    });

    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `PAYTRACK_donnees_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    saveLastExport(new Date().toISOString());
    renderLastExport();

    const companies = loadCompanies();
    showToast(`Exporté : ${companies.length} entreprise${companies.length === 1 ? "" : "s"}.`);
}


// ======================================================
// IMPORT
// ======================================================

function importAllData(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            let restoredCount = 0;
            ALL_DATA_KEYS.forEach(key => {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    localStorage.setItem(key, JSON.stringify(data[key]));
                    restoredCount++;
                }
            });

            if (restoredCount === 0) {
                showToast("Ce fichier ne contient aucune donnée PAYTRACK reconnue.", true);
                return;
            }

            // Compute the restored counts from the freshly-imported data
            // (not yet reloaded) so the confirmation reflects what actually came in.
            const importedCompanies = Array.isArray(data[COMPANIES_KEY]) ? data[COMPANIES_KEY] : loadCompanies();
            const importedAmounts = data[PAYMENTS_KEY] && typeof data[PAYMENTS_KEY] === "object" ? data[PAYMENTS_KEY] : loadPaymentAmounts();
            const { paymentCount } = countPaymentsAndTotal(importedCompanies, importedAmounts);

            showToast(`Importé : ${importedCompanies.length} entreprise${importedCompanies.length === 1 ? "" : "s"}, ${paymentCount} paiement${paymentCount === 1 ? "" : "s"}. Rechargement…`);
            setTimeout(() => window.location.reload(), 1400);
        } catch (e) {
            console.error("PAYTRACK settings: import failed", e);
            showToast("Fichier invalide — l'import a été annulé.", true);
        }
    };
    reader.readAsText(file);
}


// ======================================================
// RESET (custom modal, replaces confirm()/prompt())
// ======================================================

function openResetModal() {
    const companies = loadCompanies();
    const amounts = loadPaymentAmounts();
    const { paymentCount } = countPaymentsAndTotal(companies, amounts);

    document.getElementById("resetModalText").textContent =
        `Cette action supprime définitivement ${companies.length} entreprise${companies.length === 1 ? "" : "s"} et ${paymentCount} paiement${paymentCount === 1 ? "" : "s"} de ce navigateur. Elle est irréversible.`;

    document.getElementById("resetConfirmInput").value = "";
    document.getElementById("resetModalOverlay").classList.add("show");
}

function closeResetModal() {
    document.getElementById("resetModalOverlay").classList.remove("show");
}

function initResetModal() {
    document.getElementById("settResetBtn").addEventListener("click", openResetModal);
    document.getElementById("resetCancelBtn").addEventListener("click", closeResetModal);

    document.getElementById("resetModalOverlay").addEventListener("click", e => {
        if (e.target.id === "resetModalOverlay") closeResetModal();
    });

    document.getElementById("resetConfirmBtn").addEventListener("click", () => {
        const typed = document.getElementById("resetConfirmInput").value.trim();
        if (typed !== "SUPPRIMER") {
            showToast('Tapez "SUPPRIMER" exactement pour confirmer.', true);
            return;
        }

        ALL_DATA_KEYS.forEach(key => localStorage.removeItem(key));
        closeResetModal();
        showToast("Toutes les données ont été réinitialisées.");
        setTimeout(() => window.location.href = "dashboard.html", 1200);
    });

    document.getElementById("resetConfirmInput").addEventListener("keydown", e => {
        if (e.key === "Enter") document.getElementById("resetConfirmBtn").click();
    });
}


// ======================================================
// INIT
// ======================================================

document.addEventListener("DOMContentLoaded", function () {
    renderDataSummary();
    renderLastExport();

    document.getElementById("settExportBtn").addEventListener("click", exportAllData);

    const fileInput = document.getElementById("importFileInput");
    document.getElementById("settImportBtn").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", e => {
        const file = e.target.files[0];
        if (file) importAllData(file);
        fileInput.value = "";
    });

    initResetModal();
});
