"use strict";

/* =========================================================
   CONFIGURACIÓN Y VARIABLES GLOBALES
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
const STORAGE_KEY = "tecnofs_v10"; 
const ADMIN_PASSWORD = "tecnofs2026";
const FAVS_KEY = "tecnofs_favs";
const HISTORY_KEY = "tecnofs_history";
const WA_NUMBER_KEY = "tecnofs_wa_number";

let db = null;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
} catch (error) {
    console.error("Firebase error:", error);
}

const DEFAULT_DATA = {
    categories: [
        { id: "cat-displays", name: "Displays", image: "" },
        { id: "cat-baterias", name: "Baterías", image: "" }
    ],
    brands: [
        { id: "brand-samsung", name: "Samsung", image: "" },
        { id: "brand-iphone", name: "iPhone", image: "" }
    ],
    models: [],
    solutions: [],
    notes: [] 
};

// Estado global
let data = loadLocal();
let favs = JSON.parse(localStorage.getItem(FAVS_KEY) || "[]");
let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); 

// Migración de historial antiguo
if (history.length > 0 && typeof history[0] === 'string') {
    history = history.map(id => ({ id: id, timestamp: Date.now() }));
}

let currentPage = "catalog";
let currentModelId = null;
let currentSource = "mine";
let catalogView = "categories";
let navCategoryId = null;
let navBrandId = null;
let modelSearch = "";
let catSearch = "";
let brandSearch = "";
let adminAuthed = (() => {
    const session = localStorage.getItem("tecnofs_precios_session");
    if (session && Date.now() < parseInt(session, 10)) return true;
    localStorage.removeItem("tecnofs_precios_session");
    return false;
})();
let pendingPage = null;
let adminSearch = "";
let cloudLoaded = false;
let realtimeAttached = false;
let saveTimer = null;
let tempImage = "";
let selectedAlertModels = new Set();
let alertsSearch = "";

// Soluciones y Fallas
let solView = "brands";
let solBrandId = null;
let solFaultId = null;
let solSearch = "";

/* =========================================================
   HELPERS Y UTILIDADES
========================================================= */
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function normalizeText(v) { return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function createId(p = "item") { return p + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8); }
function escapeHtml(v) {
    return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function sortByName(a) { return [...a].sort((x, y) => normalizeText(x.name).localeCompare(normalizeText(y.name))); }
function formatDate(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => t.classList.remove("show"), 3000);
}

/* =========================================================
   MANEJO DE DATOS (LOCAL Y FIREBASE)
========================================================= */
function normalizeData(input) {
    const s = input || {};
    return {
        categories: Array.isArray(s.categories) ? s.categories : [],
        brands: Array.isArray(s.brands) ? s.brands : [],
        models: Array.isArray(s.models) ? s.models : [],
        solutions: Array.isArray(s.solutions) ? s.solutions : [],
        notes: Array.isArray(s.notes) ? s.notes : (typeof s.notes === 'string' && s.notes.trim() !== "" ? [{ id: "old-note", title: "Nota antigua", desc: s.notes, date: Date.now(), image: "" }] : [])
    };
}

function loadLocal() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return clone(DEFAULT_DATA);
        return normalizeData(JSON.parse(saved));
    } catch (e) {
        return clone(DEFAULT_DATA);
    }
}

function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
}

function arrToFbObj(arr) {
    const r = {};
    (arr || []).forEach(it => { if (it && it.id) r[it.id] = it; });
    return r;
}

function fbObjToArr(obj) {
    if (!obj || typeof obj !== "object") return [];
    return Object.keys(obj).map(k => ({ ...obj[k], id: obj[k].id || k }));
}

function setSyncStatus(title, subtitle, status = "normal") {
    const t = document.getElementById("syncTitle"), s = document.getElementById("syncSub"), d = document.getElementById("syncDot");
    const tt = document.getElementById("topSyncText"), td = document.getElementById("topSyncDot");
    if (t) t.textContent = title;
    if (s) s.textContent = subtitle;
    if (tt) tt.textContent = title;
    [d, td].forEach(dot => {
        if (!dot) return;
        dot.classList.remove("ok", "error");
        if (status === "ok") dot.classList.add("ok");
        if (status === "error") dot.classList.add("error");
    });
}

async function loadCloud() {
    if (!db) { setSyncStatus("Error", "No disponible", "error"); return; }
    setSyncStatus("Conectando...", "Leyendo datos");
    try {
        const snap = await db.ref("tecnofs").once("value");
        const value = snap.val();
        
        if (value && (Object.keys(value.categories || {}).length > 0 || Object.keys(value.models || {}).length > 0)) {
            data = normalizeData({
                categories: fbObjToArr(value.categories),
                brands: fbObjToArr(value.brands),
                models: fbObjToArr(value.models),
                solutions: fbObjToArr(value.solutions),
                notes: value.notes ? fbObjToArr(value.notes) : []
            });
            saveLocal(); renderAll(); cloudLoaded = true; subscribeRealtime();
            setSyncStatus("Sincronizado", "Nube Firebase", "ok");
            return;
        }
        
        await saveCloud(true); cloudLoaded = true; subscribeRealtime();
        setSyncStatus("Sincronizado", "Datos enviados", "ok");
        showToast("☁️ Datos enviados a Firebase");
    } catch (e) {
        setSyncStatus("Error", "No conectado", "error");
    }
}

async function saveCloud(force = false) {
    if (!db || (!cloudLoaded && !force)) return false;
    try {
        setSyncStatus("Guardando...", "Enviando cambios");
        await db.ref("tecnofs").set({
            categories: arrToFbObj(data.categories),
            brands: arrToFbObj(data.brands),
            models: arrToFbObj(data.models),
            solutions: arrToFbObj(data.solutions),
            notes: arrToFbObj(data.notes)
        });
        setSyncStatus("Sincronizado", "Nube Firebase", "ok");
        return true;
    } catch (e) {
        setSyncStatus("Error", "No guardado", "error");
        return false;
    }
}

function saveData() {
    saveLocal();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        if (cloudLoaded) await saveCloud();
    }, 500);
}

function subscribeRealtime() {
    if (!db || realtimeAttached) return;
    realtimeAttached = true;
    db.ref("tecnofs").on("value", snap => {
        const value = snap.val();
        if (!value) return;
        const incoming = normalizeData({
            categories: fbObjToArr(value.categories),
            brands: fbObjToArr(value.brands),
            models: fbObjToArr(value.models),
            solutions: fbObjToArr(value.solutions),
            notes: value.notes ? fbObjToArr(value.notes) : []
        });
        if (JSON.stringify(data) === JSON.stringify(incoming)) {
            cloudLoaded = true; setSyncStatus("Sincronizado", "Nube Firebase", "ok"); return;
        }
        data = incoming; saveLocal(); renderAll(); cloudLoaded = true;
        setSyncStatus("Sincronizado", "Cambio recibido", "ok");
        showToast("🔄 Datos actualizados");
    }, err => setSyncStatus("Error Realtime", "Error de sincronización", "error"));
}

/* =========================================================
   NAVEGACIÓN
========================================================= */
function navigate(page, addHistory = true) {
    if (["admin", "backup", "alerts"].includes(page) && !adminAuthed) {
        pendingPage = page; page = "login";
    }
    currentPage = page;
    
    document.querySelectorAll(".page").forEach(s => s.classList.remove("active"));
    const target = document.getElementById("page-" + page);
    if (target) target.classList.add("active");

    document.querySelectorAll(".nav-btn").forEach(b => {
        const bp = b.dataset.page;
        let active = bp === page;
        if (page === "login" && ["admin", "backup", "alerts"].includes(bp)) active = bp === pendingPage;
        if (page === "editor") active = bp === "admin";
        if (page === "detail") active = bp === "catalog";
        if (page === "solViewFaults" || page === "solViewDetail") active = bp === "solutions";
        b.classList.toggle("active", active);
    });

    const titles = {
        catalog: "Consultar precios",
        favorites: "Mis Favoritos",
        solutions: "Soluciones y Fallas",
        notes: "Notas Rápidas",
        alerts: "Actualizar Precios",
        admin: "Administrar",
        backup: "Respaldo",
        editor: "Editar modelo",
        detail: "Detalle",
        login: "Acceso restringido"
    };
    const title = document.getElementById("topbarTitle");
    if (title) title.textContent = titles[page] || "TECNOFS";
    
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.remove("open");
    
    if (addHistory) window.history.pushState({ page }, "", "#/" + page);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =========================================================
   RENDERIZADO DEL CATÁLOGO
========================================================= */
function renderCatalog() {
    const vC = document.getElementById("viewCategories");
    const vB = document.getElementById("viewBrands");
    const vM = document.getElementById("viewModels");
    if (!vC || !vB || !vM) return;
    
    vC.style.display = catalogView === "categories" ? "block" : "none";
    vB.style.display = catalogView === "brands" ? "block" : "none";
    vM.style.display = catalogView === "models" ? "block" : "none";

    if (catalogView === "categories") renderCategoriesView();
    else if (catalogView === "brands") renderBrandsView();
    else if (catalogView === "models") renderModelsView();
}

function renderCategoriesView() {
    const grid = document.getElementById("catGrid");
    const countEl = document.getElementById("catCount");
    if (!grid) return;

    let cats = sortByName(data.categories);
    if (catSearch) cats = cats.filter(c => normalizeText(c.name).includes(catSearch));
    
    if (countEl) countEl.textContent = cats.length;
    if (!cats.length) {
        grid.innerHTML = `<div class="empty-models"><div class="icon">📂</div>No hay categorías cargadas.</div>`;
        return;
    }

    const emojis = ["📂", "📱", "🔧", "⚙️", "🔋", "🖥️", "🎧", "🛠️", "💡", "📟"];
    grid.innerHTML = cats.map((cat, i) => {
        const count = data.models.filter(m => m.categoryId === cat.id).length;
        let mediaHtml = cat.image ? `<img src="${escapeHtml(cat.image)}" loading="lazy">` : `<div class="cat-image-emoji">${emojis[i % emojis.length]}</div>`;
        return `
            <button class="cat-card" data-cat="${escapeHtml(cat.id)}" type="button">
                <div class="cat-image-wrap">${mediaHtml}</div>
                <div class="cat-name">${escapeHtml(cat.name)}</div>
                <div class="cat-count"><span class="dot"></span>${count} ${count === 1 ? "modelo" : "modelos"}</div>
                <div class="cat-arrow">›</div>
            </button>
        `;
    }).join("");

    grid.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => {
        navCategoryId = b.dataset.cat; navBrandId = null; catalogView = "brands";
        renderCatalog(); window.scrollTo({ top: 0, behavior: "smooth" });
    }));
}

function renderBrandsView() {
    const grid = document.getElementById("brandGrid");
    const title = document.getElementById("brandsTitle");
    const crumb = document.getElementById("crumbBrands");
    if (!grid) return;

    const cat = data.categories.find(c => c.id === navCategoryId);
    const catName = cat ? cat.name : "Categoría";
    if (title) title.innerHTML = `Marcas en ${escapeHtml(catName)} <span class="count-pill" id="brandCount">0</span>`;
    if (crumb) crumb.textContent = catName;

    const brandIdsWithModels = new Set(data.models.filter(m => m.categoryId === navCategoryId).map(m => m.brandId));
    let brands = sortByName(data.brands.filter(b => brandIdsWithModels.has(b.id)));
    if (brandSearch) brands = brands.filter(b => normalizeText(b.name).includes(brandSearch));
    
    const newCount = document.getElementById("brandCount");
    if (newCount) newCount.textContent = brands.length;
    
    if (!brands.length) {
        grid.innerHTML = `<div class="empty-models"><div class="icon">🏷️</div>No hay marcas con modelos.</div>`;
        return;
    }

    grid.innerHTML = brands.map(brand => {
        const count = data.models.filter(m => m.categoryId === navCategoryId && m.brandId === brand.id).length;
        let logoHtml = brand.image ? `<img src="${escapeHtml(brand.image)}" loading="lazy">` : `<span class="brand-initial">${escapeHtml((brand.name || "?").charAt(0).toUpperCase())}</span>`;
        return `
            <button class="brand-card" data-brand="${escapeHtml(brand.id)}" type="button">
                <div class="brand-logo-wrap">${logoHtml}</div>
                <div class="brand-name">${escapeHtml(brand.name)}</div>
                <div class="brand-count"><span class="dot"></span>${count} ${count === 1 ? "modelo" : "modelos"}</div>
            </button>
        `;
    }).join("");

    grid.querySelectorAll("[data-brand]").forEach(b => b.addEventListener("click", () => {
        navBrandId = b.dataset.brand; catalogView = "models"; modelSearch = "";
        const inp = document.getElementById("modelSearchInput"); if (inp) inp.value = "";
        renderCatalog(); window.scrollTo({ top: 0, behavior: "smooth" });
    }));
}

function renderModelsView() {
    const grid = document.getElementById("modelsGrid");
    const title = document.getElementById("modelsTitle");
    const crumb = document.getElementById("crumbModels");
    const crumbBrand = document.getElementById("crumbBackBrands");
    if (!grid) return;

    const brand = data.brands.find(b => b.id === navBrandId);
    const brandName = brand ? brand.name : "Marca";
    if (crumb) crumb.textContent = brandName;
    if (crumbBrand) crumbBrand.textContent = brandName;

    let models = data.models.filter(m => m.categoryId === navCategoryId && m.brandId === navBrandId);
    if (modelSearch) models = models.filter(m => normalizeText(m.name).includes(modelSearch));
    models = sortByName(models);

    if (title) title.innerHTML = `Modelos <span class="count-pill" id="modelCount">0</span>`;
    const newCount = document.getElementById("modelCount");
    if (newCount) newCount.textContent = models.length;
    
    const searchClear = document.getElementById("modelSearchClear");
    if (searchClear) searchClear.classList.toggle("show", !!modelSearch);

    if (!models.length) {
        grid.innerHTML = `<div class="empty-models"><div class="icon">📱</div>No hay modelos.</div>`;
        return;
    }

    grid.innerHTML = models.map(model => {
        let imageHtml = model.image ? `<img src="${escapeHtml(model.image)}" loading="lazy">` : `<div class="model-no-img">📱</div>`;
        const isAlert = model.needsPriceUpdate || (model.updatedAt && (Date.now() - model.updatedAt > 90 * 24 * 60 * 60 * 1000));
        const isFav = favs.includes(model.id);
        
        return `
            <article class="model-card ${isAlert ? 'alert-price' : ''}">
                ${isAlert ? `<div class="alert-badge">⚠️ REVISAR PRECIO</div>` : ''}
                <div class="btn-fav ${isFav ? 'active' : ''}" data-fav="${model.id}">★</div>
                <div class="model-image">${imageHtml}</div>
                <div class="model-body">
                    <div class="model-brand">${escapeHtml(brand ? brand.name : "Sin marca")}</div>
                    <div class="model-name">${escapeHtml(model.name)}</div>
                    <div class="model-cta">
                        <button type="button" data-model="${escapeHtml(model.id)}">Ver precios →</button>
                    </div>
                </div>
            </article>
        `;
    }).join("");

    grid.querySelectorAll("[data-model]").forEach(b => b.addEventListener("click", (e) => {
        e.stopPropagation();
        openModel(b.dataset.model);
    }));
    
    grid.querySelectorAll("[data-fav]").forEach(b => b.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = b.dataset.fav;
        if (favs.includes(id)) favs = favs.filter(f => f !== id);
        else favs.push(id);
        localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
        renderModelsView();
    }));
}

/* =========================================================
   FAVORITOS Y HISTORIAL
========================================================= */
function renderFavorites() {
    const grid = document.getElementById("favoritesGrid");
    if (!grid) return;

    const favModels = data.models.filter(m => favs.includes(m.id));

    if (!favModels.length) {
        grid.innerHTML = `<div class="empty-models" style="grid-column:1/-1;"><div class="icon">⭐</div>No tenés modelos en favoritos aún.</div>`;
        return;
    }

    grid.innerHTML = favModels.map(model => {
        const brand = data.brands.find(b => b.id === model.brandId);
        let imageHtml = model.image ? `<img src="${escapeHtml(model.image)}" loading="lazy">` : `<div class="model-no-img">📱</div>`;
        const isAlert = model.needsPriceUpdate || (model.updatedAt && (Date.now() - model.updatedAt > 90 * 24 * 60 * 60 * 1000));
        
        return `
            <article class="model-card ${isAlert ? 'alert-price' : ''}">
                ${isAlert ? `<div class="alert-badge">⚠️ REVISAR PRECIO</div>` : ''}
                <div class="btn-fav active" data-fav="${model.id}">★</div>
                <div class="model-image">${imageHtml}</div>
                <div class="model-body">
                    <div class="model-brand">${escapeHtml(brand ? brand.name : "Sin marca")}</div>
                    <div class="model-name">${escapeHtml(model.name)}</div>
                    <div class="model-cta">
                        <button type="button" data-model="${model.id}">Ver precios →</button>
                    </div>
                </div>
            </article>
        `;
    }).join("");

    grid.querySelectorAll("[data-model]").forEach(b => b.addEventListener("click", (e) => {
        e.stopPropagation();
        openModel(b.dataset.model);
    }));
    
    grid.querySelectorAll("[data-fav]").forEach(b => b.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = b.dataset.fav;
        if (favs.includes(id)) favs = favs.filter(f => f !== id);
        else favs.push(id);
        localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
        renderFavorites();
        renderModelsView(); 
    }));
}

function renderHistory() {
    const cont = document.getElementById("historyContainer");
    const scroll = document.getElementById("historyScroll");
    if (!cont || !scroll) return;
    
    const ahora = Date.now();
    history = history.filter(h => (ahora - h.timestamp) < 24 * 60 * 60 * 1000);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

    if (!history.length) { cont.style.display = "none"; return; }
    cont.style.display = "block";
    
    const recent = history.map(h => data.models.find(m => m.id === h.id)).filter(Boolean);
    if (!recent.length) { cont.style.display = "none"; return; }
    
    scroll.innerHTML = recent.map(m => `
        <div class="history-card" data-h="${m.id}">
            ${m.image ? `<img src="${escapeHtml(m.image)}">` : `<div style="height:60px;display:flex;align-items:center;justify-content:center">📱</div>`}
            <p>${escapeHtml(m.name)}</p>
        </div>
    `).join("");
    
    scroll.querySelectorAll("[data-h]").forEach(c => c.addEventListener("click", () => openModel(c.dataset.h)));
}

/* =========================================================
   DETALLE DEL MODELO Y PRECIOS
========================================================= */
function openModel(modelId) {
    const model = data.models.find(x => x.id === modelId);
    if (!model) return;
    
    currentModelId = modelId;
    currentSource = "mine";

    history = history.filter(h => h.id !== modelId);
    history.unshift({ id: modelId, timestamp: Date.now() });
    history = history.slice(0, 10);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();

    const brand = data.brands.find(x => x.id === model.brandId);
    const category = data.categories.find(x => x.id === model.categoryId);
    
    const img = document.getElementById("detailImage");
    const nm = document.getElementById("detailModelName");
    const br = document.getElementById("detailBrand");
    const mt = document.getElementById("detailModelMeta");

    if (nm) nm.textContent = model.name;
    if (br) br.textContent = brand ? brand.name : "Sin marca";
    if (mt) mt.textContent = category ? category.name : "Sin categoría";

    if (img) {
        if (model.image) {
            img.src = model.image;
            img.style.display = "block";
        } else {
            img.removeAttribute("src");
            img.style.display = "none";
        }
    }

    updateSourceTabs();
    renderPriceList();
    navigate("detail");
}

function updateSourceTabs() {
    const m = document.getElementById("mineTab");
    const s = document.getElementById("supplierTab");
    if (m) m.classList.toggle("active", currentSource === "mine");
    if (s) s.classList.toggle("active", currentSource === "supplier");
}

function renderPriceList() {
    const priceList = document.getElementById("priceList");
    if (!priceList) return;

    const model = data.models.find(x => x.id === currentModelId);
    if (!model) { priceList.innerHTML = ""; return; }

    const isMine = currentSource === "mine";
    const text = isMine ? model.mineText : model.supText;
    
    if (!text || !String(text).trim()) {
        priceList.innerHTML = `<div class="empty">No hay información cargada en esta sección.</div>`;
        return;
    }

    const btnClass = isMine ? "copy-all-btn copy-mine" : "copy-all-btn copy-supplier";
    const btnText = isMine ? "📋 Copiar mis precios" : "📋 Copiar precios de proveedores";
    const isAlert = model.needsPriceUpdate || (model.updatedAt && (Date.now() - model.updatedAt > 90 * 24 * 60 * 60 * 1000));
    
    let dateBadge = model.updatedAt ? `<div class="price-date-badge">🕒 Actualizado: ${formatDate(model.updatedAt)}</div>` : "";
    let alertBadge = isAlert ? `<div class="alert-badge" style="position:static; display:inline-block; margin-right:10px;">⚠️ REVISAR PRECIO</div>` : "";

    priceList.innerHTML = `
        <div class="full-price-card">
            <div class="price-actions-top">
                <div>${dateBadge} ${alertBadge}</div>
            </div>
            <div class="full-price-text" id="fullPriceText">${escapeHtml(text)}</div>
            <button class="${btnClass}" id="copyAllPriceBtn" type="button">${btnText}</button>
            ${isMine ? `<button class="btn-whatsapp" id="waBtn" type="button">🟢 Compartir por WhatsApp</button>` : ''}
        </div>
    `;

    document.getElementById("copyAllPriceBtn").addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(text);
            showToast(isMine ? "✅ Mis precios copiados" : "✅ Precios de proveedores copiados");
        } catch (e) {
            const ta = document.createElement("textarea");
            ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
            showToast("✅ Copiado");
        }
    });

    if (isMine) {
    document.getElementById("waBtn").addEventListener("click", async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Precios TECNOFS',
                    text: text
                });
            } catch (err) {
                console.log('Compartir cancelado');
            }
        } else {
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        }
    });
}
}

function shareWhatsApp(text, number) {
    const url = `https://wa.me/595${number}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

/* =========================================================
   SOLUCIONES Y FALLAS
========================================================= */
function renderSolutions() {
    const vBrands = document.getElementById("solViewBrands");
    const vFaults = document.getElementById("solViewFaults");
    const vDetail = document.getElementById("solViewDetail");
    
    if(!vBrands || !vFaults || !vDetail) return;

    vBrands.style.display = "none";
    vFaults.style.display = "none";
    vDetail.style.display = "none";

    if (solView === "brands") {
        vBrands.style.display = "block";
        const grid = document.getElementById("solBrandsGrid");
        const solBrandIds = [...new Set(data.solutions.map(s => s.brandId))];
        let brands = data.brands.filter(b => solBrandIds.includes(b.id));
        
        if(solSearch) {
            brands = brands.filter(b => {
                const sols = data.solutions.filter(s => s.brandId === b.id);
                return sols.some(s => normalizeText(s.title).includes(solSearch));
            });
        }

        if (!brands.length) { grid.innerHTML = `<div class="empty-models">No hay soluciones registradas.</div>`; return; }
        
        grid.innerHTML = brands.map(b => `
            <div class="brand-card" data-solbrand="${b.id}">
                <div class="brand-logo-wrap">${b.image ? `<img src="${escapeHtml(b.image)}">` : `<span style="font-size:40px;font-weight:900">${escapeHtml(b.name.charAt(0))}</span>`}</div>
                <div class="brand-body"><div class="brand-name">${escapeHtml(b.name)}</div></div>
            </div>
        `).join("");
        
        grid.querySelectorAll("[data-solbrand]").forEach(el => el.addEventListener("click", () => {
            solBrandId = el.dataset.solbrand; solView = "faults"; renderSolutions();
        }));

    } else if (solView === "faults") {
        vFaults.style.display = "block";
        const b = data.brands.find(x => x.id === solBrandId);
        const grid = document.getElementById("solFaultsGrid");
        
        document.getElementById("crumbSolBrand").textContent = b ? b.name : "";
        let sols = data.solutions.filter(s => s.brandId === solBrandId);
        
        if(solSearch) sols = sols.filter(s => normalizeText(s.title).includes(solSearch));
        
        document.getElementById("solFaultCount").textContent = sols.length;
        
        if (!sols.length) { grid.innerHTML = `<div class="empty-models">No hay fallas.</div>`; return; }
        
        grid.innerHTML = sols.map(s => `
            <div class="sol-card" data-sol="${s.id}">
                <div class="sol-image">
                    ${s.images && s.images[0] ? `<img src="${escapeHtml(s.images[0])}">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%">🛠️</div>`}
                    <div class="sol-brand-badge">${escapeHtml(b ? b.name : "")}</div>
                </div>
                <div class="sol-body">
                    <div class="sol-title">${escapeHtml(s.title)}</div>
                </div>
            </div>
        `).join("");
        
        grid.querySelectorAll("[data-sol]").forEach(el => el.addEventListener("click", () => {
            solFaultId = el.dataset.sol; solView = "detail"; renderSolutions();
        }));

    } else if (solView === "detail") {
        vDetail.style.display = "block";
        const s = data.solutions.find(x => x.id === solFaultId);
        const b = data.brands.find(x => x.id === s.brandId);
        const gal = document.getElementById("solDetailGallery");
        
        document.getElementById("solDetailBrand").textContent = b ? b.name : "";
        document.getElementById("solDetailTitle").textContent = s.title;
        document.getElementById("solDetailDesc").textContent = s.desc;
        
        if (s.images && s.images.length) {
            gal.innerHTML = s.images.map(img => `<img src="${escapeHtml(img)}" data-fullimg="${escapeHtml(img)}">`).join("");
            gal.querySelectorAll("[data-fullimg]").forEach(img => img.addEventListener("click", () => {
                document.getElementById("imageModalImg").src = img.dataset.fullimg;
                document.getElementById("imageModal").classList.add("show");
            }));
        } else {
            gal.innerHTML = `<div class="empty" style="grid-column:1/-1">No hay fotos.</div>`;
        }
    }
}

/* =========================================================
   NOTAS RÁPIDAS
========================================================= */
function renderNotes() {
    const grid = document.getElementById("notesGrid");
    if(!grid) return;
    
    if (!Array.isArray(data.notes)) data.notes = [];

    if (!data.notes.length) {
        grid.innerHTML = `<div class="empty-models" style="grid-column:1/-1;"><div class="icon">📝</div>No hay notas guardadas.</div>`;
        return;
    }

    grid.innerHTML = data.notes.map(n => `
        <div class="note-card" data-shownote="${n.id}">
            ${n.image ? `<img src="${escapeHtml(n.image)}" class="note-img">` : ''}
            <div class="note-title">${escapeHtml(n.title)}</div>
            <div class="note-date">📅 ${formatDate(n.date)}</div>
        </div>
    `).join("");

    grid.querySelectorAll("[data-shownote]").forEach(card => {
        card.addEventListener("click", () => {
            const n = data.notes.find(x => x.id === card.dataset.shownote);
            if(!n) return;
            
            openModal(n.title, `
                ${n.image ? `<img src="${escapeHtml(n.image)}" style="width:100%; max-height:250px; object-fit:contain; border-radius:10px; margin-bottom:15px; background:#000;">` : ''}
                <div class="note-date" style="margin-bottom:15px;">📅 ${formatDate(n.date)}</div>
                <p style="font-size:14px; line-height:1.6; white-space:pre-wrap; margin-bottom:20px;">${escapeHtml(n.desc)}</p>
                <button class="btn btn-danger" id="delNoteBtn" style="width:100%;">🗑️ Borrar Nota</button>
            `, "Cerrar");
            
            document.getElementById("modalConfirmBtn").style.display = "none"; 
            
            document.getElementById("delNoteBtn").onclick = () => {
                confirmDelete("¿Estás seguro que querés borrar esta nota?", () => {
                    data.notes = data.notes.filter(x => x.id !== n.id);
                    saveData(); renderNotes(); closeModal();
                });
            };
        });
    });
}

/* =========================================================
   ALERTAS Y ADMINISTRACIÓN
========================================================= */
function renderAlerts() {
    const list = document.getElementById("alertsList");
    if (!list) return;
    
    let models = [...data.models];
    if (alertsSearch) models = models.filter(m => normalizeText(m.name).includes(alertsSearch));
    
    document.getElementById("alertsBadge").textContent = models.length;
    if (!models.length) { list.innerHTML = `<div class="empty">No hay modelos</div>`; return; }
    
    list.innerHTML = models.map(m => {
        const isAlert = m.needsPriceUpdate || (m.updatedAt && (Date.now() - m.updatedAt > 90 * 24 * 60 * 60 * 1000));
        return `
            <div class="alert-checkbox-item">
                <input type="checkbox" data-alertchk="${m.id}" ${selectedAlertModels.has(m.id) ? 'checked' : ''}>
                <div style="flex:1; cursor:pointer;" data-openalert="${m.id}">
                    <strong style="display:block;font-size:14px;">${escapeHtml(m.name)}</strong>
                    <span class="alert-price-display">${escapeHtml((m.mineText || "").substring(0, 30))}...</span>
                </div>
                <div class="alert-date-display">${formatDate(m.updatedAt)}</div>
                ${isAlert ? `<button class="btn btn-danger" style="padding:5px 10px; font-size:11px;" data-clearalert="${m.id}">Quitar</button>` : ''}
            </div>
        `;
    }).join("");
    
    list.querySelectorAll("[data-alertchk]").forEach(chk => chk.addEventListener("change", (e) => {
        if (e.target.checked) selectedAlertModels.add(e.target.dataset.alertchk);
        else selectedAlertModels.delete(e.target.dataset.alertchk);
    }));

    list.querySelectorAll("[data-openalert]").forEach(el => el.addEventListener("click", () => {
        openModel(el.dataset.openalert);
    }));

    list.querySelectorAll("[data-clearalert]").forEach(btn => btn.addEventListener("click", () => {
        const m = data.models.find(x => x.id === btn.dataset.clearalert);
        if(m) { m.needsPriceUpdate = false; saveData(); renderAlerts(); renderModelsView(); showToast("Alerta quitada"); }
    }));
}

function renderCategoriesAdmin() {
    const list = document.getElementById("categoriesAdminList"), badge = document.getElementById("adminCatBadge");
    if (!list) return;
    
    let cats = sortByName(data.categories);
    if (adminSearch) cats = cats.filter(c => normalizeText(c.name).includes(adminSearch));
    if (badge) badge.textContent = cats.length;
    
    if (!cats.length) { list.innerHTML = `<div class="empty">No hay categorías.</div>`; return; }
    
    list.innerHTML = cats.map(cat => {
        const count = data.models.filter(m => m.categoryId === cat.id).length;
        return `
            <div class="admin-item">
                <div class="admin-item-info"><strong>${escapeHtml(cat.name)}</strong><span>${count} modelos</span></div>
                <div class="admin-actions">
                    <button type="button" data-edit-cat="${escapeHtml(cat.id)}">Editar</button>
                    <button type="button" class="del" data-del-cat="${escapeHtml(cat.id)}">✕</button>
                </div>
            </div>
        `;
    }).join("");
    
    list.querySelectorAll("[data-edit-cat]").forEach(b => b.addEventListener("click", () => openCategoryModal(b.dataset.editCat)));
    list.querySelectorAll("[data-del-cat]").forEach(b => b.addEventListener("click", () => deleteCategory(b.dataset.delCat)));
}

function renderBrandsAdmin() {
    const list = document.getElementById("brandsAdminList"), badge = document.getElementById("adminBrandBadge");
    if (!list) return;
    
    let brands = sortByName(data.brands);
    if (adminSearch) brands = brands.filter(b => normalizeText(b.name).includes(adminSearch));
    if (badge) badge.textContent = brands.length;
    
    if (!brands.length) { list.innerHTML = `<div class="empty">No hay marcas.</div>`; return; }
    
    list.innerHTML = brands.map(brand => {
        const count = data.models.filter(m => m.brandId === brand.id).length;
        return `
            <div class="admin-item">
                <div class="admin-item-info"><strong>${escapeHtml(brand.name)}</strong><span>${count} modelos</span></div>
                <div class="admin-actions">
                    <button type="button" data-edit-brand="${escapeHtml(brand.id)}">Editar</button>
                    <button type="button" class="del" data-del-brand="${escapeHtml(brand.id)}">✕</button>
                </div>
            </div>
        `;
    }).join("");
    
    list.querySelectorAll("[data-edit-brand]").forEach(b => b.addEventListener("click", () => openBrandModal(b.dataset.editBrand)));
    list.querySelectorAll("[data-del-brand]").forEach(b => b.addEventListener("click", () => deleteBrand(b.dataset.delBrand)));
}

function renderModelsAdmin() {
    const list = document.getElementById("modelsAdminList"), badge = document.getElementById("adminModelBadge"), info = document.getElementById("adminSearchInfo");
    if (!list) return;
    
    let models = [...data.models];
    if (adminSearch) models = models.filter(m => {
        const b = data.brands.find(x => x.id === m.brandId), c = data.categories.find(x => x.id === m.categoryId);
        return normalizeText([m.name, b ? b.name : "", c ? c.name : ""].join(" ")).includes(adminSearch);
    });
    
    models = sortByName(models);
    if (badge) badge.textContent = models.length;
    
    if (info) {
        if (adminSearch) { info.classList.add("active"); info.textContent = `🔍 Filtrando por "${adminSearch}"`; }
        else { info.classList.remove("active"); info.textContent = "🔍 Escribí para filtrar."; }
    }
    
    if (!models.length) { list.innerHTML = `<div class="empty">No hay modelos.</div>`; return; }
    
    list.innerHTML = models.map(model => {
        const brand = data.brands.find(x => x.id === model.brandId);
        const category = data.categories.find(x => x.id === model.categoryId);
        let preview = model.image ? `<img src="${escapeHtml(model.image)}" loading="lazy">` : `<span style="font-size:22px;opacity:.5">📱</span>`;
        
        return `
            <div class="admin-item">
                <div class="admin-model-main">
                    <div class="admin-model-preview">${preview}</div>
                    <div class="admin-model-text">
                        <strong>${escapeHtml(model.name)}</strong>
                        <span>${escapeHtml(brand ? brand.name : "Sin marca")} · ${escapeHtml(category ? category.name : "Sin categoría")}</span>
                    </div>
                </div>
                <div class="admin-actions">
                    <button type="button" data-edit-model="${escapeHtml(model.id)}">Editar</button>
                    <button type="button" class="del" data-del-model="${escapeHtml(model.id)}">✕</button>
                </div>
            </div>
        `;
    }).join("");
    
    list.querySelectorAll("[data-edit-model]").forEach(b => b.addEventListener("click", () => openEditor(b.dataset.editModel)));
    list.querySelectorAll("[data-del-model]").forEach(b => b.addEventListener("click", () => deleteModel(b.dataset.delModel)));
}

function renderSolutionsAdmin() {
    const list = document.getElementById("solutionsAdminList"), badge = document.getElementById("adminSolutionBadge");
    if (!list) return;
    
    if (badge) badge.textContent = data.solutions.length;
    
    list.innerHTML = data.solutions.map(s => {
        const b = data.brands.find(x => x.id === s.brandId);
        return `
            <div class="admin-item">
                <div class="admin-model-main">
                    <div class="admin-model-preview">${s.images && s.images[0] ? `<img src="${escapeHtml(s.images[0])}">` : `🛠️`}</div>
                    <div class="admin-model-text">
                        <strong>${escapeHtml(s.title)}</strong>
                        <span>${escapeHtml(b ? b.name : "")}</span>
                    </div>
                </div>
                <div class="admin-actions">
                    <button data-editsol="${s.id}">Editar</button>
                    <button class="del" data-delsol="${s.id}">✕</button>
                </div>
            </div>
        `;
    }).join("");
    
    list.querySelectorAll("[data-editsol]").forEach(b => b.addEventListener("click", () => openSolutionModal(b.dataset.editsol)));
    list.querySelectorAll("[data-delsol]").forEach(b => b.addEventListener("click", () => deleteSolution(b.dataset.delsol)));
}

function renderAdmin() {
    renderCategoriesAdmin();
    renderBrandsAdmin();
    renderModelsAdmin();
    renderSolutionsAdmin();
}

/* =========================================================
   MODALES Y SUBIDAS
========================================================= */
function openModal(title, html, confirmText = "Guardar") {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalBody").innerHTML = html;
    document.getElementById("modalConfirmBtn").textContent = confirmText;
    document.getElementById("modalConfirmBtn").style.display = "flex"; 
    document.getElementById("modalOverlay").classList.add("show");
}

function closeModal() {
    document.getElementById("modalOverlay").classList.remove("show");
}

// Función de borrado con botones Aceptar/Cancelar
function confirmDelete(mensaje, callback) {
    openModal("Confirmar Eliminación", `<p style="font-size:15px; line-height:1.5;">${mensaje}</p>`, "Sí, borrar");
    const btn = document.getElementById("modalConfirmBtn");
    btn.style.background = "var(--red)";
    
    btn.onclick = () => {
        callback();
        closeModal();
        btn.style.background = ""; 
    };
}

async function uploadImg(file) {
    const fd = new FormData();
    fd.append("image", file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: fd });
    const json = await res.json();
    if (json.success) return json.data.display_url;
    throw new Error("Error upload");
}

function setupUploader(zoneId, inputId, previewId, removeId, imgId, currentUrl, callback) {
    const zone = document.getElementById(zoneId), input = document.getElementById(inputId);
    const preview = document.getElementById(previewId), remove = document.getElementById(removeId), img = document.getElementById(imgId);
    let tempUrl = currentUrl || "";
    
    if (tempUrl && preview && img) { preview.style.display = "block"; img.src = tempUrl; zone.style.display = "none"; }
    
    if (zone) zone.addEventListener("click", () => input.click());
    
    if (input) input.addEventListener("change", async e => {
        const f = e.target.files[0]; if (!f) return;
        zone.innerHTML = `<p>⏳ Subiendo...</p>`;
        try {
            tempUrl = await uploadImg(f);
            img.src = tempUrl; preview.style.display = "block"; zone.style.display = "none";
            callback(tempUrl);
        } catch {
            showToast("Error al subir");
            zone.innerHTML = `<p>📷 Subir foto</p>`;
        }
    });
    
    if (remove) remove.addEventListener("click", () => {
        tempUrl = ""; preview.style.display = "none"; zone.style.display = "block"; callback("");
    });
}

function openEditor(id = null) {
    const m = id ? data.models.find(x => x.id === id) : null;
    currentModelId = id;
    
    document.getElementById("editorTitle").textContent = m ? "Editar modelo" : "Nuevo modelo";
    document.getElementById("modelNameInput").value = m ? m.name : "";
    document.getElementById("modelBrandSelect").innerHTML = data.brands.map(b => `<option value="${b.id}" ${m && m.brandId === b.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join("");
    document.getElementById("modelCategorySelect").innerHTML = data.categories.map(c => `<option value="${c.id}" ${m && m.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join("");
    document.getElementById("mineTextarea").value = m ? m.mineText : "";
    document.getElementById("supplierTextarea").value = m ? m.supText : "";
    document.getElementById("modelImageUrl").value = m ? m.image : "";
    
    tempImage = m ? m.image : "";
    setupUploader("modelUploadZone", "modelImageInput", "modelPreviewContainer", "btnRemoveModelImg", "modelPreviewImg", tempImage, (url) => {
        tempImage = url;
        document.getElementById("modelImageUrl").value = url;
    });
    
    navigate("editor");
}

document.getElementById("saveModelBtn").addEventListener("click", () => {
    const name = document.getElementById("modelNameInput").value.trim(); if (!name) return showToast("Escribe un nombre");
    const brandId = document.getElementById("modelBrandSelect").value;
    const categoryId = document.getElementById("modelCategorySelect").value;
    const image = document.getElementById("modelImageUrl").value.trim() || tempImage;
    const mineText = document.getElementById("mineTextarea").value;
    const supText = document.getElementById("supplierTextarea").value;
    
    if (currentModelId) {
        const m = data.models.find(x => x.id === currentModelId);
        Object.assign(m, { name, brandId, categoryId, image, mineText, supText, updatedAt: Date.now(), needsPriceUpdate: false });
        showToast("Modelo actualizado");
    } else {
        data.models.push({ id: createId("model"), name, brandId, categoryId, image, mineText, supText, updatedAt: Date.now(), needsPriceUpdate: false });
        showToast("Modelo creado");
    }
    
    saveData(); renderAll(); navigate("admin");
});

function openCategoryModal(id = null) {
    const c = id ? data.categories.find(x => x.id === id) : null;
    
    openModal(id ? "Editar Cat" : "Nueva Cat", `
        <div class="form-group"><label>Nombre</label><input class="form-control" id="mName" value="${escapeHtml(c ? c.name : '')}"></div>
        <div class="form-group">
            <label>Imagen</label>
            <div class="upload-zone" id="mUpload"><input type="file" id="mImgIn" accept="image/*"><p>📷 Subir</p></div>
            <div class="preview-img-container" id="mPrev" style="display:${c && c.image ? 'block' : 'none'}">
                <img id="mImg" src="${c && c.image ? escapeHtml(c.image) : ''}">
                <button class="btn-remove-img" id="btnRemoveX">❌ Quitar</button>
            </div>
        </div>
    `);
    
    let tempImg = c ? c.image : "";
    setupUploader("mUpload", "mImgIn", "mPrev", "btnRemoveX", "mImg", tempImg, url => tempImg = url);
    
    document.getElementById("modalConfirmBtn").onclick = () => {
        const name = document.getElementById("mName").value.trim(); if (!name) return;
        if (id) { const cat = data.categories.find(x => x.id === id); cat.name = name; cat.image = tempImg; }
        else { data.categories.push({ id: createId("cat"), name, image: tempImg }); }
        saveData(); renderAll(); closeModal();
    };
}

function openBrandModal(id = null) {
    const b = id ? data.brands.find(x => x.id === id) : null;
    
    openModal(id ? "Editar Marca" : "Nueva Marca", `
        <div class="form-group"><label>Nombre</label><input class="form-control" id="mName" value="${escapeHtml(b ? b.name : '')}"></div>
        <div class="form-group">
            <label>Logo</label>
            <div class="upload-zone" id="mUpload"><input type="file" id="mImgIn" accept="image/*"><p>📷 Subir</p></div>
            <div class="preview-img-container" id="mPrev" style="display:${b && b.image ? 'block' : 'none'}">
                <img id="mImg" src="${b && b.image ? escapeHtml(b.image) : ''}">
                <button class="btn-remove-img" id="btnRemoveX">❌ Quitar</button>
            </div>
        </div>
    `);
    
    let tempImg = b ? b.image : "";
    setupUploader("mUpload", "mImgIn", "mPrev", "btnRemoveX", "mImg", tempImg, url => tempImg = url);
    
    document.getElementById("modalConfirmBtn").onclick = () => {
        const name = document.getElementById("mName").value.trim(); if (!name) return;
        if (id) { const br = data.brands.find(x => x.id === id); br.name = name; br.image = tempImg; }
        else { data.brands.push({ id: createId("brand"), name, image: tempImg }); }
        saveData(); renderAll(); closeModal();
    };
}

function openSolutionModal(id = null) {
    const s = id ? data.solutions.find(x => x.id === id) : null;
    
    openModal(id ? "Editar Solución" : "Nueva Solución", `
        <div class="form-group"><label>Marca</label><select class="form-control" id="solBrand">${data.brands.map(b => `<option value="${b.id}" ${s && s.brandId === b.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join("")}</select></div>
        <div class="form-group"><label>Título</label><input class="form-control" id="solTitle" value="${escapeHtml(s ? s.title : '')}"></div>
        <div class="form-group"><label>Descripción</label><textarea class="form-control" id="solDesc">${escapeHtml(s ? s.desc : '')}</textarea></div>
        <div class="form-group">
            <label>Fotos (Links Directos)</label>
            <div id="solLinkContainer" style="display:flex; flex-direction:column; gap:10px;">
                ${(s && s.images && s.images.length > 0) ? s.images.map(img => `<input type="text" class="form-control sol-link-input" value="${escapeHtml(img)}" placeholder="https://...">`).join("") : `<input type="text" class="form-control sol-link-input" placeholder="https://...">`}
            </div>
            <button type="button" class="btn btn-secondary" id="addSolLinkBtn" style="margin-top:10px; width:100%;">+ Añadir otra foto</button>
            <div id="solGalleryPreview" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
                ${(s && s.images ? s.images : []).map(url => `<img src="${url}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;">`).join("")}
            </div>
        </div>
    `);
    
    document.getElementById("addSolLinkBtn").addEventListener("click", () => {
        const container = document.getElementById("solLinkContainer");
        const input = document.createElement("input");
        input.type = "text";
        input.className = "form-control sol-link-input";
        input.placeholder = "https://...";
        container.appendChild(input);
    });

    document.getElementById("solLinkContainer").addEventListener("input", (e) => {
        if(!e.target.classList.contains('sol-link-input')) return;
        const preview = document.getElementById("solGalleryPreview");
        preview.innerHTML = "";
        const links = Array.from(document.querySelectorAll('.sol-link-input')).map(inp => inp.value.trim()).filter(url => url !== "");
        links.forEach(url => {
            preview.innerHTML += `<img src="${escapeHtml(url)}" style="width:60px;height:60px;object-fit:cover;border-radius:8px; border: 1px solid #1a2739;">`;
        });
    });
    
    document.getElementById("modalConfirmBtn").onclick = () => {
        const brandId = document.getElementById("solBrand").value;
        const title = document.getElementById("solTitle").value.trim();
        const desc = document.getElementById("solDesc").value.trim();
        if (!title) return showToast("Falta título");
        
        const inputs = document.querySelectorAll('.sol-link-input');
        const tempImages = Array.from(inputs).map(inp => inp.value.trim()).filter(url => url !== "");
        
        if (id) {
            const sol = data.solutions.find(x => x.id === id);
            Object.assign(sol, { brandId, title, desc, images: tempImages });
        } else {
            data.solutions.push({ id: createId("sol"), brandId, title, desc, images: tempImages, createdAt: Date.now() });
        }
        saveData(); renderAll(); closeModal(); showToast("Guardado");
    };
}

function deleteSolution(id) { confirmDelete("¿Estás seguro de borrar esta solución?", () => { data.solutions = data.solutions.filter(x => x.id !== id); saveData(); renderAll(); }); }
function deleteCategory(id) { confirmDelete("¿Estás seguro de borrar esta categoría?", () => { data.categories = data.categories.filter(x => x.id !== id); saveData(); renderAll(); }); }
function deleteBrand(id) { confirmDelete("¿Estás seguro de borrar esta marca?", () => { data.brands = data.brands.filter(x => x.id !== id); saveData(); renderAll(); }); }
function deleteModel(id) { confirmDelete("¿Estás seguro de borrar este modelo?", () => { data.models = data.models.filter(x => x.id !== id); saveData(); renderAll(); }); }

/* =========================================================
   INICIALIZACIÓN Y EVENTOS
========================================================= */
function renderAll() {
    renderCatalog();
    renderHistory();
    renderFavorites();
    renderSolutions();
    renderNotes();
    renderAlerts();
    renderAdmin();
    
    if (currentModelId) {
        const model = data.models.find(x => x.id === currentModelId);
        if (model) {
            const brand = data.brands.find(x => x.id === model.brandId);
            const category = data.categories.find(x => x.id === model.categoryId);
            document.getElementById("detailModelName").textContent = model.name;
            document.getElementById("detailBrand").textContent = brand ? brand.name : "Sin marca";
            document.getElementById("detailModelMeta").textContent = category ? category.name : "Sin categoría";
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("mobileMenuBtn").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
    
    document.querySelectorAll(".nav-btn").forEach(btn => btn.addEventListener("click", () => {
        const page = btn.dataset.page;
        if (["admin", "backup", "alerts"].includes(page) && !adminAuthed) { pendingPage = page; navigate("login"); return; }
        if (page === "solutions") { solView = "brands"; renderSolutions(); }
        if (page === "alerts") { selectedAlertModels.clear(); renderAlerts(); }
        if (page === "favorites") { renderFavorites(); }
        navigate(page);
    }));

    document.getElementById("loginBtn").addEventListener("click", () => {
    if (document.getElementById("loginPassword").value === ADMIN_PASSWORD) {
        adminAuthed = true; 
        document.getElementById("loginPassword").value = "";
        // Guardar sesión por 2 días
        const twoDays = 2 * 24 * 60 * 60 * 1000;
        localStorage.setItem("tecnofs_precios_session", Date.now() + twoDays);
        
        navigate(pendingPage || "admin"); pendingPage = null; showToast("✅ Acceso concedido");
    } else {
        showToast("❌ Contraseña incorrecta");
    }
});
    
    document.getElementById("logoutBtn").addEventListener("click", () => {
    adminAuthed = false;
    localStorage.removeItem("tecnofs_precios_session"); // Borra la sesión guardada
    navigate("catalog");
});

    document.getElementById("catSearchInput").addEventListener("input", e => { catSearch = normalizeText(e.target.value); renderCategoriesView(); });
    document.getElementById("brandSearchInput").addEventListener("input", e => { brandSearch = normalizeText(e.target.value); renderBrandsView(); });
    document.getElementById("modelSearchInput").addEventListener("input", e => { modelSearch = normalizeText(e.target.value); renderModelsView(); });
    document.getElementById("alertsSearchInput").addEventListener("input", e => { alertsSearch = normalizeText(e.target.value); renderAlerts(); });
    document.getElementById("adminSearchInput").addEventListener("input", e => { adminSearch = normalizeText(e.target.value); renderAdmin(); });
    
    const solSearchInput = document.getElementById("solSearchInput");
    if(solSearchInput) solSearchInput.addEventListener("input", e => { solSearch = normalizeText(e.target.value); renderSolutions(); });

    document.getElementById("backToModels").addEventListener("click", () => navigate("catalog"));
    document.getElementById("backToAdmin").addEventListener("click", () => navigate("admin"));
    document.getElementById("backToSolBrands").addEventListener("click", () => { solView = "brands"; renderSolutions(); });
    document.getElementById("backToSolFaults").addEventListener("click", () => { solView = "faults"; renderSolutions(); });

    document.getElementById("mineTab").addEventListener("click", () => { currentSource = "mine"; updateSourceTabs(); renderPriceList(); });
    document.getElementById("supplierTab").addEventListener("click", () => { currentSource = "supplier"; updateSourceTabs(); renderPriceList(); });

    document.getElementById("addCategoryBtn").addEventListener("click", () => openCategoryModal());
    document.getElementById("addBrandBtn").addEventListener("click", () => openBrandModal());
    document.getElementById("addModelBtn").addEventListener("click", () => openEditor());
    document.getElementById("addSolutionBtn").addEventListener("click", () => openSolutionModal());

    document.getElementById("cancelEditorBtn").addEventListener("click", () => navigate("admin"));

    document.getElementById("modalCancelBtn").addEventListener("click", closeModal);
    document.getElementById("modalOverlay").addEventListener("click", e => { if (e.target === e.currentTarget) closeModal(); });
    document.getElementById("imageModalClose").addEventListener("click", () => document.getElementById("imageModal").classList.remove("show"));

    document.getElementById("markAlertsBtn").addEventListener("click", () => {
        if (!selectedAlertModels.size) return showToast("Selecciona al menos uno");
        selectedAlertModels.forEach(id => {
            const m = data.models.find(x => x.id === id);
            if (m) m.needsPriceUpdate = true;
        });
        saveData(); renderAlerts(); renderModelsView(); showToast("Marcados como desactualizados");
    });

    document.getElementById("clearAllAlertsBtn").addEventListener("click", () => {
        confirmDelete("¿Quitar la alerta a TODOS los modelos?", () => {
            data.models.forEach(m => m.needsPriceUpdate = false);
            saveData(); renderAlerts(); renderModelsView(); showToast("Todas las alertas quitadas");
        });
    });

    document.getElementById("addNoteBtn").addEventListener("click", () => {
        openModal("Nueva Nota", `
            <div class="form-group"><label>Título (Obligatorio)</label><input class="form-control" id="noteTitle" type="text"></div>
            <div class="form-group"><label>Fecha</label><input class="form-control" id="noteDate" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
            <div class="form-group"><label>Descripción</label><textarea class="form-control" id="noteDesc" style="min-height:100px;"></textarea></div>
            <div class="form-group">
                <label>Foto (Opcional)</label>
                <div class="upload-zone" id="noteUpload"><input type="file" id="noteImgIn" accept="image/*"><p>📷 Subir foto</p></div>
                <div class="preview-img-container" id="notePrev" style="display:none;"><img id="noteImg" src=""><button class="btn-remove-img" id="btnRemoveNoteImg">❌ Quitar</button></div>
            </div>
        `);

        let tempNoteImage = "";
        setupUploader("noteUpload", "noteImgIn", "notePrev", "btnRemoveNoteImg", "noteImg", "", url => tempNoteImage = url);

        document.getElementById("modalConfirmBtn").onclick = () => {
            const title = document.getElementById("noteTitle").value.trim();
            const dateStr = document.getElementById("noteDate").value;
            const desc = document.getElementById("noteDesc").value.trim();
            if (!title) return showToast("El título es obligatorio");

            if (!Array.isArray(data.notes)) data.notes = [];

            data.notes.push({
                id: createId("note"),
                title: title,
                desc: desc,
                image: tempNoteImage,
                date: dateStr ? new Date(dateStr).getTime() : Date.now()
            });

            saveData(); renderNotes(); closeModal();
            showToast("Nota guardada");
        };
    });

    document.getElementById("modelSearchClear").addEventListener("click", () => {
        modelSearch = ""; document.getElementById("modelSearchInput").value = ""; renderModelsView();
    });

    document.querySelectorAll("[data-nav]").forEach(btn => btn.addEventListener("click", () => {
        const v = btn.dataset.nav;
        if (v === "categories") { catalogView = "categories"; navCategoryId = null; navBrandId = null; modelSearch = ""; document.getElementById("modelSearchInput").value = ""; }
        else if (v === "brands") { catalogView = "brands"; navBrandId = null; modelSearch = ""; document.getElementById("modelSearchInput").value = ""; }
        renderCatalog(); window.scrollTo({ top: 0, behavior: "smooth" });
    }));

    document.getElementById("exportBtn").addEventListener("click", () => {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `tecnofs-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        showToast("💾 Respaldo descargado");
    });

    document.getElementById("importFile").addEventListener("change", e => {
        const file = e.target.files[0]; if (!file) return;
        const r = new FileReader();
        r.onload = ev => {
            try {
                const imported = normalizeData(JSON.parse(ev.target.result));
                data = imported; saveData(); renderAll(); showToast("📥 Datos importados");
            } catch (err) { showToast("Archivo inválido"); }
        };
        r.readAsText(file);
    });

    document.getElementById("forceSyncBtn").addEventListener("click", () => {
        if (!cloudLoaded) return showToast("Esperá a Firebase");
        saveCloud();
    });

// Lógica para borrar todo el catálogo
const wipeBtn = document.getElementById("wipeAllDataBtn");
if(wipeBtn) {
    wipeBtn.addEventListener("click", () => {
        if(confirm("¡CUIDADO! Se borrará TODO el catálogo (marcas, modelos, precios, fallas) de la nube y del celular.\n\n¿Estás seguro?")) {
            if(confirm("Última oportunidad. ¿Confirmas que quieres borrar todo para cargar tu JSON?")) {
                data = { categories: [], brands: [], models: [], solutions: [], notes: [] };
                saveLocal();
                db.ref("tecnofs").set(data).then(() => {
                    renderAll();
                    showToast("Catálogo borrado. Ya puedes importar tu JSON.");
                }).catch(e => showToast("Error al borrar"));
            }
        }
    });
}

    document.getElementById("clearHistoryBtn").addEventListener("click", () => {
        confirmDelete("¿Borrar todo el historial de este dispositivo?", () => {
            history = [];
            localStorage.removeItem(HISTORY_KEY);
            renderHistory();
            showToast("Historial limpiado");
        });
    });

    renderAll();
    setSyncStatus("Conectando...", "Firebase");
    loadCloud();
});