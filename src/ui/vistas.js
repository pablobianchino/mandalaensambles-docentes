// =======================================================================
// src/ui/vistas.js — Pantallas del Portal Docentes
// v0.1 (etapa 1): Inicio con la estructura aprobada y las demás secciones "en preparación".
// Los datos reales (calendario, gestiones, avisos) llegan en las etapas 3 a 7 del plan.
// =======================================================================

import { esc } from "./util.js";
import { clasesDeHoy, filaClase, enlazarAcciones } from "./agenda.js";
export { esc };

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fechaLarga(d = new Date()) {
    const dia = DIAS[d.getDay()];
    return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

function icono(id, cls = "") {
    return `<svg class="i ${cls}"><use href="#${id}"/></svg>`;
}

/* Secciones del menú: título según la vista y etapa del plan en la que se habilitan */
export const SECCIONES = {
    inicio: { icono: "i-home" },
    agenda: { icono: "i-cal", docente: "Mi agenda", planificador: "Agenda de docentes" },
    suplencias: { icono: "i-swap", docente: "Suplencias", planificador: "Suplencias" },
    recuperos: { icono: "i-move", docente: "Recuperos", planificador: "Recuperos", etapa: 5, texto: "Buscás horarios libres de la escuela para recuperar una clase y enviás las opciones a los alumnos." },
    avisos: { icono: "i-alert", docente: "Avisos de festivales", planificador: "Avisos de festivales", etapa: 6, texto: "Clases que caen el día de un festival en el que estás asignado, para resolverlas con una suplencia o un recupero." },
    alumnos: { icono: "i-users", docente: "Mis alumnos y ensambles", planificador: "Alumnos y ensambles", etapa: 7, texto: "Tus grupos, ensambles y alumnos individuales (hoy en Admisión)." },
    solicitudes: { icono: "i-doc", docente: "Solicitudes de vacantes", planificador: "Solicitudes de vacantes", etapa: 7, texto: "Pedidos de alumnos para tus grupos. Coordinación los sigue viendo en el Match de Admisión." }
};

export function tituloSeccion(ruta, vista) {
    const s = SECCIONES[ruta];
    return s ? (s[vista] || s.docente || "") : "";
}

function kpi(clase, iconoId, etiqueta, ruta, detalle, id = "") {
    return `<button type="button" class="kpi ${clase}" data-ir="${ruta}">
        <div class="lb">${icono(iconoId, "sm")} ${esc(etiqueta)}</div>
        <div class="n vacio" ${id ? `id="${id}"` : ""}>—</div>
        <div class="d" ${id ? `id="${id}-d"` : ""}>${esc(detalle)}</div>
    </button>`;
}

/* Clases de hoy del docente (Inicio): número de la tarjeta y lista */
async function cargarClasesDeHoy(cont, perfil) {
    const lista = cont.querySelector("#inicio-clases");
    const num = cont.querySelector("#kpi-hoy");
    const det = cont.querySelector("#kpi-hoy-d");
    let r;
    try { r = await clasesDeHoy(perfil); } catch (e) { r = { error: e.message, clases: [] }; }
    if (!lista || !lista.isConnected) return;
    if (r.sinCalendario || r.error) {
        lista.innerHTML = `<div class="ds-empty"><b>${r.sinCalendario ? "Sin calendario cargado" : "No se pudo leer tu calendario"}</b>${r.sinCalendario ? "Pedile a Coordinación que lo cargue en Admisión." : "Abrí Mi agenda para reintentar."}</div>`;
        return;
    }
    const ahora = new Date();
    const proximas = r.clases.filter(c => c.fin > ahora);
    num.textContent = String(r.clases.length);
    num.classList.remove("vacio");
    det.textContent = proximas.length ? `Próxima: ${String(proximas[0].inicio.getHours()).padStart(2, "0")}:${String(proximas[0].inicio.getMinutes()).padStart(2, "0")}` : (r.clases.length ? "Ya terminaron todas" : "Hoy no tenés clases");
    lista.innerHTML = r.clases.length
        ? r.clases.map(c => filaClase(c, { corto: true, docente: r.docente })).join("")
        : `<div class="ds-empty"><b>Hoy no tenés clases</b>Mirá otros días en Mi agenda.</div>`;
    enlazarAcciones(lista);
}

/* ---------------------------------------------------------------- INICIO */
export function renderInicio(cont, { perfil, vista }) {
    const esPlanif = vista === "planificador";
    const nombreCorto = String(perfil.nombre || "").split(" ")[0] || perfil.nombre;
    const titulo = esPlanif ? "Planificación de clases" : `Hola, ${esc(nombreCorto)}`;
    const subtitulo = esPlanif ? `${fechaLarga()} · todos los docentes` : `${fechaLarga()} · tus clases y gestiones del día`;

    // Docente sin ficha de docente vinculada: no se puede leer su calendario
    const avisoSinFicha = (!esPlanif && !perfil.profesorId) ? `
        <div class="aviso">
            ${icono("i-alert")}
            <div><b>Tu usuario no tiene un perfil docente vinculado</b>
            <p>Sin el perfil docente no se puede leer tu calendario de Google. Pedile a Coordinación que lo complete en Admisión.</p></div>
        </div>` : "";

    cont.innerHTML = `
        <div class="page-head">
            <div><h1>${titulo}</h1><p>${esc(subtitulo)}</p></div>
        </div>
        ${avisoSinFicha}
        <div class="aviso info">
            ${icono("i-tool")}
            <div><b>Portal en construcción</b>
            <p>Ya funcionan la agenda y las suplencias. Los recuperos y los avisos de festivales se suman en las próximas versiones.</p></div>
        </div>
        <div class="kpis">
            ${kpi("teal", "i-cal", "Clases hoy", "agenda", esPlanif ? "Mirá la Agenda de docentes" : "De tu calendario", esPlanif ? "" : "kpi-hoy")}
            ${kpi("warn", "i-swap", "Suplencias", "suplencias", "Pendientes de confirmar", "kpi-sup")}
            ${kpi("warn", "i-move", "Recuperos", "recuperos", "Esperando a los alumnos")}
            ${kpi("bad", "i-alert", "Avisos", "avisos", "Clases sin resolver")}
        </div>
        <div class="grid2">
            <div class="card">
                <div class="card-head"><h3>${icono("i-cal")} ${esPlanif ? "Clases que chocan con festivales" : "Tus clases de hoy"}</h3>${esPlanif ? "" : `<button type="button" class="ds-btn ds-btn-ghost sm" data-ir="agenda">Ver otro día</button>`}</div>
                ${esPlanif
                    ? `<div class="ds-empty"><b>Disponible pronto</b>Acá vas a ver las clases de los docentes que caen el día de un festival.</div>`
                    : (perfil.profesorId
                        ? `<div id="inicio-clases"><div class="skel"></div><div class="skel ultimo"></div></div>`
                        : `<div class="ds-empty"><b>Sin perfil docente vinculado</b>No se puede leer tu calendario.</div>`)}
            </div>
            <div class="col">
                <div class="card">
                    <div class="card-head"><h3>Gestiones en curso</h3></div>
                    <div class="ds-empty"><b>Sin gestiones</b>Las suplencias y recuperos que pidas van a aparecer acá.</div>
                </div>
                <div class="card">
                    <div class="card-head"><h3>Solicitudes de vacantes</h3></div>
                    <div class="ds-empty"><b>Disponible pronto</b>Mientras tanto, seguí cargándolas en Admisión.</div>
                </div>
            </div>
        </div>`;
    if (!esPlanif && perfil.profesorId) cargarClasesDeHoy(cont, perfil);
}

/* ---------------------------------------------------------------- SECCIÓN EN PREPARACIÓN */
export function renderProximamente(cont, { ruta, vista }) {
    const s = SECCIONES[ruta] || {};
    cont.innerHTML = `
        <div class="page-head"><div><h1>${esc(tituloSeccion(ruta, vista))}</h1></div></div>
        <div class="proximamente">
            ${icono(s.icono || "i-tool")}
            <b>Esta sección está en preparación</b>
            <div>${esc(s.texto || "")}</div>
        </div>`;
}
