// =======================================================================
// src/ui/agenda.js — Mi agenda (docente) y Agenda de docentes (planificador)
// Diseño aprobado: mockup_02_mi_agenda.html (navegación por semana, 25/11/2026).
// v0.2: solo lectura. "Buscar suplente" y "Recuperar" se habilitan en las etapas 4 y 5;
// los choques con festivales y las gestiones en curso, en las etapas 4 a 6.
// =======================================================================

import { leerEventos, diaISO } from "../services/calendario.js";
import { leerConfiguracion, calendarioDeProfesor, listarDocentes } from "../services/docentes.js";
import { CALENDARIOS_EXCLUIDOS_AULAS, DIAS_LIMITE_ADELANTE } from "../config/constants.js";
import { esc } from "./util.js";
import { suplenciaDeClase, suplenciasActuales } from "../services/suplencias.js";
import { abrirBuscarSuplente, abrirConfirmar } from "./suplencias.js";

/* Clases pintadas en pantalla, para que los botones sepan de qué clase y de qué docente se trata */
const enPantalla = new Map(); // clave → { clase, docente }

const DN = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MC = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const FRANJAS = {
    todo: ["Todo el día", 0, 24 * 60],
    manana: ["Mañana (hasta 13 h)", 0, 13 * 60],
    tarde: ["Tarde (13 a 18 h)", 13 * 60, 18 * 60],
    noche: ["Noche (desde 18 h)", 18 * 60, 24 * 60],
    horas: ["Elegir horas…", null, null]
};

/* Estado de la pantalla (se conserva al cambiar de sección y volver) */
const estado = {
    sel: null,          // Date del día elegido
    ver: "todos",       // planificador: 'todos' o profesorId
    franja: "todo",
    desde: "09:00",
    hasta: "22:00",
    cache: new Map()    // `${calendario}|${lunesISO}` → { clases, ocultos, error, leidoEn }
};
let ctxActual = null;
let turno = 0;          // evita que una lectura vieja pise a una nueva

/* ---------------------------------------------------------------- fechas */
const hoy0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const limite = () => { const d = hoy0(); d.setDate(d.getDate() + DIAS_LIMITE_ADELANTE); return d; };
const lunesDe = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const masDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mismoDia = (a, b) => diaISO(a) === diaISO(b);
const desdeISO = (s) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const minutosDelDia = (d) => d.getHours() * 60 + d.getMinutes();
const tituloDia = (d) => `${DL[d.getDay()].charAt(0).toUpperCase()}${DL[d.getDay()].slice(1)} ${d.getDate()} de ${MS[d.getMonth()]}`;
const icono = (id, cls = "") => `<svg class="i ${cls}"><use href="#${id}"/></svg>`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function textoRango(lun) {
    const dom = masDias(lun, 6);
    return lun.getMonth() === dom.getMonth()
        ? `${lun.getDate()} al ${dom.getDate()} de ${MS[dom.getMonth()]}`
        : `${lun.getDate()} de ${MC[lun.getMonth()]} al ${dom.getDate()} de ${MC[dom.getMonth()]}`;
}
function textoDistancia(lun) {
    const n = Math.round((lun - lunesDe(new Date())) / 6048e5);
    if (n === 0) return "Esta semana";
    if (n === 1) return "La semana que viene";
    if (n === -1) return "La semana pasada";
    return n > 0 ? `En ${n} semanas` : `Hace ${-n} semanas`;
}

/* ---------------------------------------------------------------- lectura */
async function semanaDe(calendario, lun, config) {
    const clave = `${calendario}|${diaISO(lun)}`;
    if (estado.cache.has(clave)) return estado.cache.get(clave);
    let r;
    try {
        const fin = masDias(lun, 6); fin.setHours(23, 59, 59, 0);
        r = { ...(await leerEventos(calendario, lun, fin, { iconoBateria: config.iconoBateria })), error: null, leidoEn: new Date() };
    } catch (e) {
        console.warn("[Agenda] No se pudo leer", calendario, e && e.message);
        r = { clases: [], ocultos: 0, error: e && e.message ? e.message : "Error", leidoEn: new Date() };
    }
    estado.cache.set(clave, r);
    return r;
}

/* De a 4 calendarios a la vez, como Admisión */
async function semanasDe(calendarios, lun, config) {
    const out = {};
    for (let i = 0; i < calendarios.length; i += 4) {
        const tanda = calendarios.slice(i, i + 4);
        const res = await Promise.all(tanda.map(c => semanaDe(c, lun, config)));
        tanda.forEach((c, j) => { out[c] = res[j]; });
    }
    return out;
}

function enFranja(c) {
    const f = FRANJAS[estado.franja];
    let ini = f[1], fin = f[2];
    if (estado.franja === "horas") {
        const a = estado.desde.split(":").map(Number), b = estado.hasta.split(":").map(Number);
        ini = a[0] * 60 + a[1]; fin = b[0] * 60 + b[1];
    }
    const s = minutosDelDia(c.inicio), e = s + c.duracionMin;
    return s < fin && e > ini; // la clase se superpone con la franja
}

const delDia = (clases, d) => clases.filter(c => mismoDia(c.inicio, d));

/* ---------------------------------------------------------------- pantalla */
export async function renderAgenda(cont, ctx) {
    ctxActual = ctx;
    if (!estado.sel) estado.sel = hoy0();
    const esPlanif = ctx.vista === "planificador";
    const miId = ctx.perfil.profesorId || "";
    const miTurno = ++turno;

    // v0.3: el docente también puede mirar a los demás (arranca en sus clases); el planificador arranca en todos
    if (estado.vistaDe !== ctx.vista) {
        estado.vistaDe = ctx.vista;
        estado.ver = esPlanif ? "todos" : (miId || "todos");
    }
    const viendoLoMio = !esPlanif && estado.ver === miId && !!miId;

    cont.innerHTML = `
        <div class="page-head">
            <div><h1>${esPlanif ? "Agenda de docentes" : (viendoLoMio ? "Mi agenda" : "Agenda de la escuela")}</h1>
            <p id="ag-subtitulo">${esPlanif
                ? "Clases de los calendarios de los docentes. Podés gestionar cualquiera en nombre del docente."
                : (viendoLoMio ? "Clases de tu calendario de Google. Elegí una para pedir una suplencia o recuperarla."
                               : "Clases de todos los docentes y ocupación de la escuela. Solo podés gestionar tus propias clases.")}</p></div>
            <div class="doc-sel" id="ag-docsel">
                <button type="button" class="btn-doc" id="ag-docbtn" aria-haspopup="listbox" aria-expanded="false">
                    <span class="mini" id="ag-docmini">${icono("i-users")}</span><span id="ag-doclbl">Todos los docentes</span>${icono("i-chev")}
                </button>
                <div class="menu-doc" id="ag-docmenu" hidden>
                    <input type="search" class="ds-input" id="ag-docbuscar" placeholder="Buscar docente…" autocomplete="off">
                    <div id="ag-doclista" role="listbox"></div>
                </div>
            </div>
        </div>
        <div id="ag-nav"></div>
        <div id="ag-cuerpo"><div class="card"><div class="skel"></div><div class="skel"></div><div class="skel ultimo"></div></div></div>`;

    const config = await leerConfiguracion();

    // ---- A quién se mira
    let objetivos = []; // [{profesorId, nombre, calendario, color}]
    let docentes = [];
    try { docentes = await listarDocentes(); } catch (e) { console.warn("[Agenda] No se pudo leer la lista de docentes:", e.code || e); }
    if (miTurno !== turno) return;
    // El docente siempre está en la lista, aunque su ficha no cumpla el filtro del planificador
    if (!esPlanif && miId && !docentes.some(d => d.profesorId === miId)) {
        const cal = await calendarioDeProfesor(miId);
        docentes = [{ profesorId: miId, nombre: ctx.perfil.nombre, email: ctx.perfil.email, calendario: cal, color: "#007b8f" }, ...docentes];
    }
    if (miTurno !== turno) return;
    if (estado.ver !== "todos" && !docentes.some(d => d.profesorId === estado.ver)) estado.ver = "todos";
    pintarSelector(cont, docentes, null, { esPlanif, miId });
    objetivos = estado.ver === "todos" ? docentes : docentes.filter(d => d.profesorId === estado.ver);
    if (estado.ver !== "todos" && objetivos[0] && objetivos[0].profesorId !== miId) {
        cont.querySelector("#ag-subtitulo").innerHTML = esPlanif
            ? `Viendo la agenda de <b>${esc(objetivos[0].nombre)}</b>. Lo que gestiones queda registrado como pedido por vos en nombre de ${esc(objetivos[0].nombre)}.`
            : `Estás viendo la agenda de <b>${esc(objetivos[0].nombre)}</b>. Solo podés gestionar tus propias clases.`;
    }

    const todos = estado.ver === "todos";
    pintarNav(cont, null, todos);

    // ---- Docente sin calendario (mirando sus propias clases)
    if (viendoLoMio && !objetivos[0]?.calendario) {
        cont.querySelector("#ag-cuerpo").innerHTML = `
            <div class="aviso">${icono("i-alert")}<div><b>${ctx.perfil.profesorId ? "Tu perfil docente no tiene un calendario cargado" : "Tu usuario no tiene un perfil docente vinculado"}</b>
            <p>Pedile a Coordinación que lo complete en Admisión (Configuración → Usuarios → Perfil docente).</p></div></div>`;
        return;
    }
    if (objetivos.length === 0) {
        cont.querySelector("#ag-cuerpo").innerHTML = `<div class="card"><div class="ds-empty"><b>No hay docentes para mostrar</b>No se encontraron docentes activos con perfil docente vinculado.</div></div>`;
        return;
    }

    // ---- Lectura de la semana
    const lun = lunesDe(estado.sel);
    const calendarios = [...new Set(objetivos.map(o => o.calendario).filter(Boolean))];
    if (todos && config.calendarioGeneral) calendarios.push(config.calendarioGeneral); // solo para la ocupación
    const semanas = await semanasDe([...new Set(calendarios)], lun, config);
    if (miTurno !== turno) return;

    pintarNav(cont, { objetivos, semanas, miId }, todos);
    pintarCuerpo(cont, { objetivos, semanas, config, todos, esPlanif, miId });

    // Selector: clases de la semana de cada docente (las que ya se leyeron)
    const conteos = {};
    docentes.forEach(dc => {
        const s = estado.cache.get(`${dc.calendario}|${diaISO(lun)}`);
        if (s && !s.error) conteos[dc.profesorId] = s.clases.length;
    });
    pintarSelector(cont, docentes, conteos, { esPlanif, miId });
}

/* ---------------------------------------------------------------- selector de docente (opción C, 26/11/2026)
   Planificador: "Todos los docentes" y cada docente.
   Docente (v0.3): "Mis clases" primero, después "Todos los docentes" y los demás docentes. */
function pintarSelector(cont, docentes, conteos, { esPlanif = true, miId = "" } = {}) {
    const btn = cont.querySelector("#ag-docbtn");
    if (!btn) return;
    const menu = cont.querySelector("#ag-docmenu");
    const lista = cont.querySelector("#ag-doclista");
    const buscar = cont.querySelector("#ag-docbuscar");
    const elegido = docentes.find(d => d.profesorId === estado.ver);
    const esMio = (d) => !esPlanif && miId && d.profesorId === miId;

    cont.querySelector("#ag-doclbl").textContent = elegido ? (esMio(elegido) ? "Mis clases" : elegido.nombre) : "Todos los docentes";
    cont.querySelector("#ag-docmini").innerHTML = elegido ? `<span class="dot" style="background:${elegido.color}"></span>` : icono("i-users");

    const total = conteos ? Object.values(conteos).reduce((a, b) => a + b, 0) : null;
    const item = (valor, html, n) => `<button type="button" class="md-item ${estado.ver === valor ? "on" : ""}" role="option" data-v="${esc(valor)}">${html}<span class="r">${n == null ? "" : n}</span></button>`;
    const mio = docentes.find(esMio);
    const pintarLista = (q = "") => {
        const qn = q.trim().toLowerCase();
        const filtrados = docentes.filter(d => !esMio(d) && (!qn || d.nombre.toLowerCase().includes(qn)));
        const itemMio = mio && (!qn || "mis clases".includes(qn) || mio.nombre.toLowerCase().includes(qn))
            ? item(mio.profesorId, `<span class="dot" style="background:${mio.color}"></span>Mis clases`, conteos ? conteos[mio.profesorId] : null) : "";
        lista.innerHTML = itemMio +
            (qn ? "" : item("todos", `${icono("i-users")} Todos los docentes`, total) + `<div class="md-sep"></div>`) +
            (filtrados.length
                ? filtrados.map(d => item(d.profesorId, `<span class="dot" style="background:${d.color}"></span>${esc(d.nombre)}`, conteos ? (conteos[d.profesorId] ?? (d.calendario ? null : "—")) : null)).join("")
                : `<div class="md-vacio">Ningún docente coincide</div>`);
        lista.querySelectorAll(".md-item").forEach(b => b.onclick = () => {
            abrir(false);
            if (estado.ver !== b.dataset.v) { estado.ver = b.dataset.v; renderAgenda(cont, ctxActual); }
        });
    };
    const abrir = (si) => {
        menu.hidden = !si;
        btn.setAttribute("aria-expanded", si ? "true" : "false");
        if (si) { buscar.value = ""; pintarLista(); setTimeout(() => buscar.focus(), 30); }
    };
    pintarLista(buscar.value);
    btn.onclick = (e) => { e.stopPropagation(); abrir(menu.hidden); };
    buscar.oninput = () => pintarLista(buscar.value);
    buscar.onkeydown = (e) => {
        if (e.key === "Escape") abrir(false);
        if (e.key === "Enter") { const primero = lista.querySelector(".md-item"); if (primero) primero.click(); }
    };
    if (!cerrarSelectorAlTocarAfuera.puesto) {
        document.addEventListener("click", cerrarSelectorAlTocarAfuera);
        cerrarSelectorAlTocarAfuera.puesto = true;
    }
}
function cerrarSelectorAlTocarAfuera(e) {
    const menu = document.getElementById("ag-docmenu");
    if (menu && !menu.hidden && !e.target.closest("#ag-docsel")) {
        menu.hidden = true;
        document.getElementById("ag-docbtn")?.setAttribute("aria-expanded", "false");
    }
}

/* ---------------------------------------------------------------- barra de semana */
function pintarNav(cont, datos, todos) {
    const nav = cont.querySelector("#ag-nav");
    if (!nav) return;
    const sel = estado.sel, lun = lunesDe(sel), lim = limite();
    const sigLun = masDias(lun, 7);
    const hoy = hoy0();

    let dias = "";
    for (let i = 0; i < 7; i++) {
        const d = masDias(lun, i);
        let n = null;
        if (datos) n = datos.objetivos.reduce((s, o) => s + delDia(datos.semanas[o.calendario]?.clases || [], d).filter(enFranja).length, 0);
        const fuera = d > lim;
        const dots = n ? Array.from({ length: Math.min(n, 4) }, () => "<i></i>").join("") : "";
        dias += `<button type="button" class="dia ${n === 0 ? "vacio" : ""} ${mismoDia(d, hoy) ? "hoy" : ""} ${mismoDia(d, sel) ? "on" : ""}" data-f="${diaISO(d)}" ${fuera ? "disabled" : ""}>
            <span class="dn">${DN[d.getDay()]}</span><span class="dd">${d.getDate()}</span>
            <span class="dc">${n === null ? "…" : (n ? plural(n, "clase", "clases") : "Sin clases")}</span><span class="dots">${dots}</span></button>`;
    }

    const franjas = Object.entries(FRANJAS).map(([k, f]) => `<option value="${k}" ${k === estado.franja ? "selected" : ""}>${f[0]}</option>`).join("");
    nav.innerHTML = `
        <div class="datebar">
            <div class="nav-dia">
                <button type="button" class="icon-btn" id="ag-prev" title="Semana anterior">${icono("i-left")}</button>
                <div class="semana-titulo">${textoRango(lun)}<small>${textoDistancia(lun)}</small></div>
                <button type="button" class="icon-btn" id="ag-next" title="Semana siguiente" ${sigLun > lim ? "disabled" : ""}>${icono("i-right")}</button>
            </div>
            <button type="button" class="ds-btn ds-btn-secondary sm" id="ag-hoy">Hoy</button>
            <label class="date-wrap" title="Ir a una fecha">${icono("i-cal", "solo-cel")}<input type="date" class="ds-input" id="ag-fecha" value="${diaISO(sel)}" max="${diaISO(lim)}"></label>
            <div class="sep"></div>
            <span class="lbl-mini solo-desk">Horario</span>
            <select class="ds-select" id="ag-franja">${franjas}</select>
            <span id="ag-horas" ${estado.franja === "horas" ? "" : "hidden"} class="ag-horas"><input type="time" class="ds-input" id="ag-desde" value="${estado.desde}"> a <input type="time" class="ds-input" id="ag-hasta" value="${estado.hasta}"></span>
            <button type="button" class="icon-btn" id="ag-releer" title="Volver a leer el calendario">${icono("i-refresh")}</button>
        </div>
        <div class="semana">${dias}</div>`;

    const recargar = () => renderAgenda(cont, ctxActual);
    const repintar = () => { // cambio de día o de franja dentro de la misma semana: sin volver a leer
        if (datos) { pintarNav(cont, datos, todos); pintarCuerpo(cont, { ...datos, config: null, todos, esPlanif: ctxActual.vista === "planificador" }); }
        else recargar();
    };
    const ir = (d) => {
        const mismaSemana = mismoDia(lunesDe(d), lun);
        estado.sel = d > lim ? lim : d;
        if (mismaSemana) repintar(); else recargar();
    };
    nav.querySelector("#ag-prev").onclick = () => ir(masDias(sel, -7));
    nav.querySelector("#ag-next").onclick = () => ir(masDias(sel, 7));
    nav.querySelector("#ag-hoy").onclick = () => ir(hoy0());
    nav.querySelector("#ag-fecha").onchange = (e) => { if (e.target.value) ir(desdeISO(e.target.value)); };
    nav.querySelectorAll(".dia[data-f]").forEach(b => b.onclick = () => ir(desdeISO(b.dataset.f)));
    nav.querySelector("#ag-franja").onchange = (e) => { estado.franja = e.target.value; repintar(); };
    nav.querySelector("#ag-desde").onchange = (e) => { estado.desde = e.target.value || "00:00"; repintar(); };
    nav.querySelector("#ag-hasta").onchange = (e) => { estado.hasta = e.target.value || "23:59"; repintar(); };
    nav.querySelector("#ag-releer").onclick = () => {
        const l = diaISO(lun);
        [...estado.cache.keys()].filter(k => k.endsWith(`|${l}`)).forEach(k => estado.cache.delete(k));
        recargar();
    };
}

/* ---------------------------------------------------------------- lista del día */
let configUltima = null;
function filaClase(c, { conAcciones = true, corto = false, docente = null } = {}) {
    const ahora = new Date();
    const paso = c.fin < ahora;
    const sup = suplenciaDeClase(c);
    const chips = [];
    if (c.recurrente === true) chips.push(`<span class="ds-chip">${icono("i-repeat", "sm")} Serie semanal</span>`);
    if (c.recurrente === false) chips.push(`<span class="ds-chip">${icono("i-one", "sm")} Evento único</span>`);
    if (c.bateria) chips.push(`<span class="ds-chip vio">${icono("i-drum", "sm")} Batería</span>`);
    if (sup && sup.estado === "pendiente") chips.push(`<span class="ds-chip warn">Suplencia pendiente · ${esc(String(sup.suplente.nombre).split(" ")[0])}</span>`);
    if (sup && sup.estado === "confirmada") chips.push(`<span class="ds-chip ok">Suplencia confirmada · la da ${esc(String(sup.suplente.nombre).split(" ")[0])}</span>`);
    if (!sup && /^suplencia de /i.test(c.titulo)) chips.push(`<span class="ds-chip info">${icono("i-swap", "sm")} Suplencia</span>`);
    if (paso) chips.push(`<span class="ds-chip">Ya pasó</span>`);
    const clave = c.clave;
    if (docente) enPantalla.set(clave, { clase: c, docente });
    let acciones = "";
    if (conAcciones && sup) {
        acciones = `<div class="acc">${sup.estado === "pendiente" && !paso
            ? `<button type="button" class="ds-btn ds-btn-primary sm" data-accion="aceptó" data-mov="${esc(sup.id)}">Aceptó</button>` : ""}
            <button type="button" class="ds-btn ds-btn-secondary sm" data-accion="gestion">Ver gestión</button></div>`;
    } else if (conAcciones && !c.anulada) {
        acciones = `
        <div class="acc">
            ${paso ? "" : `<button type="button" class="ds-btn ds-btn-secondary sm" data-accion="suplente" data-clave="${esc(clave)}">${icono("i-swap", "sm")} ${corto ? "Suplente" : "Buscar suplente"}</button>`}
            <button type="button" class="ds-btn ds-btn-secondary sm" data-accion="recuperar" data-clave="${esc(clave)}">${icono("i-move", "sm")} Recuperar</button>
        </div>`;
    }
    return `
        <div class="clase ${paso ? "pasada" : ""} ${c.anulada ? "anulada" : ""} ${sup && sup.estado === "pendiente" ? "gestion" : ""}">
            <div class="hora">${hhmm(c.inicio)}<small>${c.duracionMin} min</small></div>
            <div class="cuerpo"><div class="tit">${esc(c.titulo)}</div>${chips.length ? `<div class="meta">${chips.join("")}</div>` : ""}</div>
            ${acciones}
        </div>`;
}

function lineaAhora(clases) {
    // Devuelve el índice antes del cual va la línea de la hora actual (solo si el día elegido es hoy)
    if (!mismoDia(estado.sel, new Date())) return -1;
    const ahora = new Date();
    const i = clases.findIndex(c => c.inicio > ahora);
    return i === -1 ? clases.length : i;
}

function listaConAhora(clases, opts) {
    const iA = lineaAhora(clases);
    return clases.map((c, i) => (i === iA ? `<div class="ahora"><span>${hhmm(new Date())}</span></div>` : "") + filaClase(c, opts)).join("")
        + (iA === clases.length && clases.length ? `<div class="ahora"><span>${hhmm(new Date())}</span></div>` : "");
}

function hace(d) {
    const min = Math.round((Date.now() - d) / 60000);
    return min < 1 ? "recién" : `hace ${min} min`;
}

function pintarCuerpo(cont, { objetivos, semanas, config, todos, esPlanif, miId = "" }) {
    if (config) configUltima = config;
    config = configUltima;
    const cuerpo = cont.querySelector("#ag-cuerpo");
    if (!cuerpo) return;
    const d = estado.sel;
    // v0.3: el planificador gestiona todo; el docente solo sus propias clases
    const puede = (o) => esPlanif || (!!miId && o.profesorId === miId);
    const esMio = (o) => !esPlanif && !!miId && o.profesorId === miId;

    if (!todos) {
        // ---- Un solo calendario (docente, o planificador con un docente elegido)
        const o = objetivos[0];
        if (!o.calendario) {
            cuerpo.innerHTML = `<div class="aviso">${icono("i-alert")}<div><b>${esc(o.nombre)} no tiene un calendario cargado</b><p>Se carga en Admisión (Configuración → Usuarios → Perfil docente).</p></div></div>`;
            return;
        }
        const s = semanas[o.calendario] || { clases: [], ocultos: 0 };
        if (s.error) {
            cuerpo.innerHTML = `<div class="aviso bad">${icono("i-alert")}<div><b>No se pudo leer ${esMio(o) ? "tu calendario de Google" : `el calendario de ${esc(o.nombre)}`}</b>
                <p>Puede ser un problema de conexión o que el calendario no esté compartido con la escuela. Reintentá; si sigue, avisale a Coordinación.</p></div>
                <button type="button" class="ds-btn ds-btn-secondary sm" id="ag-reintentar">Reintentar</button></div>`;
            cuerpo.querySelector("#ag-reintentar").onclick = () => cont.querySelector("#ag-releer").click();
            return;
        }
        const clases = delDia(s.clases, d).filter(enFranja);
        const ocultos = delDia(s.clases, d).length - clases.length;
        const todoDia = s.ocultos ? `<div class="pie-lista">${icono("i-eyeoff", "sm")} Los eventos de todo el día de esta semana no se muestran (no cuentan como clase).</div>` : "";
        const filtrados = ocultos ? `<div class="pie-lista">${icono("i-filter", "sm")} ${plural(ocultos, "clase queda", "clases quedan")} fuera del horario elegido.</div>` : "";
        cuerpo.innerHTML = `
            <div class="card">
                <div class="card-head">
                    <h3>${esMio(o) ? icono("i-cal") : `<span class="dot" style="background:${o.color}"></span> ${esc(o.nombre)} · `} ${tituloDia(d)} · ${clases.length ? plural(clases.length, "clase", "clases") : "sin clases"}</h3>
                    <span class="sub">${puede(o) ? `${esc(o.calendario)} · ` : ""}leído ${hace(s.leidoEn)}</span>
                </div>
                ${clases.length ? listaConAhora(clases, { conAcciones: puede(o), docente: o }) : `<div class="vacio-box">${icono("i-coffee")}<b>${esMio(o) ? "No tenés clases este día" : "No tiene clases este día"}</b>${ocultos ? "Probá con otro horario." : "Probá con otro día de la semana o elegí una fecha."}</div>`}
                ${filtrados}${todoDia}
            </div>`;
        enlazarAcciones(cuerpo);
        return;
    }

    // ---- Planificador, todos los docentes: agrupado por docente + ocupación de la escuela
    const grupos = objetivos.map(o => {
        const s = semanas[o.calendario];
        const clases = s ? delDia(s.clases, d).filter(enFranja) : [];
        return { o, s, clases };
    });
    const total = grupos.reduce((n, g) => n + g.clases.length, 0);
    const conClases = grupos.filter(g => g.clases.length).length;
    const sinCal = grupos.filter(g => !g.o.calendario).length;
    const conError = grupos.filter(g => g.s && g.s.error).length;

    const htmlGrupos = grupos
        // El docente ve su grupo primero; después, los que tienen clases
        .sort((a, b) => (esMio(b.o) - esMio(a.o)) || (b.clases.length > 0) - (a.clases.length > 0) || a.o.nombre.localeCompare(b.o.nombre, "es"))
        .map((g, i) => {
            let der = "";
            if (!g.o.calendario) der = `<span class="ds-chip">Sin calendario cargado</span>`;
            else if (g.s && g.s.error) der = `<span class="ds-chip bad">Calendario no disponible</span>`;
            return `
            <details class="grupo-doc ${esMio(g.o) ? "mio" : ""}" ${(i === 0 && g.clases.length) || (esMio(g.o) && g.clases.length) ? "open" : ""}>
                <summary><span class="dot" style="background:${g.o.color}"></span><b>${esc(g.o.nombre)}</b>${esMio(g.o) ? `<span class="ds-chip teal">Vos</span>` : ""}
                <span class="cnt">${g.clases.length ? plural(g.clases.length, "clase", "clases") : "Sin clases"}</span>
                <span class="der">${der}${icono("i-chev", "chev")}</span></summary>
                ${g.clases.length ? listaConAhora(g.clases, { corto: true, conAcciones: puede(g.o), docente: g.o }) : ""}
            </details>`;
        }).join("");

    cuerpo.innerHTML = `
        <div class="grid-plan">
            <div class="card">
                <div class="card-head"><h3>${icono("i-cal")} ${tituloDia(d)} · ${plural(total, "clase", "clases")} · ${plural(conClases, "docente", "docentes")}</h3>
                <span class="sub">${[sinCal ? plural(sinCal, "sin calendario", "sin calendario") : "", conError ? plural(conError, "calendario no disponible", "calendarios no disponibles") : ""].filter(Boolean).join(" · ")}</span></div>
                ${htmlGrupos}
            </div>
            ${panelOcupacion(semanas, d, config)}
        </div>`;
    enlazarAcciones(cuerpo);
}

/* ---------------------------------------------------------------- ocupación de la escuela */
function panelOcupacion(semanas, d, config) {
    // Todos los eventos del día de todos los calendarios leídos, menos los excluidos (criterio de Admisión).
    const excluidos = new Set(CALENDARIOS_EXCLUIDOS_AULAS);
    const vistos = new Set();
    const eventos = [];
    Object.entries(semanas).forEach(([cal, s]) => {
        if (excluidos.has(cal) || !s || s.error) return;
        delDia(s.clases, d).forEach(c => {
            if (c.anulada) return; // v0.4: una clase con ❌ (suplencia confirmada) ya no ocupa aula; la ocupa la del suplente
            const k = `${c.titulo}|${c.inicio.getTime()}|${c.fin.getTime()}`; // el mismo evento invitado en dos calendarios cuenta una vez
            if (vistos.has(k)) return;
            vistos.add(k);
            eventos.push(c);
        });
    });
    // Pico de simultáneos en cada hora (revisando cada 15 min)
    const filas = [];
    for (let h = 8; h < 23; h++) {
        let aulas = 0, bat = 0;
        for (let m = 0; m < 60; m += 15) {
            const t = new Date(d); t.setHours(h, m + 1, 0, 0);
            const act = eventos.filter(e => e.inicio <= t && e.fin > t);
            aulas = Math.max(aulas, act.length);
            bat = Math.max(bat, act.filter(e => e.bateria).length);
        }
        filas.push({ h, aulas, bat });
    }
    const usadas = filas.filter(f => f.aulas || f.bat);
    const desde = usadas.length ? Math.max(8, usadas[0].h - 1) : 9;
    const hasta = usadas.length ? Math.min(22, usadas[usadas.length - 1].h + 1) : 21;
    const barra = (n, max, cls) => `<div class="barra ${cls}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? (n > max ? "f" : "o") : ""}"></i>`).join("")}</div>`;
    const html = filas.filter(f => f.h >= desde && f.h <= hasta).map(f => `
        <div class="ocup-fila"><span>${String(f.h).padStart(2, "0")}:00</span>${barra(f.aulas, config.aulas, "")}${barra(f.bat, config.baterias, "bat")}</div>`).join("");
    return `
        <div class="card">
            <div class="card-head"><h3>Ocupación de la escuela</h3></div>
            <div class="ocup">
                <div class="ocup-head"><span>Hora</span><span>Aulas (${config.aulas})</span><span>Baterías (${config.baterias})</span></div>
                ${html}
                <div class="leyenda"><span><i style="background:var(--teal-100)"></i>Aula ocupada</span><span><i style="background:#e7dcf3"></i>Batería ocupada</span><span><i style="background:var(--bad);opacity:.75"></i>Más de las disponibles</span></div>
            </div>
        </div>`;
}

export function enlazarAcciones(cuerpo) {
    cuerpo.querySelectorAll("[data-accion]").forEach(b => b.onclick = () => {
        const acc = b.dataset.accion;
        const reg = b.dataset.clave ? enPantalla.get(b.dataset.clave) : null;
        if (acc === "suplente" && reg) return abrirBuscarSuplente({ clase: reg.clase, docente: reg.docente });
        if (acc === "gestion") { location.hash = "#suplencias"; return; }
        if (acc === "aceptó") {
            const m = suplenciasActuales().find(x => x.id === b.dataset.mov);
            if (m) abrirConfirmar(m);
            return;
        }
        if (acc === "recuperar" && ctxActual && typeof ctxActual.toast === "function") ctxActual.toast("Recuperar se habilita en una próxima versión.");
    });
}

/* Después de una suplencia: vuelve a leer la semana visible y repinta la agenda (si está abierta) */
export function refrescarAgenda() {
    if (!estado.sel) return;
    const l = diaISO(lunesDe(estado.sel));
    [...estado.cache.keys()].filter(k => k.endsWith(`|${l}`)).forEach(k => estado.cache.delete(k));
    const cont = document.getElementById("vista");
    if (location.hash === "#agenda" && cont && ctxActual) renderAgenda(cont, ctxActual);
}

/* ---------------------------------------------------------------- para Inicio */
export async function clasesDeHoy(perfil) {
    const config = await leerConfiguracion();
    const cal = await calendarioDeProfesor(perfil.profesorId);
    if (!cal) return { sinCalendario: true, clases: [] };
    const s = await semanaDe(cal, lunesDe(new Date()), config);
    if (s.error) return { error: s.error, clases: [] };
    return { clases: delDia(s.clases, new Date()), calendario: cal, docente: { profesorId: perfil.profesorId, nombre: perfil.nombre, email: perfil.email, calendario: cal } };
}

export { filaClase };
