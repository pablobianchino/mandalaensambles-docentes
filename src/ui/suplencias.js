// =======================================================================
// src/ui/suplencias.js — Ventana "Buscar suplente" (3 pasos) y sección Suplencias (v0.4)
// Diseño aprobado: mockup_03_suplencias.html (26/11/2026).
// =======================================================================

import { esc } from "./util.js";
import { leerEventos } from "../services/calendario.js";
import { listarDocentes, dentroDeDisponibilidad, leerPlantillas, completarPlantilla } from "../services/docentes.js";
import { crearPendiente, cambiarSuplente, cancelar, confirmar, deshacer, revisarAntesDeConfirmar, escucharSuplencias, suplenciasActuales } from "../services/suplencias.js";

const DL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DC = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MC = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const icono = (id, cls = "") => `<svg class="i ${cls}"><use href="#${id}"/></svg>`;
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const diaLargo = (d) => `${DL[d.getDay()].charAt(0).toUpperCase()}${DL[d.getDay()].slice(1)}`;
const fechaCorta = (d) => `${d.getDate()}/${d.getMonth() + 1}`;
const fechaLarga = (d) => `${d.getDate()} de ${MS[d.getMonth()]}`;
const iniciales = (n) => String(n || "").split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("") || "?";
const primerNombre = (n) => String(n || "").trim().split(/\s+/)[0] || n;

let ctxApp = null; // { perfil, vista, toast, refrescar }
export function configurarSuplencias(ctx) { ctxApp = ctx; }

/* ---------------------------------------------------------------- ventana base */
function abrirVentana(html) {
    cerrarVentana();
    const ov = document.createElement("div");
    ov.className = "ds-overlay sup-overlay";
    ov.id = "sup-overlay";
    ov.innerHTML = `<div class="sup-modal" role="dialog" aria-modal="true">${html}</div>`;
    ov.addEventListener("click", (e) => { if (e.target === ov) cerrarVentana(); });
    document.body.appendChild(ov);
    document.addEventListener("keydown", escCierra);
    return ov.querySelector(".sup-modal");
}
function escCierra(e) { if (e.key === "Escape") cerrarVentana(); }
export function cerrarVentana() {
    document.getElementById("sup-overlay")?.remove();
    document.removeEventListener("keydown", escCierra);
}
const pasos = (n) => `
    <div class="pasos">${[1, 2, 3].map(i => `<div class="paso ${i <= n ? "on" : ""}"></div>`).join("")}</div>
    <div class="pasos-txt"><span class="${n === 1 ? "on" : ""}">1. Elegí quién cubre</span><span class="${n === 2 ? "on" : ""}">2. Mensaje</span><span class="${n === 3 ? "on" : ""}">3. Confirmación</span></div>`;
const cabecera = (titulo, ic, n) => `
    <div class="sup-head">
        <div class="top"><h3>${icono(ic)} ${titulo}</h3><button type="button" class="cerrar" data-cerrar aria-label="Cerrar">×</button></div>
        ${n ? pasos(n) : ""}
    </div>`;
function enlazarCerrar(m) { m.querySelectorAll("[data-cerrar]").forEach(b => b.onclick = cerrarVentana); }

/* Confirmación con el diseño de la app (en lugar del confirm() del navegador) */
function preguntar(titulo, texto, boton, peligro = false) {
    return new Promise(resolve => {
        const m = abrirVentana(`
            ${cabecera(titulo, "i-alert", 0)}
            <div class="sup-body"><p class="sup-p">${texto}</p></div>
            <div class="sup-foot"><button type="button" class="ds-btn ds-btn-secondary" id="pr-no">Volver</button><button type="button" class="ds-btn ${peligro ? "ds-btn-danger" : "ds-btn-primary"}" id="pr-si">${boton}</button></div>`);
        const fin = (v) => { cerrarVentana(); resolve(v); };
        m.querySelector("#pr-no").onclick = () => fin(false);
        m.querySelector("#pr-si").onclick = () => fin(true);
        m.querySelector("[data-cerrar]").onclick = () => fin(false);
    });
}

function cajaClase(c, extra = "") {
    const ini = c.inicio instanceof Date ? c.inicio : new Date(c.inicio);
    return `<div class="clase-box"><div class="hora">${hhmm(ini)}<small>${c.duracionMin} min</small></div>
        <div><b>${esc(c.titulo)}</b><span>${diaLargo(ini)} ${fechaLarga(ini)}${extra}</span></div></div>`;
}

function datosMensaje(clase, docente, suplente) {
    const ini = new Date(clase.inicio), fin = new Date(clase.fin);
    return {
        suplente: primerNombre(suplente.nombre), docente: primerNombre(docente.nombre),
        dia: diaLargo(ini), fecha: fechaLarga(ini), hora_inicio: hhmm(ini), hora_fin: hhmm(fin),
        duracion: clase.duracionMin, clase: clase.titulo
    };
}

async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; }
    catch (e) {
        const t = document.createElement("textarea"); t.value = texto; document.body.appendChild(t); t.select();
        let ok = false; try { ok = document.execCommand("copy"); } catch (e2) { /* sin portapapeles */ }
        t.remove(); return ok;
    }
}

/* ================================================================ PASO 1: elegir suplente
   clase: objeto de la agenda (inicio/fin Date, id, calendarioId, titulo…); docente: a quién se reemplaza.
   movId: si viene, es "No puede · buscar otro" de una suplencia pendiente. */
export async function abrirBuscarSuplente({ clase, docente, movId = null }) {
    const m = abrirVentana(`
        ${cabecera("Buscar suplente", "i-swap", 1)}
        <div class="sup-body">
            ${cajaClase(clase, `${clase.recurrente === true ? ` · ${icono("i-repeat", "sm")} serie: solo cambia la clase de este día` : ""}${docente.profesorId !== ctxApp.perfil.profesorId ? ` · de <b>${esc(docente.nombre)}</b>` : ""}`)}
            <div class="buscar-row">
                <div class="buscar-in">${icono("i-search", "sm")}<input class="ds-input" id="sup-buscar" placeholder="Buscar docente…" autocomplete="off"></div>
                <label class="check"><input type="checkbox" id="sup-solo-libres"> Solo libres</label>
            </div>
            <div id="sup-lista"><div class="skel"></div><div class="skel"></div><div class="skel ultimo"></div></div>
        </div>
        <div class="sup-foot"><button type="button" class="ds-btn ds-btn-secondary" data-cerrar>Cancelar</button><button type="button" class="ds-btn ds-btn-primary" id="sup-seguir" disabled>Elegí un docente</button></div>`);
    enlazarCerrar(m);

    // Docentes y su agenda de ese día (para saber quién está libre)
    let docentes = [];
    try { docentes = (await listarDocentes()).filter(d => d.profesorId !== docente.profesorId); } catch (e) { console.warn(e); }
    const ini = clase.inicio, fin = clase.fin;
    const desde = new Date(ini); desde.setHours(0, 0, 0, 0);
    const hasta = new Date(ini); hasta.setHours(23, 59, 59, 0);
    const estados = {};
    for (let i = 0; i < docentes.length; i += 4) {
        await Promise.all(docentes.slice(i, i + 4).map(async d => {
            if (!d.calendario) { estados[d.profesorId] = { tipo: "sin" }; return; }
            try {
                const { clases } = await leerEventos(d.calendario, desde, hasta);
                const choque = clases.find(c => !c.anulada && c.inicio < fin && c.fin > ini);
                const pegada = clases.find(c => !c.anulada && (Math.abs(c.fin - ini) < 6e4 || Math.abs(c.inicio - fin) < 6e4));
                estados[d.profesorId] = choque ? { tipo: "ocupado", ev: choque } : { tipo: "libre", pegada };
            } catch (e) { estados[d.profesorId] = { tipo: "error" }; }
        }));
    }
    if (!document.body.contains(m)) return;

    let elegido = null;
    const lista = m.querySelector("#sup-lista");
    const pintar = () => {
        const q = m.querySelector("#sup-buscar").value.trim().toLowerCase();
        const soloLibres = m.querySelector("#sup-solo-libres").checked;
        const vis = docentes.filter(d => !q || d.nombre.toLowerCase().includes(q));
        const fila = (d) => {
            const e = estados[d.profesorId] || { tipo: "error" };
            const disp = dentroDeDisponibilidad(d, ini, fin);
            let det = "", chip = "";
            if (e.tipo === "libre") { chip = disp === false ? `<span class="ds-chip info">Fuera de horario</span>` : `<span class="ds-chip ok">Libre</span>`; det = `Libre a esa hora${e.pegada ? ` · tiene "${esc(e.pegada.titulo)}" pegada` : ""}${disp === false ? " · fuera de su disponibilidad declarada" : disp === true ? " · dentro de su disponibilidad" : ""}`; }
            else if (e.tipo === "ocupado") { chip = `<span class="ds-chip warn">Ocupado</span>`; det = `Tiene "${esc(e.ev.titulo)}" de ${hhmm(e.ev.inicio)} a ${hhmm(e.ev.fin)}`; }
            else if (e.tipo === "sin") { chip = `<span class="ds-chip">Sin datos</span>`; det = "No tiene calendario cargado: no se sabe si está libre y no se le puede crear la clase"; }
            else { chip = `<span class="ds-chip">Sin datos</span>`; det = "No se pudo leer su calendario"; }
            return `<button type="button" class="doc ${elegido === d.profesorId ? "on" : ""}" data-id="${esc(d.profesorId)}">
                <span class="av" style="background:${d.color}">${esc(iniciales(d.nombre))}</span>
                <span class="tx"><b>${esc(d.nombre)}</b><span>${det}</span></span>${chip}<span class="radio"></span></button>`;
        };
        const libres = vis.filter(d => estados[d.profesorId]?.tipo === "libre");
        const ocupados = vis.filter(d => estados[d.profesorId]?.tipo === "ocupado");
        const sinDatos = vis.filter(d => !["libre", "ocupado"].includes(estados[d.profesorId]?.tipo));
        let html = `<div class="grupo-tit">Libres a esa hora · ${libres.length}</div>` + (libres.map(fila).join("") || `<div class="md-vacio">Nadie libre a esa hora.</div>`);
        if (!soloLibres) {
            if (ocupados.length) html += `<div class="grupo-tit">Ocupados a esa hora · ${ocupados.length} (se pueden elegir igual)</div>` + ocupados.map(fila).join("");
            if (sinDatos.length) html += `<div class="grupo-tit">Sin datos · ${sinDatos.length}</div>` + sinDatos.map(fila).join("");
        }
        lista.innerHTML = html;
        lista.querySelectorAll(".doc").forEach(b => b.onclick = () => {
            elegido = b.dataset.id;
            const d = docentes.find(x => x.profesorId === elegido);
            const btn = m.querySelector("#sup-seguir");
            btn.disabled = false; btn.textContent = `Seguir con ${primerNombre(d.nombre)} →`;
            pintar();
        });
    };
    m.querySelector("#sup-buscar").oninput = pintar;
    m.querySelector("#sup-solo-libres").onchange = pintar;
    pintar();
    m.querySelector("#sup-seguir").onclick = () => {
        const d = docentes.find(x => x.profesorId === elegido);
        if (d) abrirMensaje({ clase, docente, suplente: d, movId });
    };
}

/* ================================================================ PASO 2: mensaje */
async function abrirMensaje({ clase, docente, suplente, movId }) {
    const plantillas = await leerPlantillas();
    const texto = completarPlantilla(plantillas.mensaje_suplente, datosMensaje({ inicio: clase.inicio, fin: clase.fin, duracionMin: clase.duracionMin, titulo: clase.titulo }, docente, suplente));
    const m = abrirVentana(`
        ${cabecera("Buscar suplente", "i-swap", 2)}
        <div class="sup-body">
            <div class="clase-box"><span class="av" style="background:${suplente.color}">${esc(iniciales(suplente.nombre))}</span>
                <div><b>Le pedís a ${esc(primerNombre(suplente.nombre))} que cubra ${docente.profesorId === ctxApp.perfil.profesorId ? "tu clase" : `la clase de ${esc(docente.nombre)}`}</b>
                <span>${esc(clase.titulo)} · ${diaLargo(clase.inicio).toLowerCase()} ${fechaCorta(clase.inicio)} · ${hhmm(clase.inicio)} a ${hhmm(clase.fin)}</span></div></div>
            <div class="lbl-mini">Mensaje para ${esc(primerNombre(suplente.nombre))} (lo podés editar)</div>
            <textarea class="ds-textarea" id="sup-texto">${esc(texto)}</textarea>
            <div class="aviso info">${icono("i-msg")}<div><b>Se copia al portapapeles</b><p>Pegalo en WhatsApp. La suplencia queda <b>pendiente</b> hasta que marques que ${esc(primerNombre(suplente.nombre))} aceptó. El calendario no cambia todavía.</p></div></div>
        </div>
        <div class="sup-foot"><button type="button" class="ds-btn ds-btn-secondary" id="sup-atras">${icono("i-left", "sm")} Elegir otro</button><button type="button" class="ds-btn ds-btn-primary" id="sup-copiar">${icono("i-copy", "sm")} Copiar mensaje y dejar pendiente</button></div>`);
    enlazarCerrar(m);
    m.querySelector("#sup-atras").onclick = () => abrirBuscarSuplente({ clase, docente, movId });
    m.querySelector("#sup-copiar").onclick = async (e) => {
        const btn = e.currentTarget; btn.disabled = true; btn.textContent = "Guardando…";
        const msg = m.querySelector("#sup-texto").value;
        const copiado = await copiar(msg);
        try {
            if (movId) await cambiarSuplente(movId, suplente, ctxApp.perfil, msg);
            else await crearPendiente({ clase, docente, suplente, perfil: ctxApp.perfil, mensaje: msg });
            cerrarVentana();
            ctxApp.toast(copiado ? "Mensaje copiado. La suplencia quedó pendiente." : "La suplencia quedó pendiente (no se pudo copiar: copialo desde Suplencias).");
            ctxApp.refrescar?.();
        } catch (err) {
            btn.disabled = false; btn.textContent = "Copiar mensaje y dejar pendiente";
            ctxApp.toast("No se pudo guardar: " + (err.message || err.code || err));
        }
    };
}

/* ================================================================ PASO 3: confirmar (el suplente aceptó) */
export async function abrirConfirmar(mov) {
    const ini = new Date(mov.clase.inicio), fin = new Date(mov.clase.fin);
    const esMio = mov.docente.profesorId === ctxApp.perfil.profesorId;
    const m = abrirVentana(`
        ${cabecera("Confirmar la suplencia", "i-check", 3)}
        <div class="sup-body">
            <p class="sup-p">${esc(primerNombre(mov.suplente.nombre))} cubre ${esMio ? "tu clase" : `la clase de ${esc(mov.docente.nombre)}`} del <b>${diaLargo(ini).toLowerCase()} ${fechaCorta(ini)} de ${hhmm(ini)} a ${hhmm(fin)}</b>. Al confirmar, se cambian los calendarios así:</p>
            <div class="cal-cambio">
                <div class="fila"><div class="q">${esMio ? "Tu calendario" : `Calendario de ${esc(primerNombre(mov.docente.nombre))}`}</div><div><div class="antes">${esc(mov.clase.titulo)}</div><div class="despues">❌ ${esc(mov.clase.titulo)}</div><div class="nota">Solo la clase de este día. ${mov.clase.recurrente === true ? "El resto de la serie no se toca." : ""}</div></div></div>
                <div class="fila"><div class="q">Calendario de ${esc(primerNombre(mov.suplente.nombre))}</div><div><div class="despues">Suplencia de ${esc(mov.docente.nombre)} · ${esc(mov.clase.titulo)}</div><div class="nota">Clase nueva, ${diaLargo(ini).toLowerCase()} ${fechaCorta(ini)} de ${hhmm(ini)} a ${hhmm(fin)}.</div></div></div>
            </div>
            <div id="sup-revision"><div class="aviso">${icono("i-refresh")}<div><b>Revisando los calendarios…</b><p>Que la clase siga en ese horario y si ${esc(primerNombre(mov.suplente.nombre))} tiene algo cargado a esa hora.</p></div></div></div>
            <label class="check"><input type="checkbox" id="sup-aviso-alumnos" checked> Después, copiar un aviso para los alumnos</label>
        </div>
        <div class="sup-foot"><button type="button" class="ds-btn ds-btn-secondary" data-cerrar>Volver</button><button type="button" class="ds-btn ds-btn-primary" id="sup-confirmar" disabled>${icono("i-check", "sm")} Confirmar y cambiar calendarios</button></div>`);
    enlazarCerrar(m);
    const caja = m.querySelector("#sup-revision");
    const btn = m.querySelector("#sup-confirmar");
    try {
        if (!mov.suplente.calendario) throw new Error(`${mov.suplente.nombre} no tiene un calendario cargado: no se le puede crear la clase. Pedile a Coordinación que lo cargue en Admisión, o elegí otro suplente.`);
        const { choques } = await revisarAntesDeConfirmar(mov);
        caja.innerHTML = choques.length
            ? `<div class="aviso warn">${icono("i-alert")}<div><b>${esc(primerNombre(mov.suplente.nombre))} tiene algo cargado a esa hora</b><p>${choques.map(c => `"${esc(c.titulo)}" de ${hhmm(c.inicio)} a ${hhmm(c.fin)}`).join(" · ")}. Si igual aceptó, podés confirmar.</p></div></div>`
            : `<div class="aviso ok">${icono("i-check")}<div><b>Todo en orden</b><p>La clase sigue en ese horario y ${esc(primerNombre(mov.suplente.nombre))} no tiene nada cargado a esa hora.</p></div></div>`;
        btn.disabled = false;
    } catch (e) {
        caja.innerHTML = `<div class="aviso bad">${icono("i-alert")}<div><b>No se puede confirmar</b><p>${esc(e.message)}</p></div></div>`;
        return;
    }
    btn.onclick = async () => {
        btn.disabled = true; btn.textContent = "Cambiando calendarios…";
        const conAviso = m.querySelector("#sup-aviso-alumnos").checked;
        try {
            await confirmar(mov.id, ctxApp.perfil);
            let aviso = "";
            if (conAviso) {
                const pl = await leerPlantillas();
                aviso = completarPlantilla(pl.aviso_alumnos_suplencia, datosMensaje(mov.clase, mov.docente, mov.suplente));
                await copiar(aviso);
            }
            abrirListo(mov, aviso);
            ctxApp.refrescar?.();
        } catch (e) {
            caja.innerHTML = `<div class="aviso bad">${icono("i-alert")}<div><b>No se pudo confirmar</b><p>${esc(e.message)}</p></div></div>`;
            btn.textContent = "Confirmar y cambiar calendarios";
        }
    };
}

function abrirListo(mov, aviso) {
    const m = abrirVentana(`
        ${cabecera(`<span style="color:var(--ok)">Suplencia confirmada</span>`, "i-check", 0)}
        <div class="sup-body">
            <div class="aviso ok">${icono("i-check")}<div><b>Listo: los calendarios ya están actualizados</b><p>La clase quedó como "❌ ${esc(mov.clase.titulo)}" y ${esc(primerNombre(mov.suplente.nombre))} la tiene en su calendario.</p></div></div>
            ${aviso ? `<div class="lbl-mini">Aviso para los alumnos (copiado al portapapeles)</div><textarea class="ds-textarea corto" id="sup-aviso">${esc(aviso)}</textarea>` : ""}
        </div>
        <div class="sup-foot">${aviso ? `<button type="button" class="ds-btn ds-btn-secondary" id="sup-recopiar">${icono("i-copy", "sm")} Copiar de nuevo</button>` : "<span></span>"}<button type="button" class="ds-btn ds-btn-primary" data-cerrar>Listo</button></div>`);
    enlazarCerrar(m);
    m.querySelector("#sup-recopiar")?.addEventListener("click", async () => { await copiar(m.querySelector("#sup-aviso").value); ctxApp.toast("Aviso copiado"); });
}

/* ================================================================ SECCIÓN SUPLENCIAS */
let pestana = "pendiente";

/* Las que le importan a la vista actual */
export function suplenciasVisibles(perfil, vista) {
    const todas = suplenciasActuales();
    if (vista === "planificador") return { mias: todas, meCubren: [] };
    const yo = perfil.profesorId;
    return {
        mias: todas.filter(m => m.docente?.profesorId === yo),
        meCubren: todas.filter(m => m.suplente?.profesorId === yo && m.estado === "pendiente")
    };
}
export function pendientesParaContador(perfil, vista) {
    return suplenciasVisibles(perfil, vista).mias.filter(m => m.estado === "pendiente").length;
}

export function renderSuplencias(cont, ctx) {
    const esPlanif = ctx.vista === "planificador";
    const pintar = () => {
        if (!cont.isConnected || !cont.querySelector("#sup-seccion")) return;
        const { mias, meCubren } = suplenciasVisibles(ctx.perfil, ctx.vista);
        const por = { pendiente: [], confirmada: [], cancelada: [] };
        mias.forEach(m => (por[m.estado] || por.pendiente).push(m));
        Object.values(por).forEach(l => l.sort((a, b) => pestana === "pendiente" ? a.clase.inicio.localeCompare(b.clase.inicio) : b.clase.inicio.localeCompare(a.clase.inicio)));
        const tabs = [["pendiente", "Pendientes"], ["confirmada", "Confirmadas"], ["cancelada", "Canceladas"]];
        const lista = por[pestana];
        cont.querySelector("#sup-seccion").innerHTML = `
            <div class="tabs-ds">${tabs.map(([k, t]) => `<button type="button" class="tab-ds ${k === pestana ? "on" : ""}" data-tab="${k}">${t}${por[k].length ? ` <span class="c">${por[k].length}</span>` : ""}</button>`).join("")}</div>
            ${lista.length ? lista.map(m => tarjeta(m, ctx)).join("") : `<div class="card"><div class="ds-empty"><b>${pestana === "pendiente" ? "No hay suplencias pendientes" : pestana === "confirmada" ? "Todavía no hay suplencias confirmadas" : "No hay suplencias canceladas"}</b>${pestana === "pendiente" ? "Pedí una desde una clase de la agenda, con \"Buscar suplente\"." : ""}</div></div>`}
            ${!esPlanif && meCubren.length ? `<div class="sec-tit">${icono("i-hand", "sm")} Te pidieron cubrir</div>${meCubren.map(m => tarjeta(m, ctx, true)).join("")}` : ""}`;
        cont.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { pestana = b.dataset.tab; pintar(); });
        cont.querySelectorAll("[data-acc]").forEach(b => b.onclick = () => accion(b.dataset.acc, b.dataset.id, ctx));
    };
    cont.innerHTML = `
        <div class="page-head"><div><h1>Suplencias</h1><p>${esPlanif ? "Todas las suplencias de la escuela. Podés pedirlas y resolverlas en nombre de cualquier docente." : "Las clases que pediste que otro docente cubra, y las que te pidieron cubrir a vos."}</p></div>
            <button type="button" class="ds-btn ds-btn-primary" id="sup-pedir">${icono("i-plus", "sm")} Pedir una suplencia</button></div>
        <div id="sup-seccion"></div>`;
    cont.querySelector("#sup-pedir").onclick = () => {
        location.hash = "#agenda";
        ctx.toast(esPlanif ? "Elegí el docente y la clase, y tocá \"Buscar suplente\"." : "Elegí la clase y tocá \"Buscar suplente\".");
    };
    escucharSuplencias(() => pintar());
    pintar();
}

function tarjeta(m, ctx, meCubren = false) {
    const ini = new Date(m.clase.inicio), fin = new Date(m.clase.fin);
    const esPlanif = ctx.vista === "planificador";
    const futura = fin > new Date();
    let estadoChip = "", acciones = "";
    if (meCubren) {
        estadoChip = `<span class="ds-chip warn">${esc(primerNombre(m.docente.nombre))} espera tu respuesta</span>`;
        acciones = `<span class="nota-acc">Lo confirma ${esc(primerNombre(m.docente.nombre))} en el portal cuando le respondas.</span>`;
    } else if (m.estado === "pendiente") {
        estadoChip = `<span class="ds-chip warn">${icono("i-clock", "sm")} Esperando respuesta de ${esc(primerNombre(m.suplente.nombre))}</span>`;
        acciones = `
            <button type="button" class="ds-btn ds-btn-primary sm" data-acc="aceptó" data-id="${m.id}">${icono("i-check", "sm")} ${esc(primerNombre(m.suplente.nombre))} aceptó</button>
            <button type="button" class="ds-btn ds-btn-secondary sm" data-acc="otro" data-id="${m.id}">${icono("i-swap", "sm")} No puede · buscar otro</button>
            <button type="button" class="ds-btn ds-btn-ghost sm" data-acc="copiar" data-id="${m.id}">${icono("i-copy", "sm")} Copiar mensaje</button>
            <button type="button" class="ds-btn ds-btn-danger-ghost sm" data-acc="cancelar" data-id="${m.id}">Cancelar pedido</button>`;
    } else if (m.estado === "confirmada") {
        estadoChip = `<span class="ds-chip ok">${icono("i-check", "sm")} La da ${esc(primerNombre(m.suplente.nombre))}</span>`;
        acciones = futura ? `<button type="button" class="ds-btn ds-btn-ghost sm" data-acc="deshacer" data-id="${m.id}">Deshacer</button>` : "";
    } else {
        estadoChip = `<span class="ds-chip">${m.deshechaEn ? "Deshecha" : "Cancelada"}</span>`;
    }
    const ult = (m.historial || []).slice(-1)[0];
    const intentos = (m.intentos || []).length ? ` · No pudieron: ${m.intentos.map(i => esc(primerNombre(i.suplente?.nombre))).join(", ")}` : "";
    return `<div class="card"><div class="gestion">
        <div class="fecha"><div class="dn">${DC[ini.getDay()]}</div><div class="dd">${ini.getDate()}</div><div class="mm">${MC[ini.getMonth()]}</div></div>
        <div class="tx">
            <b>${esc(m.clase.titulo)}</b>
            <div class="lin">${icono("i-clock", "sm")} ${hhmm(ini)} a ${hhmm(fin)} · ${esPlanif || meCubren ? `${esc(m.docente.nombre)} → ` : "Le pediste a "}<b class="inl">${esc(m.suplente.nombre)}</b></div>
            <div class="lin">${estadoChip}${esPlanif ? `<span class="tenue">Pedida por ${esc(m.pedidaPor?.nombre || "")}${m.enNombreDe ? ` en nombre de ${esc(primerNombre(m.docente.nombre))}` : ""}</span>` : ""}</div>
            ${ult ? `<div class="linea-tiempo">${esc(ult.texto)} · ${new Date(ult.fecha).toLocaleString("es-AR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}${intentos}</div>` : ""}
        </div>
        <div class="acc">${acciones}</div>
    </div></div>`;
}

async function accion(acc, id, ctx) {
    const m = suplenciasActuales().find(x => x.id === id);
    if (!m) return;
    if (acc === "aceptó") return abrirConfirmar(m);
    if (acc === "copiar") { await copiar(m.mensaje || ""); return ctx.toast("Mensaje copiado"); }
    if (acc === "otro") {
        const clase = { ...m.clase, id: m.clase.eventId, inicio: new Date(m.clase.inicio), fin: new Date(m.clase.fin) };
        const docentes = await listarDocentes();
        const docente = docentes.find(d => d.profesorId === m.docente.profesorId) || m.docente;
        return abrirBuscarSuplente({ clase, docente, movId: m.id });
    }
    if (acc === "cancelar") {
        if (!await preguntar("Cancelar el pedido", `Se cancela el pedido a <b>${esc(m.suplente.nombre)}</b>. Los calendarios no cambian.`, "Cancelar pedido", true)) return;
        try { await cancelar(id, ctx.perfil); ctx.toast("Pedido cancelado"); } catch (e) { ctx.toast(e.message); }
    }
    if (acc === "deshacer") {
        if (!await preguntar("Deshacer la suplencia", `Se le quita el ❌ a la clase original y se borra la clase del calendario de <b>${esc(m.suplente.nombre)}</b>.`, "Deshacer", true)) return;
        try { await deshacer(id, ctx.perfil); ctx.toast("Suplencia deshecha"); ctxApp.refrescar?.(); } catch (e) { ctx.toast("No se pudo deshacer: " + e.message); }
    }
}
