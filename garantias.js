"use strict";

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
const HISTORY_PASSWORD = "franco@152007";

let db = null;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
} catch (e) { console.error("Firebase error:", e); }

(function() {
  function $(id){ return document.getElementById(id); }

  /* =========================================================
     UTILIDADES
     ========================================================= */
  function isoAFecha(iso){
    if(!iso) return "";
    var p = iso.split("-");
    if(p.length !== 3) return iso;
    return p[2] + "/" + p[1] + "/" + p[0];
  }
  function sumarMeses(iso, meses){
    var p = iso.split("-").map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    var dia = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + meses);
    var ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(dia, ultimoDia));
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function hoyISO(){
    var h = new Date();
    return h.getFullYear() + "-" + String(h.getMonth() + 1).padStart(2, "0") + "-" + String(h.getDate()).padStart(2, "0");
  }
  function sanitizarNombre(txt){
    return (txt || "").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").replace(/\.+$/, "").trim();
  }
  function mostrarMensaje(texto, tipo){
    var m = $("mensaje");
    if(!m) return;
    m.textContent = texto;
    m.className = "mensaje " + tipo;
    clearTimeout(m._timer);
    m._timer = setTimeout(function(){ m.className = "mensaje"; }, 5000);
  }

  /* =========================================================
     SUBIDA A IMGBB
     ========================================================= */
  async function uploadImageToImgbb(file) {
    const fd = new FormData();
    fd.append("image", file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: fd });
    const json = await res.json();
    if (json.success) return json.data.display_url;
    throw new Error("Error upload");
  }

  function setupUploader(zoneId, fileInputId, urlInputId) {
    const zone = $(zoneId);
    const input = $(fileInputId);
    const urlInput = $(urlInputId);
    if(!zone || !input || !urlInput) return;

    zone.addEventListener("click", () => input.click());
    input.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if(!file) return;
      zone.innerHTML = `<p>⏳ Subiendo foto...</p>`;
      try {
        const url = await uploadImageToImgbb(file);
        urlInput.value = url;
        zone.innerHTML = `<p>✅ Foto subida</p>`;
        zone.style.borderColor = "#18c964";
        zone.style.background = "rgba(24, 201, 100, 0.1)";
      } catch (error) {
        zone.innerHTML = `<p>❌ Error. Toca para reintentar</p>`;
        zone.style.borderColor = "#d93025";
        zone.style.background = "rgba(217, 48, 37, 0.1)";
        mostrarMensaje("Error al subir imagen. Revisa tu conexión.", "error");
      } finally { input.value = ""; }
    });
  }

  setupUploader("uploadFrontal", "fileFrontal", "fotoFrontal");
  setupUploader("uploadTrasera", "fileTrasera", "fotoTrasera");
  setupUploader("uploadAntes", "fileAntes", "fotoAntes");

  /* =========================================================
     FORMULARIO Y SWITCH
     ========================================================= */
  const toggleGarantia = $("toggleGarantia");
  const labelGarantia = $("labelGarantia");

  toggleGarantia.addEventListener("change", () => {
    if(toggleGarantia.checked) {
      labelGarantia.textContent = "Con Garantía";
      labelGarantia.style.color = "#fff";
    } else {
      labelGarantia.textContent = "Sin Garantía";
      labelGarantia.style.color = "#ff5566";
    }
  });

  function calcularVencimiento(){
    var f = $("fecha").value;
    var m = parseInt($("meses").value, 10);
    if(isNaN(m)) m = 0;
    if(f){ $("vencimiento").value = sumarMeses(f, m); }
  }
  $("fecha").addEventListener("change", calcularVencimiento);
  $("meses").addEventListener("input", calcularVencimiento);

  function nombreBase(){
    var custom = $("nombreArchivo").value.trim();
    if(custom !== "") return sanitizarNombre(custom);
    var cliente = sanitizarNombre($("cliente").value.trim());
    if(cliente === "") return "Garantía - Cliente";
    return "Garantía - " + cliente;
  }
  function actualizarPreview(){
    var base = nombreBase() || "Garantía";
    $("previewNombre").innerHTML = "Se guardará como: <b>" + base + ".html</b>";
  }
  $("nombreArchivo").addEventListener("input", actualizarPreview);
  $("cliente").addEventListener("input", function(){
    $("nombreArchivo").placeholder = "Ej: Garantía - " + ($("cliente").value.trim() || "Cliente");
    actualizarPreview();
  });

  function recogerDatos(){
    var form = $("formGarantia");
    if(!form.checkValidity()){
      form.reportValidity();
      mostrarMensaje("⚠ Completa los campos obligatorios (*)", "error");
      return null;
    }
    if(!$("vencimiento").value){ calcularVencimiento(); }
    
    return {
      cliente: $("cliente").value.trim(),
      telefono: $("telefono").value.trim(),
      email: $("email").value.trim(),
      modelo: $("modelo").value.trim(),
      imei: $("imei").value.trim() || "NO REGISTRADO",
      precio: $("precio").value.trim(), // Se guarda para el historial, NO para el HTML
      tieneGarantia: toggleGarantia.checked,
      fecha: isoAFecha($("fecha").value),
      fechaISO: $("fecha").value,
      vencimiento: isoAFecha($("vencimiento").value),
      meses: $("meses").value,
      trabajo: $("trabajo").value.trim(),
      fotoFrontal: $("fotoFrontal").value.trim(),
      fotoTrasera: $("fotoTrasera").value.trim(),
      fotoAntes: $("fotoAntes").value.trim()
    };
  }

  /* =========================================================
     CONSTRUCCIÓN DEL HTML (CON LÓGICA DE CON/SIN GARANTÍA)
     ========================================================= */
  function construirHTML(d){
    // Excluimos el precio del objeto que va al HTML del cliente
    const datosCliente = {
      cliente: d.cliente, telefono: d.telefono, email: d.email,
      modelo: d.modelo, imei: d.imei, fecha: d.fecha, vencimiento: d.vencimiento,
      trabajo: d.trabajo, fotoFrontal: d.fotoFrontal, fotoTrasera: d.fotoTrasera, fotoAntes: d.fotoAntes
    };
    
    var json = JSON.stringify(datosCliente, null, 2).replace(/</g, "\\u003c");
    var numMeses = parseInt(d.meses, 10) || 0;
    var textoMeses = (numMeses === 1) ? "1 Mes" : numMeses + " Meses";

    // Lógica Condicional
    const badgeEstado = d.tieneGarantia 
      ? `<span id="estadoGarantia">🟢 GARANTÍA VIGENTE</span>`
      : `<span style="background:#d93025; color:white; padding:12px 30px; border-radius:50px; font-weight:bold; font-size:17px; display:inline-block;">🔴 SIN GARANTÍA</span>`;
      
    const bloqueTerminos = d.tieneGarantia ? `
      <div class="terminos">
        <h3>TÉRMINOS Y CONDICIONES</h3>
        <ul>
          <li>La garantía es válida por <b>${textoMeses}</b> contados desde la fecha de entrega del equipo.</li>
          <li>La garantía cubre únicamente el trabajo realizado y/o el repuesto instalado por <b>TECNOFS</b>.</li>
          <li>No cubre daños ocasionados por golpes, caídas, humedad, líquidos, sobrevoltaje, manipulación por terceros o cualquier uso indebido del equipo.</li>
          <li>Si el equipo es abierto, manipulado o reparado por otro técnico, la garantía quedará automáticamente anulada.</li>
          <li>Las piezas suministradas por el cliente no cuentan con garantía.</li>
          <li>Para hacer válida la garantía deberá presentar este comprobante digital.</li>
          <li>TECNOFS no se responsabiliza por fallas preexistentes ni por daños no relacionados con el servicio realizado.</li>
          <li>La garantía vence automáticamente en la fecha indicada en este documento.</li>
        </ul>
      </div>` : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>COMPROBANTE TECNOFS</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#050505;}.contenedor{box-shadow:none;margin:0;}.botones{display:none;}}
*{margin:0;padding:0;box-sizing:border-box;font-family:'Poppins',sans-serif;}
body{background:#050505;background-image:radial-gradient(circle at top,#0f3b70,#050505 60%);padding:35px;color:white;user-select:none;}
.contenedor{max-width:1100px;margin:auto;background:#101010;border:2px solid #1f6fff;border-radius:25px;overflow:hidden;box-shadow:0 0 45px rgba(0,120,255,.45);animation:entrada .8s;}
@keyframes entrada{from{opacity:0;transform:translateY(40px);}to{opacity:1;transform:translateY(0);}}
.header{background:#080808;padding:35px;text-align:center;border-bottom:2px solid #1f6fff;position:relative;}
.header img{width:170px;margin-bottom:12px;display:inline-block;}
.header h1{font-size:38px;letter-spacing:3px;}
.subtitulo{color:#46a4ff;font-size:17px;margin-top:5px;font-weight:600;letter-spacing:1px;}
.sistema{color:#c9e6ff;font-size:14px;margin-top:6px;letter-spacing:1px;}
.estado{display:flex;justify-content:center;margin-top:25px;}
.estado span{padding:12px 30px;background:#18c964;border-radius:50px;font-weight:bold;font-size:17px;animation:pulse 2s infinite;}
@keyframes pulse{50%{transform:scale(1.05);}}
.info{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;padding:35px;}
.campo{background:#181818;padding:18px;border-radius:15px;border-left:5px solid #2d8cff;}
.campo label{display:block;color:#6eb8ff;font-size:13px;margin-bottom:8px;}
.valor{font-size:18px;color:white;word-break:break-word;}
@media(max-width:700px){.info{grid-template-columns:1fr;}.header h1{font-size:30px;}}
.trabajo{margin:35px;padding:25px;background:#181818;border-radius:20px;border-left:5px solid #1f6fff;}
.trabajo h3{color:#49a7ff;margin-bottom:15px;font-size:22px;}
.descripcion{background:#101010;border:1px solid #1f6fff;border-radius:15px;padding:18px;line-height:1.8;font-size:16px;white-space:pre-line;}
.fotos{margin:35px;}
.fotos h3{color:#49a7ff;margin-bottom:20px;}
.galeria{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;}
.foto{background:#080808;border:2px solid #1f6fff;border-radius:15px;padding:10px;text-align:center;}
.foto img{width:100%;height:220px;object-fit:contain;background:#111;border-radius:10px;}
.foto p{margin-top:10px;color:#7dc1ff;font-size:14px;font-weight:600;}
@media(max-width:700px){.galeria{grid-template-columns:1fr;}}
.terminos{margin:35px;padding:25px;background:#181818;border-left:5px solid #1f6fff;border-radius:20px;}
.terminos h3{color:#49a7ff;margin-bottom:18px;}
.terminos ul{padding-left:22px;line-height:2;}
.terminos li{margin-bottom:8px;}
.botones{display:flex;justify-content:center;padding:35px;}
button{background:#1f6fff;color:white;border:none;padding:16px 35px;border-radius:12px;font-size:17px;font-weight:bold;cursor:pointer;transition:.3s;font-family:'Poppins',sans-serif;}
button:hover{background:#3b93ff;transform:translateY(-3px);}
.footer{background:#080808;border-top:2px solid #1f6fff;padding:30px;text-align:center;line-height:1.9;color:#cfe8ff;}
.footer h3{color:#46a4ff;font-size:28px;margin-bottom:10px;letter-spacing:2px;}
.footer p{font-size:15px;}
.footer a{color:#66b8ff;text-decoration:none;font-weight:bold;transition:.3s;}
.footer a:hover{color:white;text-decoration:underline;}
</style>
</head>
<body>
<div class="contenedor">
<div class="header">
<img src="https://francocolman.github.io/inventario/logo.png" alt="Logo TECNOFS">
<h1>TECNOFS</h1>
<div class="subtitulo">SERVICIO TÉCNICO ESPECIALIZADO</div>
<div class="sistema">${d.tieneGarantia ? 'Garantía Digital Oficial' : 'Comprobante de Servicio'}</div>
<div class="estado">${badgeEstado}</div>
</div>
<div class="info">
<div class="campo"><label>CLIENTE</label><div class="valor" id="cliente"></div></div>
<div class="campo"><label>TELÉFONO</label><div class="valor" id="telefono"></div></div>
<div class="campo" id="campoEmail"><label>EMAIL</label><div class="valor" id="email"></div></div>
<div class="campo"><label>MODELO DEL EQUIPO</label><div class="valor" id="modelo"></div></div>
<div class="campo"><label>IMEI</label><div class="valor" id="imei"></div></div>
<div class="campo"><label>FECHA DE REPARACIÓN</label><div class="valor" id="fecha"></div></div>
${d.tieneGarantia ? `<div class="campo"><label>VENCIMIENTO DE GARANTÍA</label><div class="valor" id="vencimiento"></div></div>` : ''}
</div>
<div class="trabajo">
<h3>TRABAJO REALIZADO</h3>
<div class="descripcion" id="trabajo"></div>
</div>
<div class="fotos" id="bloqueFotos">
<h3>FOTOGRAFÍAS DEL EQUIPO</h3>
<div class="galeria">
<div class="foto" id="cardFrontal"><img id="fotoFrontal" alt="Foto frontal"><p>FOTO FRONTAL</p></div>
<div class="foto" id="cardTrasera"><img id="fotoTrasera" alt="Foto trasera"><p>FOTO TRASERA</p></div>
<div class="foto" id="cardAntes"><img id="fotoAntes" alt="Antes y despues"><p>ANTES Y DESPUES</p></div>
</div>
</div>
${bloqueTerminos}
<div class="botones"><button onclick="window.print()">🖨 GUARDAR COMO PDF</button></div>
<div class="footer">
<h3>TECNOFS</h3>
<p>SERVICIO TÉCNICO ESPECIALIZADO</p>
<p>📧 <a href="mailto:tecnofs.py@gmail.com">tecnofs.py@gmail.com</a></p>
<p>📱 <a href="https://wa.me/595971212389">+595971212389</a></p>
<p>© 2026 - Todos los derechos reservados.</p>
</div>
</div>
<script>
const garantia = ${json};
const tieneGarantia = ${d.tieneGarantia};
document.getElementById("cliente").textContent = garantia.cliente;
document.getElementById("telefono").textContent = garantia.telefono;
document.getElementById("modelo").textContent = garantia.modelo;
document.getElementById("imei").textContent = garantia.imei;
document.getElementById("fecha").textContent = garantia.fecha;
document.getElementById("trabajo").textContent = garantia.trabajo;
if(garantia.email && garantia.email.trim() !== ""){ document.getElementById("email").textContent = garantia.email; } else { document.getElementById("campoEmail").style.display = "none"; }
if(tieneGarantia) {
  document.getElementById("vencimiento").textContent = garantia.vencimiento;
}
function ponerFoto(idCard, idImg, url){ if(url && url.trim() !== ""){ document.getElementById(idImg).src = url.trim(); }else{ document.getElementById(idCard).style.display = "none"; } }
ponerFoto("cardFrontal", "fotoFrontal", garantia.fotoFrontal);
ponerFoto("cardTrasera", "fotoTrasera", garantia.fotoTrasera);
ponerFoto("cardAntes", "fotoAntes", garantia.fotoAntes);
if((!garantia.fotoFrontal || garantia.fotoFrontal.trim() === "") && (!garantia.fotoTrasera || garantia.fotoTrasera.trim() === "") && (!garantia.fotoAntes || garantia.fotoAntes.trim() === "")){ document.getElementById("bloqueFotos").style.display = "none"; }
if(tieneGarantia) {
  let hoy = new Date(); hoy.setHours(0,0,0,0);
  let partes = garantia.vencimiento.split("/");
  let fechaVencimiento = new Date(parseInt(partes[2], 10), parseInt(partes[1], 10) - 1, parseInt(partes[0], 10));
  fechaVencimiento.setHours(0,0,0,0);
  const estado = document.getElementById("estadoGarantia");
  if(hoy <= fechaVencimiento){ estado.innerHTML = "🟢 GARANTÍA VIGENTE"; estado.style.background = "#18c964"; }else{ estado.innerHTML = "🔴 GARANTÍA VENCIDA"; estado.style.background = "#d93025"; }
}
document.addEventListener("contextmenu", function(e){ e.preventDefault(); });
<\/script>
</body>
</html>`;
  }

  /* =========================================================
     DESCARGAR Y GUARDAR
     ========================================================= */
  function descargarArchivo(contenido, nombreArchivo){
    var blob = new Blob([contenido], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  }

  $("btnGenerar").addEventListener("click", function(){
    var datos = recogerDatos();
    if(!datos) return;
    
    // Guardar en Firebase (incluyendo el precio y el estado de garantía)
    if(db) {
      datos.createdAt = Date.now(); // Para ordenar en el historial
      db.ref("garantias").push(datos).then(() => {
        console.log("Guardado en Firebase");
        if(currentFolderType) cargarHistorial(currentFolderType); // Recargar si estamos en el historial
      }).catch(err => console.error("Error Firebase:", err));
    }

    var html = construirHTML(datos);
    var base = nombreBase() || "Garantía";
    var nombre = base + ".html";
    descargarArchivo(html, nombre);
    mostrarMensaje("✅ Comprobante generado y guardado en el historial.", "ok");
  });

  $("btnPreview").addEventListener("click", function(){
    var datos = recogerDatos();
    if(!datos) return;
    var html = construirHTML(datos);
    var blob = new Blob([html], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
  });

  $("btnLimpiar").addEventListener("click", function(){
    $("formGarantia").reset();
    $("meses").value = 1;
    $("fecha").value = hoyISO();
    $("nombreArchivo").placeholder = "Ej: Garantía - Cliente";
    toggleGarantia.checked = true;
    labelGarantia.textContent = "Con Garantía";
    labelGarantia.style.color = "#fff";
    calcularVencimiento();
    actualizarPreview();
    $("mensaje").className = "mensaje";
    
    ["Frontal", "Trasera", "Antes"].forEach(suf => {
      const zone = $("upload" + suf);
      if(zone) {
        zone.innerHTML = `<p>📷 Subir foto ${suf.toLowerCase()}</p>`;
        zone.style.borderColor = "#1f6fff";
        zone.style.background = "rgba(31, 111, 255, 0.05)";
      }
    });
  });

  /* =========================================================
     LÓGICA DEL HISTORIAL (PESTAÑAS Y LOGIN)
     ========================================================= */
  const tabForm = $("tabForm");
  const tabHistory = $("tabHistory");
  const viewForm = $("viewForm");
  const viewHistoryLogin = $("viewHistoryLogin");
  const viewHistoryFolders = $("viewHistoryFolders");
  const viewHistoryList = $("viewHistoryList");

  function showView(viewId) {
    [viewForm, viewHistoryLogin, viewHistoryFolders, viewHistoryList].forEach(v => v.style.display = "none");
    if(viewId) viewId.style.display = "block";
  }

  tabForm.addEventListener("click", () => {
    tabForm.classList.add("active");
    tabHistory.classList.remove("active");
    showView(viewForm);
  });

tabHistory.addEventListener("click", () => {
  tabHistory.classList.add("active");
  tabForm.classList.remove("active");
  const session = localStorage.getItem("auth_garantias");
  const isValid = session && Date.now() < parseInt(session, 10);
  
  if(isValid) {
    showView(viewHistoryFolders);
    cargarCarpetasCount();
  } else {
    localStorage.removeItem("auth_garantias");
    showView(viewHistoryLogin);
    $("passHistory").value = "";
    $("errorHistory").textContent = "";
  }
});

  $("btnLoginHistory").addEventListener("click", () => {
  const pass = $("passHistory").value;
  if(pass === HISTORY_PASSWORD) {
    const twoDays = 2 * 24 * 60 * 60 * 1000; // 2 días
    localStorage.setItem("auth_garantias", Date.now() + twoDays);
    showView(viewHistoryFolders);
    cargarCarpetasCount();
  } else {
    $("errorHistory").textContent = "Contraseña incorrecta.";
  }
});

  /* =========================================================
     CARPETAS Y LISTA DEL HISTORIAL
     ========================================================= */
  let historialGlobal = [];
  let currentFolderType = null; // 'con' o 'sin'

  function cargarCarpetasCount() {
    if(!db) return;
    db.ref("garantias").once("value").then(snap => {
      const data = snap.val();
      let countCon = 0, countSin = 0;
      if(data) {
        for(let key in data) {
          if(data[key].tieneGarantia) countCon++;
          else countSin++;
        }
      }
      $("countCon").textContent = countCon + " trabajos";
      $("countSin").textContent = countSin + " trabajos";
    });
  }

  $("folderCon").addEventListener("click", () => { currentFolderType = "con"; cargarHistorial("con"); showView(viewHistoryList); $("titleList").textContent = "Con Garantía"; });
  $("folderSin").addEventListener("click", () => { currentFolderType = "sin"; cargarHistorial("sin"); showView(viewHistoryList); $("titleList").textContent = "Sin Garantía"; });

  $("btnBackFolders").addEventListener("click", () => {
    showView(viewHistoryFolders);
    cargarCarpetasCount();
    $("searchHistory").value = "";
    currentFolderType = null;
  });

  function cargarHistorial(tipo) {
    if(!db) return;
    const container = $("historyContainer");
    container.innerHTML = "<p style='color:#fff; text-align:center;'>Cargando...</p>";

    db.ref("garantias").once("value").then(snap => {
      const data = snap.val();
      historialGlobal = [];
      if(data) {
        for(let key in data) {
          historialGlobal.push({ id: key, ...data[key] });
        }
      }
      
      // Filtrar por carpeta
      let filtrados = historialGlobal.filter(g => {
        if(tipo === "con") return g.tieneGarantia === true;
        else return g.tieneGarantia === false || g.tieneGarantia === undefined; // Compatibilidad con antiguos
      });

      // Ordenar por fecha (más reciente primero)
      filtrados.sort((a, b) => new Date(b.fechaISO || b.fecha.split('/').reverse().join('-')) - new Date(a.fechaISO || a.fecha.split('/').reverse().join('-')));

      renderHistorial(filtrados);
    }).catch(err => {
      console.error(err);
      container.innerHTML = "<p style='color:#ff5566; text-align:center;'>Error al conectar con Firebase.</p>";
    });
  }

  function renderHistorial(lista) {
  const container = $("historyContainer");
  
  if(lista.length === 0) {
    container.innerHTML = "<p style='color:#888; text-align:center;'>No hay registros en esta carpeta.</p>";
    return;
  }

  let currentMonth = "";
  let html = "";

  lista.forEach(g => {
    const dateParts = (g.fechaISO || g.fecha).split("-");
    const year = dateParts[0];
    const month = dateParts[1];
    const monthYear = new Date(year, month - 1).toLocaleDateString('es-PY', { month: 'long', year: 'numeric' });
    const monthLabel = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);

    if(monthLabel !== currentMonth) {
      currentMonth = monthLabel;
      html += `<div class="history-month-title">📅 ${currentMonth}</div>`;
    }

    html += `
      <div class="history-card">
        <div class="history-info">
          <h3>${g.cliente}</h3>
          <p>${g.modelo}</p>
          <p>Fecha: ${g.fecha}</p>
          <span class="price-tag">💰 ${g.precio || 'No registrado'}</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <button class="btn-download-history" onclick="descargarDesdeHistorial('${g.id}')" title="Descargar HTML">⬇</button>
          <button class="btn-download-history" style="background:#ff5566; color:white;" onclick="borrarDesdeHistorial('${g.id}')" title="Eliminar">🗑️</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Lógica para borrar garantías
let idParaBorrar = null;

window.borrarDesdeHistorial = function(id) {
  idParaBorrar = id;
  $("confirmDeleteModal").style.display = "flex";
};

$("btnCancelDelete").addEventListener("click", () => {
  idParaBorrar = null;
  $("confirmDeleteModal").style.display = "none";
});

$("btnConfirmDelete").addEventListener("click", () => {
  if(idParaBorrar && db) {
    $("confirmDeleteModal").style.display = "none";
    db.ref("garantias").child(idParaBorrar).remove().then(() => {
      idParaBorrar = null;
      if(currentFolderType) cargarHistorial(currentFolderType); // Recargar la lista
      cargarCarpetasCount(); // Actualizar los números de las carpetas
    }).catch(err => {
      console.error("Error al borrar:", err);
      alert("Error al borrar. Revisa tu conexión.");
    });
  }
});
  // Buscador
  $("searchHistory").addEventListener("input", function(e) {
    const busqueda = e.target.value.toLowerCase().trim();
    let filtrados = historialGlobal.filter(g => {
      // Filtro por carpeta
      if(currentFolderType === "con" && g.tieneGarantia !== true) return false;
      if(currentFolderType === "sin" && g.tieneGarantia === true) return false;
      
      // Filtro por búsqueda
      return g.cliente.toLowerCase().includes(busqueda) || g.modelo.toLowerCase().includes(busqueda);
    });
    
    filtrados.sort((a, b) => new Date(b.fechaISO || b.fecha.split('/').reverse().join('-')) - new Date(a.fechaISO || a.fecha.split('/').reverse().join('-')));

    renderHistorial(filtrados);
  });

  // Función global para el botón de descarga
  window.descargarDesdeHistorial = function(id) {
    const datos = historialGlobal.find(g => g.id === id);
    if(!datos) return;
    
    const html = construirHTML(datos);
    const base = "Garantía - " + datos.cliente;
    descargarArchivo(html, base + ".html");
  };

  /* =========================================================
     INICIALIZACIÓN
     ========================================================= */
  $("fecha").value = hoyISO();
  calcularVencimiento();
  actualizarPreview();

const btnLogoutHistory = $("btnLogoutHistory");
if(btnLogoutHistory) {
  btnLogoutHistory.addEventListener("click", () => {
    localStorage.removeItem("auth_garantias");
    $("passHistory").value = "";
    $("errorHistory").textContent = "";
    tabForm.classList.add("active");
    tabHistory.classList.remove("active");
    showView(viewForm);
  });
}

})();