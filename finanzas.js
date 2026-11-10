"use strict";

/* =========================================================
   CONFIGURACIÓN
========================================================= */
const firebaseConfig = {
    apiKey: "AIzaSyBekoUVlYA0zpSrUvKnxEJc5YDR1apP5Gs",
    authDomain: "tecnofs-d2474.firebaseapp.com",
    databaseURL: "https://tecnofs-d2474-default-rtdb.firebaseio.com",
    projectId: "tecnofs-d2474",
    storageBucket: "tecnofs-d2474.firebasestorage.app",
    messagingSenderId: "362302156548",
    appId: "1:362302156548:web:7d5bf525de569bed4fea51",
    measurementId: "G-5FRJZHR8H5"
};

const IMGBB_API_KEY = "d93561444c0a8f5e455b840ac189217c";
const STORAGE_KEY = 'tecnofs_finanzas_v2';
const SESSION_KEY = 'tecnofs_finanzas_session';
const ADMIN_PASSWORD = 'franco@152007';

let db = null;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
} catch (e) { console.error("Firebase error:", e); }

/* =========================================================
   ESTADO GLOBAL
========================================================= */
let data = { movements: [] };
let currentPage = 'inicio';
let currentPeriod = 'month';
let currentReport = 'month';
let selectedMonth = null;
let selectedYear = null;
let selectedReportMonth = null;
let selectedReportYear = null;
let customRange = { from: null, to: null };
let calendarDate = new Date();
let selectedCalendarDate = null;
let currentDetailId = null;
let currentIncomePhoto = null;
let cloudLoaded = false;
let realtimeAttached = false;
let saveTimer = null;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

function escapeHTML(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function showToast(title, message, type = 'success') {
    const toast = $('#toast');
    if (!toast) return;
    $('#toastTitle').textContent = title;
    $('#toastMessage').textContent = message;
    const icon = toast.querySelector('.toast-icon');
    if (type === 'error') {
        icon.textContent = '!';
        icon.style.background = 'var(--expense)';
    } else {
        icon.textContent = '✓';
        icon.style.background = 'var(--income)';
    }
    toast.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove('show'), 3200);
}

/* =========================================================
   FECHAS Y MONEDA
========================================================= */
function getTodayISO() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
function parseISODate(s) {
    if (!s) return new Date();
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
}
function formatISODate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function formatShortDate(iso) {
    const d = parseISODate(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function formatLongDate(iso) {
    const d = parseISODate(iso);
    return new Intl.DateTimeFormat('es-PY', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}
function formatMoney(v) {
    const n = Math.round(Number(v) || 0);
    return new Intl.NumberFormat('es-PY').format(n);
}
function money(v) { return `G. ${formatMoney(v)}`; }
function parseMoney(str) { return Number(String(str).replace(/\D/g, '')) || 0; }

/* =========================================================
   AUTENTICACIÓN
========================================================= */
function isSessionActive() {
    const session = localStorage.getItem(SESSION_KEY);
    if(!session) return false;
    if(Date.now() < parseInt(session, 10)) return true; // Si no pasaron los 2 días
    localStorage.removeItem(SESSION_KEY); // Si ya pasaron, borra y pide de nuevo
    return false;
}
function setSession(active) {
    if (active) {
        const twoDays = 2 * 24 * 60 * 60 * 1000; // 2 días en milisegundos
        localStorage.setItem(SESSION_KEY, Date.now() + twoDays);
    } else {
        localStorage.removeItem(SESSION_KEY);
    }
}
function showAuthScreen() {
    $('#authScreen').classList.remove('hidden');
    $('#app').classList.add('hidden');
    $('#authPassword').value = '';
    $('#authError').textContent = '';
    setTimeout(() => $('#authPassword').focus(), 200);
}
function showApp() {
    $('#authScreen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    renderEverything();
    loadCloud();
}
function handleAuthSubmit(e) {
    e.preventDefault();
    const pwd = $('#authPassword').value;
    const error = $('#authError');
    error.textContent = '';
    if (pwd === ADMIN_PASSWORD) {
        setSession(true);
        showApp();
    } else {
        error.textContent = 'Contraseña incorrecta.';
        $('#authPassword').value = '';
    }
}
function logout() {
    setSession(false);
    showAuthScreen();
}

/* =========================================================
   DATOS (LOCAL Y FIREBASE)
========================================================= */
function loadLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) { data = { movements: [] }; return; }
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.movements)) data = parsed;
        else data = { movements: [] };
    } catch (e) { data = { movements: [] }; }
}
function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
}
async function loadCloud() {
    if (!db) return;
    if (cloudLoaded && realtimeAttached) return;
    try {
        const snap = await db.ref("tecnofs_finanzas").once("value");
        const value = snap.val();
        if (value && Array.isArray(value.movements) && value.movements.length > 0) {
            data.movements = value.movements;
            saveLocal();
            renderEverything();
        } else if (data.movements.length > 0) {
            await saveCloud(true);
        }
        cloudLoaded = true;
        subscribeRealtime();
        updateSyncStatus('ok');
    } catch (e) {
        console.error("Error loadCloud:", e);
        updateSyncStatus('error');
    }
}
async function saveCloud(force = false) {
    if (!db) return false;
    if (!cloudLoaded && !force) return false;
    try {
        await db.ref("tecnofs_finanzas").set({ movements: data.movements });
        updateSyncStatus('ok');
        return true;
    } catch (e) {
        updateSyncStatus('error');
        return false;
    }
}
function saveData() {
    saveLocal();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        if (cloudLoaded) await saveCloud();
    }, 600);
}
function subscribeRealtime() {
    if (!db || realtimeAttached) return;
    realtimeAttached = true;
    db.ref("tecnofs_finanzas").on("value", snap => {
        const value = snap.val();
        if (!value || !Array.isArray(value.movements)) return;
        if (JSON.stringify(data.movements) === JSON.stringify(value.movements)) return;
        data.movements = value.movements;
        saveLocal();
        renderEverything();
        updateSyncStatus('ok');
    }, err => updateSyncStatus('error'));
}
function updateSyncStatus(status) {
    const el = $('#syncStatusText');
    if (!el) return;
    if (status === 'ok') el.textContent = 'Sincronizado';
    else if (status === 'error') el.textContent = 'Sin conexión';
    else el.textContent = 'Sincronizando...';
}

/* =========================================================
   PERÍODOS Y FILTROS
========================================================= */
function getAvailableMonths() {
    const now = new Date();
    const set = new Set();
    set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    data.movements.forEach(m => { if (m.date) set.add(m.date.slice(0, 7)); });
    return Array.from(set).sort().reverse().map(key => {
        const [y, m] = key.split('-').map(Number);
        const lbl = new Date(y, m - 1, 1).toLocaleDateString('es-PY', { month: 'long', year: 'numeric' });
        return { value: key, label: lbl.charAt(0).toUpperCase() + lbl.slice(1) };
    });
}
function getAvailableYears() {
    const now = new Date();
    const set = new Set();
    set.add(now.getFullYear());
    data.movements.forEach(m => { if (m.date) set.add(parseInt(m.date.slice(0, 4), 10)); });
    return Array.from(set).sort((a, b) => b - a);
}
function getPeriodRange(period, selMonth, selYear) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (period === 'day') return { start: today, end: today };
    if (period === 'week') {
        const day = today.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        const start = new Date(today); start.setDate(today.getDate() + diff);
        const end = new Date(start); end.setDate(start.getDate() + 6);
        return { start, end };
    }
    if (period === 'month') {
        if (selMonth) {
            const [y, m] = selMonth.split('-').map(Number);
            return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
        }
        return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: new Date(today.getFullYear(), today.getMonth() + 1, 0) };
    }
    if (period === 'year') {
        if (selYear) return { start: new Date(selYear, 0, 1), end: new Date(selYear, 11, 31) };
        return { start: new Date(today.getFullYear(), 0, 1), end: new Date(today.getFullYear(), 11, 31) };
    }
    return { start: null, end: null };
}
function dateInRange(iso, range) {
    if (!range.start || !range.end) return true;
    const d = parseISODate(iso);
    return d >= range.start && d <= range.end;
}
function getMovementsForPeriod(period, selMonth, selYear) {
    const range = getPeriodRange(period, selMonth, selYear);
    return data.movements.filter(m => dateInRange(m.date, range));
}
function getSortTime(m) {
    const d = parseISODate(m.date);
    return d.getTime() + ((Number(m.createdAt) || 0) % 86400000);
}
function calculateTotals(list) {
    let income = 0, expense = 0;
    for (const m of list) {
        if (m.type === 'income') income += Number(m.amount) || 0;
        else if (m.type === 'expense') expense += Number(m.amount) || 0;
    }
    return { income, expense, balance: income - expense };
}

/* =========================================================
   SUBIDA DE FOTOS A IMGBB (CON COMPRESIÓN)
========================================================= */
async function uploadImageToImgbb(file) {
    // Vamos a subir la foto tal cual, sin comprimir, igual que en Precios.
    const fd = new FormData();
    fd.append("image", file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: fd });
    const json = await res.json();
    if (json.success) return json.data.display_url;
    throw new Error("Error upload");
}
/* =========================================================
   INYECCIÓN DINÁMICA DE SELECTORES
========================================================= */
(function injectPeriodStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .period-bar { flex-wrap: wrap !important; }
        .period-value-selector { display: none; width: 100%; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border, #1a2739); }
        .period-value-selector.visible { display: block; }
        .period-value-selector select { width: 100%; height: 44px; background: var(--surface, #0a1424); border: 1px solid var(--border, #1a2739); color: #fff; border-radius: 11px; padding: 0 14px; font-size: 13px; font-weight: 700; outline: none; cursor: pointer; }
        .period-value-selector select:focus { border-color: var(--accent, #1e8bff); }
        .report-period { flex-wrap: wrap !important; }
        .report-value-selector { display: none; width: 100%; margin-top: 10px; }
        .report-value-selector.visible { display: block; }
        .report-value-selector select { width: 100%; height: 42px; background: var(--surface, #0a1424); border: 1px solid var(--border, #1a2739); color: #fff; border-radius: 11px; padding: 0 14px; font-size: 13px; font-weight: 700; outline: none; cursor: pointer; }
    `;
    document.head.appendChild(style);
})();

/* =========================================================
   NAVEGACIÓN Y LAYOUT
========================================================= */
function showPage(page) {
    currentPage = page;
    $$('.page').forEach(s => s.classList.remove('active'));
    const target = $(`#page-${page}`);
    if (target) target.classList.add('active');
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    
    const titles = {
        inicio: ['Balance', 'Controlá todo lo que entra y sale de TECNO FS.'],
        movimientos: ['Movimientos', 'Todos tus ingresos y egresos.'],
        calendario: ['Calendario', 'Consultá tus ingresos y gastos por día.'],
        reportes: ['Reportes', 'Analizá cómo estuvo tu negocio.'],
        configuracion: ['Configuración', 'Seguridad, respaldo y datos.']
    };
    const [t, d] = titles[page] || titles.inicio;
    $('#pageTitle').textContent = t;
    $('#pageDescription').textContent = d;

    if (page === 'inicio') renderDashboard();
    if (page === 'movimientos') renderMovements();
    if (page === 'calendario') renderCalendar();
    if (page === 'reportes') renderReports();
    
    toggleSidebar(false);
}

function toggleSidebar(forceClose = false) {
    const sidebar = $('#sidebar');
    const overlay = $('#sidebarOverlay');
    if (!sidebar || !overlay) return;
    if (forceClose) {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    } else {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
    }
}

function openModal(id) { $(`#${id}`)?.classList.add('open'); }
function closeModal(id) { $(`#${id}`)?.classList.remove('open'); }

function setupModalClosing() {
    $$('.modal-close').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
    $$('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) overlay.classList.remove('open');
        });
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            $$('.modal-overlay').forEach(m => m.classList.remove('open'));
            toggleSidebar(true);
        }
    });
}

/* =========================================================
   DASHBOARD (INICIO)
========================================================= */
function renderDashboard() {
    const list = getMovementsForPeriod(currentPeriod, selectedMonth, selectedYear);
    const t = calculateTotals(list);

    $('#balanceTotal').textContent = money(t.balance);
    $('#totalIncome').textContent = money(t.income);
    $('#totalExpense').textContent = money(t.expense);

    const labels = { 
        day: 'Hoy', week: 'Esta semana', 
        month: selectedMonth ? `Mes: ${selectedMonth}` : 'Este mes', 
        year: selectedYear ? `Año: ${selectedYear}` : 'Este año', 
        all: 'Todo' 
    };
    $('#currentPeriodLabel').textContent = labels[currentPeriod] || 'Este mes';
    renderRecentList();
    updatePeriodSelectors();
}

function renderRecentList() {
    const container = $('#recentList');
    if (!container) return;
    const recent = [...data.movements].sort((a, b) => getSortTime(b) - getSortTime(a)).slice(0, 6);
    if (!recent.length) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">₲</div><h3>Todavía no hay movimientos</h3><p>Registrá tu primera reparación o gasto.</p></div>`;
        return;
    }
    container.innerHTML = recent.map(movementHTML).join('');
    attachMovementClicks(container);
}

/* =========================================================
   MOVIMIENTOS
========================================================= */
function setupFilters() {
    $('#movementSearch')?.addEventListener('input', renderMovements);
    $('#movementType')?.addEventListener('change', renderMovements);
    $('#movementPeriod')?.addEventListener('change', renderMovements);
}

function renderMovements() {
    const container = $('#movementList');
    if (!container) return;
    const search = ($('#movementSearch')?.value || '').trim().toLowerCase();
    const type = $('#movementType')?.value || 'all';
    const period = $('#movementPeriod')?.value || 'month';
    let list = [...data.movements];
    if (type !== 'all') list = list.filter(m => m.type === type);
    if (period !== 'all') {
        const range = getPeriodRange(period);
        list = list.filter(m => dateInRange(m.date, range));
    }
    if (search) {
        list = list.filter(m => {
            const text = [m.service, m.brand, m.model, m.client, m.concept, m.category, m.quality, m.supplier, m.notes].filter(Boolean).join(' ').toLowerCase();
            return text.includes(search);
        });
    }
    list.sort((a, b) => getSortTime(b) - getSortTime(a));
    if (!list.length) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⌕</div><h3>No encontramos movimientos</h3><p>Probá cambiar el filtro o registrar uno nuevo.</p></div>`;
        return;
    }
    container.innerHTML = list.map(movementHTML).join('');
    attachMovementClicks(container);
}

function getExpenseCategoryName(cat) {
    const map = { repuesto: 'Repuesto', herramienta: 'Herramienta', insumo: 'Insumo', transporte: 'Transporte', servicio: 'Servicio', alquiler: 'Alquiler', otro: 'Otro' };
    return map[cat] || 'Gasto';
}

function movementHTML(m) {
    const isIncome = m.type === 'income';
    const title = isIncome ? (m.service || 'Reparación') : (m.concept || 'Gasto');
    let subtitle = '';
    if (isIncome) subtitle = [m.brand, m.model, m.location === 'domicilio' ? 'A domicilio' : 'En el local'].filter(Boolean).join(' • ');
    else subtitle = [getExpenseCategoryName(m.category), m.brand, m.model, m.quality].filter(Boolean).join(' • ');
    return `
        <div class="movement-item ${isIncome ? 'income' : 'expense'}" data-id="${escapeHTML(m.id)}">
            <div class="movement-icon">${isIncome ? '↗' : '↙'}</div>
            <div class="movement-info"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(subtitle || (isIncome ? 'Ingreso' : 'Egreso'))}</span></div>
            <div class="movement-amount">${isIncome ? '+' : '−'}${money(m.amount)}</div>
            <div class="movement-date">${formatShortDate(m.date)}</div>
        </div>`;
}

function attachMovementClicks(container) {
    container.querySelectorAll('.movement-item').forEach(el => el.addEventListener('click', () => openDetailModal(el.dataset.id)));
}

/* =========================================================
   FORMULARIOS: INGRESO Y EGRESO
========================================================= */
function setupForms() {
    $('#incomeForm')?.addEventListener('submit', saveIncome);
    $('#expenseForm')?.addEventListener('submit', saveExpense);
    setupMoneyInput($('#incomeAmount'));
    setupMoneyInput($('#expenseAmount'));
    $('#incomeDate').value = getTodayISO();
    $('#expenseDate').value = getTodayISO();
}

function setupMoneyInput(input) {
    if (!input) return;
    input.addEventListener('input', () => {
        const raw = input.value.replace(/\D/g, '');
        if (!raw) { input.value = ''; return; }
        input.value = formatMoney(raw);
    });
}

function openIncomeModal(id = null) {
    const form = $('#incomeForm');
    form.reset();
    $('#incomeId').value = '';
    currentIncomePhoto = null;
    resetPhotoPreview();
    $('#incomeDate').value = getTodayISO();
    $('#incomeModalTitle').textContent = id ? 'Editar ingreso' : 'Registrar reparación';
    if (id) {
        const m = findMovement(id);
        if (!m || m.type !== 'income') return;
        $('#incomeId').value = m.id;
        $('#incomeDate').value = m.date;
        $('#incomeAmount').value = formatMoney(m.amount);
        $('#incomeService').value = m.service || '';
        $('#incomeBrand').value = m.brand || '';
        $('#incomeModel').value = m.model || '';
        $('#incomeLocation').value = m.location || 'local';
        $('#incomeClient').value = m.client || '';
        $('#incomeNotes').value = m.notes || '';
        currentIncomePhoto = m.photo || null;
        if (currentIncomePhoto) showPhotoPreview(currentIncomePhoto);
    }
    openModal('incomeModal');
}

function saveIncome(e) {
    e.preventDefault();
    const id = $('#incomeId').value;
    const movement = {
        id: id || generateId(), type: 'income', date: $('#incomeDate').value,
        amount: parseMoney($('#incomeAmount').value), service: $('#incomeService').value.trim(),
        brand: $('#incomeBrand').value.trim(), model: $('#incomeModel').value.trim(),
        location: $('#incomeLocation').value, client: $('#incomeClient').value.trim(),
        photo: currentIncomePhoto || null, notes: $('#incomeNotes').value.trim(),
        createdAt: id ? getExistingCreatedAt(id) : Date.now(), updatedAt: Date.now()
    };
    if (!movement.date || !movement.service || movement.amount <= 0) return showToast('Revisá los datos', 'Completá la fecha, reparación y monto.', 'error');
    if (id) {
        const i = data.movements.findIndex(m => m.id === id);
        if (i !== -1) data.movements[i] = movement;
        showToast('Ingreso actualizado', 'La reparación fue modificada.');
    } else {
        data.movements.push(movement);
        showToast('Ingreso guardado', 'La reparación quedó registrada.');
    }
    saveData(); closeModal('incomeModal'); renderEverything();
}

function openExpenseModal(id = null) {
    const form = $('#expenseForm');
    form.reset();
    $('#expenseId').value = '';
    $('#expenseDate').value = getTodayISO();
    $('#expenseModalTitle').textContent = id ? 'Editar egreso' : 'Registrar gasto';
    if (id) {
        const m = findMovement(id);
        if (!m || m.type !== 'expense') return;
        $('#expenseId').value = m.id;
        $('#expenseDate').value = m.date;
        $('#expenseAmount').value = formatMoney(m.amount);
        $('#expenseCategory').value = m.category || 'otro';
        $('#expenseConcept').value = m.concept || '';
        $('#expenseBrand').value = m.brand || '';
        $('#expenseModel').value = m.model || '';
        $('#expenseQuality').value = m.quality || '';
        $('#expenseSupplier').value = m.supplier || '';
        $('#expenseNotes').value = m.notes || '';
    }
    openModal('expenseModal');
}

function saveExpense(e) {
    e.preventDefault();
    const id = $('#expenseId').value;
    const movement = {
        id: id || generateId(), type: 'expense', date: $('#expenseDate').value,
        amount: parseMoney($('#expenseAmount').value), category: $('#expenseCategory').value,
        concept: $('#expenseConcept').value.trim(), brand: $('#expenseBrand').value.trim(),
        model: $('#expenseModel').value.trim(), quality: $('#expenseQuality').value.trim(),
        supplier: $('#expenseSupplier').value.trim(), notes: $('#expenseNotes').value.trim(),
        createdAt: id ? getExistingCreatedAt(id) : Date.now(), updatedAt: Date.now()
    };
    if (!movement.date || !movement.concept || movement.amount <= 0) return showToast('Revisá los datos', 'Completá la fecha, concepto y monto.', 'error');
    if (id) {
        const i = data.movements.findIndex(m => m.id === id);
        if (i !== -1) data.movements[i] = movement;
        showToast('Egreso actualizado', 'El gasto fue modificado.');
    } else {
        data.movements.push(movement);
        showToast('Egreso guardado', 'El gasto quedó registrado.');
    }
    saveData(); closeModal('expenseModal'); renderEverything();
}

function findMovement(id) { return data.movements.find(m => m.id === id); }
function getExistingCreatedAt(id) { return findMovement(id)?.createdAt || Date.now(); }

/* =========================================================
   FOTO (SUBIDA A IMGBB CON COMPRESIÓN)
========================================================= */
function setupPhotoUpload() {
    const upload = $('#incomePhotoUpload');
    const input = $('#incomePhoto');
    
    upload?.addEventListener('click', () => input.click());
    
    input?.addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        // En vez de borrar todo, solo cambiamos el texto del hueco
        const placeholder = $('#photoPlaceholder');
        if(placeholder) {
            placeholder.innerHTML = `<div class="photo-icon">⏳</div><strong>Subiendo foto...</strong><span>Espera un momento</span>`;
        }
        
        try {
            const url = await uploadImageToImgbb(file);
            currentIncomePhoto = url;
            showPhotoPreview(currentIncomePhoto);
        } catch (err) {
            console.error("Error ImgBB:", err);
            alert("Error de ImgBB: " + err.message); 
            showToast('Error', 'No se pudo subir la imagen.', 'error');
            // Si falla, volvemos a poner el cuadro original
            if(placeholder) {
                placeholder.innerHTML = `<div class="photo-icon">📷</div><strong>Agregar foto</strong><span>Tocá para seleccionar una imagen</span>`;
            }
        }
    });
    
    $('#removeIncomePhoto')?.addEventListener('click', e => {
        e.stopPropagation();
        currentIncomePhoto = null;
        resetPhotoPreview();
    });
}

function showPhotoPreview(src) {
    const img = $('#incomePhotoPreview');
    const placeholder = $('#photoPlaceholder');
    const removeBtn = $('#removeIncomePhoto');
    
    if (img) { img.src = src; img.classList.add('visible'); }
    if (placeholder) placeholder.classList.add('hidden');
    if (removeBtn) removeBtn.classList.add('visible');
}

function resetPhotoPreview() {
    const img = $('#incomePhotoPreview');
    const placeholder = $('#photoPlaceholder');
    const removeBtn = $('#removeIncomePhoto');
    const fileInput = $('#incomePhoto');

    if (img) { img.src = ''; img.classList.remove('visible'); }
    if (placeholder) {
        placeholder.classList.remove('hidden');
        placeholder.innerHTML = `<div class="photo-icon">📷</div><strong>Agregar foto</strong><span>Tocá para seleccionar una imagen</span>`;
    }
    if (removeBtn) removeBtn.classList.remove('visible');
    if (fileInput) fileInput.value = '';
}

/* =========================================================
   DETALLE MODAL Y BORRADO
========================================================= */
function openDetailModal(id) {
    const m = findMovement(id);
    if (!m) return;
    currentDetailId = id;
    const isIncome = m.type === 'income';
    $('#detailType').textContent = isIncome ? 'INGRESO' : 'EGRESO';
    $('#detailType').className = `modal-label ${isIncome ? 'income-label' : 'expense-label'}`;
    $('#detailTitle').textContent = isIncome ? (m.service || 'Reparación') : (m.concept || 'Gasto');
    $('#detailDate').textContent = formatLongDate(m.date);
    $('#detailContent').innerHTML = isIncome ? buildIncomeDetail(m) : buildExpenseDetail(m);
    openModal('detailModal');
}

function detailField(label, value) {
    if (!value) value = '—';
    return `<div class="detail-field"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`;
}

function buildIncomeDetail(m) {
    const title = [m.brand, m.model].filter(Boolean).join(' ') || 'Reparación TECNO FS';
    const photo = m.photo ? `<img src="${m.photo}" class="detail-photo" alt="Foto">` : `<div class="detail-photo empty">📷</div>`;
    return `
        <div class="detail-body">
            <div class="detail-main">${photo}<div class="detail-info"><h3>${escapeHTML(title)}</h3><p>${escapeHTML(m.service || '')}</p><div class="detail-amount income">+${money(m.amount)}</div></div></div>
            <div class="detail-fields">${detailField('Modalidad', m.location === 'domicilio' ? 'A domicilio' : 'En el local')}${detailField('Marca', m.brand)}${detailField('Modelo', m.model)}${detailField('Cliente', m.client)}${detailField('Fecha', formatShortDate(m.date))}</div>
            ${m.notes ? `<div class="detail-notes"><span>Nota</span><p>${escapeHTML(m.notes)}</p></div>` : ''}
        </div>`;
}

function buildExpenseDetail(m) {
    return `
        <div class="detail-body">
            <div class="detail-main"><div class="detail-info"><h3>${escapeHTML(m.concept || 'Gasto')}</h3><p>${escapeHTML(getExpenseCategoryName(m.category))}</p><div class="detail-amount expense">−${money(m.amount)}</div></div></div>
            <div class="detail-fields">${detailField('Categoría', getExpenseCategoryName(m.category))}${detailField('Marca', m.brand)}${detailField('Modelo', m.model)}${detailField('Calidad', m.quality)}${detailField('Proveedor', m.supplier)}${detailField('Fecha', formatShortDate(m.date))}</div>
            ${m.notes ? `<div class="detail-notes"><span>Nota</span><p>${escapeHTML(m.notes)}</p></div>` : ''}
        </div>`;
}

function editCurrentDetail() {
    if (!currentDetailId) return;
    const m = findMovement(currentDetailId);
    if (!m) return;
    closeModal('detailModal');
    if (m.type === 'income') openIncomeModal(m.id);
    else openExpenseModal(m.id);
}

// BORRADO CON MODAL PROPIO
function deleteCurrentDetail() {
    if (!currentDetailId) return;
    const m = findMovement(currentDetailId);
    if (!m) return;
    
    const name = m.type === 'income' ? (m.service || 'esta reparación') : (m.concept || 'este gasto');
    document.getElementById("confirmDeleteText").textContent = `¿Querés eliminar "${name}"? Esta acción no se puede deshacer.`;
    openModal('confirmDeleteModal');

    const confirmBtn = document.getElementById("confirmDeleteBtn");
    const cancelBtn = document.getElementById("cancelDeleteBtn");

    // Clonamos para eliminar eventos viejos
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newConfirmBtn.onclick = () => {
        data.movements = data.movements.filter(x => x.id !== currentDetailId);
        saveData(); 
        closeModal('confirmDeleteModal');
        closeModal('detailModal'); 
        currentDetailId = null; 
        renderEverything();
        showToast('Movimiento eliminado', 'El registro fue eliminado.');
    };

    newCancelBtn.onclick = () => {
        closeModal('confirmDeleteModal');
    };
}

/* =========================================================
   CALENDARIO
========================================================= */
function setupCalendar() {
    $('#prevMonth')?.addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); });
    $('#nextMonth')?.addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); });
}
function renderCalendar() {
    const grid = $('#calendarGrid');
    if (!grid) return;
    const y = calendarDate.getFullYear(), mo = calendarDate.getMonth();
    $('#calendarMonth').textContent = new Intl.DateTimeFormat('es-PY', { month: 'long', year: 'numeric' }).format(calendarDate);
    const firstDay = new Date(y, mo, 1);
    let startDow = firstDay.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const daysPrev = new Date(y, mo, 0).getDate();
    let html = '';
    for (let i = startDow - 1; i >= 0; i--) html += calendarDayHTML(new Date(y, mo - 1, daysPrev - i), true);
    for (let d = 1; d <= daysInMonth; d++) html += calendarDayHTML(new Date(y, mo, d), false);
    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
    const remaining = totalCells - (startDow + daysInMonth);
    for (let d = 1; d <= remaining; d++) html += calendarDayHTML(new Date(y, mo + 1, d), true);
    grid.innerHTML = html;
    grid.querySelectorAll('.calendar-day').forEach(el => el.addEventListener('click', () => selectCalendarDay(el.dataset.date)));
    if (selectedCalendarDate) grid.querySelector(`[data-date="${selectedCalendarDate}"]`)?.classList.add('selected');
}
function calendarDayHTML(date, otherMonth) {
    const iso = formatISODate(date);
    const list = data.movements.filter(m => m.date === iso);
    const t = calculateTotals(list);
    const isToday = iso === getTodayISO();
    const isSelected = iso === selectedCalendarDate;
    return `<div class="calendar-day ${otherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${iso}"><span class="calendar-number">${date.getDate()}</span><div class="calendar-day-totals">${t.income > 0 ? `<span class="calendar-income">+${formatMoney(t.income)}</span>` : ''}${t.expense > 0 ? `<span class="calendar-expense">−${formatMoney(t.expense)}</span>` : ''}</div></div>`;
}
function selectCalendarDay(iso) {
    selectedCalendarDate = iso;
    renderCalendar();
    renderSelectedDay(iso);
}
function renderSelectedDay(iso) {
    const panel = $('#selectedDayPanel');
    if (!panel) return;
    const list = data.movements.filter(m => m.date === iso).sort((a, b) => getSortTime(b) - getSortTime(a));
    const t = calculateTotals(list);
    const formatted = formatLongDate(iso);
    if (!list.length) {
        panel.innerHTML = `<div class="empty-selection"><div class="empty-icon">📅</div><h3>${escapeHTML(formatted)}</h3><p>No hay movimientos registrados en este día.</p></div>`;
        return;
    }
    panel.innerHTML = `<div class="day-panel-header"><div><h3>${escapeHTML(formatted)}</h3><div class="day-panel-summary"><span>Ingresos: <strong class="income-text">${money(t.income)}</strong></span><span>Egresos: <strong class="expense-text">${money(t.expense)}</strong></span></div></div><strong>${money(t.balance)}</strong></div><div class="day-movements">${list.map(movementHTML).join('')}</div>`;
    attachMovementClicks(panel);
}

/* =========================================================
   REPORTES
========================================================= */
function setupReports() {
    $$('.report-period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentReport = btn.dataset.report;
            $$('.report-period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            $('#customRange').classList.toggle('hidden', currentReport !== 'custom');
            renderReports();
        });
    });
    $('#applyRange')?.addEventListener('click', () => {
        customRange.from = $('#rangeFrom').value;
        customRange.to = $('#rangeTo').value;
        renderReports();
    });
}
function getMovementsForReport() {
    if (currentReport === 'all') return [...data.movements];
    if (currentReport === 'custom') {
        if (!customRange.from || !customRange.to) return [];
        const from = parseISODate(customRange.from), to = parseISODate(customRange.to);
        return data.movements.filter(m => { const d = parseISODate(m.date); return d >= from && d <= to; });
    }
    return getMovementsForPeriod(currentReport, selectedReportMonth, selectedReportYear);
}
function renderReports() {
    const list = getMovementsForReport();
    const t = calculateTotals(list);
    $('#reportIncome').textContent = money(t.income);
    $('#reportExpense').textContent = money(t.expense);
    $('#reportBalance').textContent = money(t.balance);
    $('#reportBalance').classList.toggle('income-text', t.balance > 0);
    $('#reportBalance').classList.toggle('expense-text', t.balance < 0);
    const incCount = list.filter(m => m.type === 'income').length;
    const expCount = list.filter(m => m.type === 'expense').length;
    $('#reportIncomeCount').textContent = `${incCount} movimiento${incCount === 1 ? '' : 's'}`;
    $('#reportExpenseCount').textContent = `${expCount} movimiento${expCount === 1 ? '' : 's'}`;
    renderReportBreakdown(list);
    renderChart();
}
function renderReportBreakdown(list) {
    const container = $('#reportBreakdown');
    if (!container) return;
    if (!list.length) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">◔</div><h3>Sin datos</h3><p>No hay movimientos en este período.</p></div>`;
        return;
    }
    const t = calculateTotals(list);
    const incCount = list.filter(m => m.type === 'income').length;
    const expCount = list.filter(m => m.type === 'expense').length;
    const avgIncome = incCount ? Math.round(t.income / incCount) : 0;
    const avgExpense = expCount ? Math.round(t.expense / expCount) : 0;
    container.innerHTML = `
        <div class="breakdown-row"><span>Total ingresos</span><strong class="income-text">${money(t.income)}</strong></div>
        <div class="breakdown-row"><span>Total egresos</span><strong class="expense-text">${money(t.expense)}</strong></div>
        <div class="breakdown-row"><span>Resultado neto</span><strong>${money(t.balance)}</strong></div>
        <div class="breakdown-row"><span>Reparaciones registradas</span><strong>${incCount}</strong></div>
        <div class="breakdown-row"><span>Gastos registrados</span><strong>${expCount}</strong></div>
        <div class="breakdown-row"><span>Ticket promedio</span><strong>${money(avgIncome)}</strong></div>
        <div class="breakdown-row"><span>Gasto promedio</span><strong>${money(avgExpense)}</strong></div>`;
}
function renderChart() {
    const chart = $('#chart');
    if (!chart) return;
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: new Intl.DateTimeFormat('es-PY', { month: 'short' }).format(d), income: 0, expense: 0 });
    }
    data.movements.forEach(m => {
        const key = m.date.slice(0, 7);
        const entry = months.find(x => x.key === key);
        if (!entry) return;
        if (m.type === 'income') entry.income += Number(m.amount) || 0;
        else if (m.type === 'expense') entry.expense += Number(m.amount) || 0;
    });
    const max = Math.max(1, ...months.flatMap(m => [m.income, m.expense]));
    chart.innerHTML = months.map(m => {
        const hIncome = Math.max(3, Math.round((m.income / max) * 100));
        const hExpense = Math.max(3, Math.round((m.expense / max) * 100));
        return `<div class="chart-group"><div class="chart-bars"><div class="chart-bar income" style="height:${hIncome}%" title="${money(m.income)}"></div><div class="chart-bar expense" style="height:${hExpense}%" title="${money(m.expense)}"></div></div><div class="chart-label">${m.label}</div></div>`;
    }).join('');
}

/* =========================================================
   CONFIGURACIÓN
========================================================= */
function setupSettings() {
    $('#exportData')?.addEventListener('click', () => {
        const backup = { app: 'TECNO FS Finanzas', movements: data.movements };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `tecnofs-respaldo-${getTodayISO()}.json`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        showToast('Respaldo creado', 'Tus datos fueron descargados.');
    });
    $('#importData')?.addEventListener('click', () => $('#importFile').click());
    $('#importFile')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                let movements = null;
                if (parsed && Array.isArray(parsed.movements)) movements = parsed.movements;
                else if (Array.isArray(parsed)) movements = parsed;
                if (!movements) throw new Error('Formato inválido');
                if (!confirm('Esto reemplazará los datos actuales.\n\n¿Querés continuar?')) { e.target.value = ''; return; }
                data.movements = movements; saveData(); renderEverything();
                showToast('Datos restaurados', 'El respaldo fue importado.');
            } catch (err) { showToast('Error', 'El archivo no es válido.', 'error'); }
            e.target.value = '';
        };
        reader.readAsText(file);
    });
    $('#resetData')?.addEventListener('click', () => {
        if (!confirm('¿ESTÁS SEGURO?\n\nSe eliminarán TODOS los movimientos.')) return;
        if (!confirm('Última confirmación:\n\n¿Borrar absolutamente todo?')) return;
        data.movements = []; saveData(); renderEverything();
        showToast('Datos eliminados', 'Todos los movimientos fueron borrados.');
    });
    $('#logoutBtn')?.addEventListener('click', logout);
    $('#logoutBtn2')?.addEventListener('click', logout);
}

/* =========================================================
   RENDER GENERAL E INICIALIZACIÓN
========================================================= */
function renderEverything() {
    renderDashboard();
    renderMovements();
    renderCalendar();
    renderReports();
    if (selectedCalendarDate) renderSelectedDay(selectedCalendarDate);
}

document.addEventListener('DOMContentLoaded', () => {
    $$('.nav-item[data-page]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
    $$('.text-button[data-page]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
    $('#mobileMenu')?.addEventListener('click', () => toggleSidebar());
    $('#sidebarOverlay')?.addEventListener('click', () => toggleSidebar(true));

    $('#openIncomeTop')?.addEventListener('click', () => openIncomeModal());
    $('#openExpenseTop')?.addEventListener('click', () => openExpenseModal());
    $('#newIncome')?.addEventListener('click', () => openIncomeModal());
    $('#newExpense')?.addEventListener('click', () => openExpenseModal());
    $('#newIncomeMovements')?.addEventListener('click', () => openIncomeModal());
    $('#newExpenseMovements')?.addEventListener('click', () => openExpenseModal());
    $('#editDetail')?.addEventListener('click', editCurrentDetail);
    $('#deleteDetail')?.addEventListener('click', deleteCurrentDetail);

    $$('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPeriod = btn.dataset.period;
            $$('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderDashboard();
        });
    });

    setupForms();
    setupPhotoUpload();
    setupFilters();
    setupCalendar();
    setupReports();
    setupSettings();
    setupModalClosing();

    $('#authForm')?.addEventListener('submit', handleAuthSubmit);

    loadLocal();
    if (isSessionActive()) showApp();
    else showAuthScreen();
});

/* =========================================================
   SELECTORES DE MES Y AÑO
========================================================= */
function updatePeriodSelectors() {
    let dashSelector = $('#dashPeriodSelector');
    if (!dashSelector) {
        const periodBar = $('.period-bar');
        if (periodBar) {
            dashSelector = document.createElement('div');
            dashSelector.id = 'dashPeriodSelector';
            dashSelector.className = 'period-value-selector';
            periodBar.appendChild(dashSelector);
        }
    }
    if (dashSelector) {
        if (currentPeriod === 'month') {
            dashSelector.classList.add('visible');
            const months = getAvailableMonths();
            dashSelector.innerHTML = `<select id="dashMonthSelect">${months.map(m => `<option value="${m.value}" ${selectedMonth === m.value ? 'selected' : ''}>${m.label}</option>`).join('')}</select>`;
            $('#dashMonthSelect')?.addEventListener('change', (e) => { selectedMonth = e.target.value; renderDashboard(); });
        } else if (currentPeriod === 'year') {
            dashSelector.classList.add('visible');
            const years = getAvailableYears();
            dashSelector.innerHTML = `<select id="dashYearSelect">${years.map(y => `<option value="${y}" ${selectedYear === y ? 'selected' : ''}>${y}</option>`).join('')}</select>`;
            $('#dashYearSelect')?.addEventListener('change', (e) => { selectedYear = parseInt(e.target.value, 10); renderDashboard(); });
        } else {
            dashSelector.classList.remove('visible');
        }
    }

    let repSelector = $('#repPeriodSelector');
    if (!repSelector) {
        const repPeriod = $('.report-period');
        if (repPeriod) {
            repSelector = document.createElement('div');
            repSelector.id = 'repPeriodSelector';
            repSelector.className = 'report-value-selector';
            repPeriod.appendChild(repSelector);
        }
    }
    if (repSelector) {
        if (currentReport === 'month') {
            repSelector.classList.add('visible');
            const months = getAvailableMonths();
            repSelector.innerHTML = `<select id="repMonthSelect">${months.map(m => `<option value="${m.value}" ${selectedReportMonth === m.value ? 'selected' : ''}>${m.label}</option>`).join('')}</select>`;
            $('#repMonthSelect')?.addEventListener('change', (e) => { selectedReportMonth = e.target.value; renderReports(); });
        } else if (currentReport === 'year') {
            repSelector.classList.add('visible');
            const years = getAvailableYears();
            repSelector.innerHTML = `<select id="repYearSelect">${years.map(y => `<option value="${y}" ${selectedReportYear === y ? 'selected' : ''}>${y}</option>`).join('')}</select>`;
            $('#repYearSelect')?.addEventListener('change', (e) => { selectedReportYear = parseInt(e.target.value, 10); renderReports(); });
        } else {
            repSelector.classList.remove('visible');
        }
    }
}