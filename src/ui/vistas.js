// =======================================================================
// src/ui/vistas.js — Pantallas del Portal Docentes
// v0.1 (etapa 1): Inicio con la estructura aprobada y las demás secciones "en preparación".
// Los datos reales (calendario, gestiones, avisos) llegan en las etapas 3 a 7 del plan.
// =======================================================================

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

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
    agenda: { icono: "i-cal", docente: "Mi agenda", planificador: "Agenda de docentes", etapa: 3, texto: "Elegís un día y ves las clases de tu calendario de Google, con las acciones Buscar suplente y Recuperar." },
    suplencias: { icono: "i-swap", docente: "Suplencias", planificador: "Suplencias", etapa: 4, texto: "Pedís que otro docente tome una clase, copiás el mensaje y confirmás cuando acepte." },
    recuperos: { icono: "i-move", docente: "Recuperos", planificador: "Recuperos", etapa: 5, texto: "Buscás horarios libres de la escuela para recuperar una clase y enviás las opciones a los alumnos." },
    avisos: { icono: "i-alert", docente: "Avisos de festivales", planificador: "Avisos de festivales", etapa: 6, texto: "Clases que caen el día de un festival en el que estás asignado, para resolverlas con una suplencia o un recupero." },
    alumnos: { icono: "i-users", docente: "Mis alumnos y ensambles", planificador: "Alumnos y ensambles", etapa: 7, texto: "Tus grupos, ensambles y alumnos individuales (hoy en Admisión)." },
    solicitudes: { icono: "i-doc", docente: "Solicitudes de vacantes", planificador: "Solicitudes de vacantes", etapa: 7, texto: "Pedidos de alumnos para tus grupos. Coordinación los sigue viendo en el Match de Admisión." }
};

export function tituloSeccion(ruta, vista) {
    const s = SECCIONES[ruta];
    return s ? (s[vista] || s.docente || "") : "";
}

function kpi(clase, iconoId, etiqueta, ruta, detalle) {
    return `<button type="button" class="kpi ${clase}" data-ir="${ruta}">
        <div class="lb">${icono(iconoId, "sm")} ${esc(etiqueta)}</div>
        <div class="n vacio">—</div>
        <div class="d">${esc(detalle)}</div>
    </button>`;
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
            <p>Esta es la primera versión: ya funcionan el ingreso y el menú. Las clases, suplencias, recuperos y avisos se van sumando en las próximas versiones.</p></div>
        </div>
        <div class="kpis">
            ${kpi("teal", "i-cal", "Clases hoy", "agenda", esPlanif ? "De todos los docentes" : "De tu calendario")}
            ${kpi("warn", "i-swap", "Suplencias", "suplencias", "Pendientes de confirmar")}
            ${kpi("warn", "i-move", "Recuperos", "recuperos", "Esperando a los alumnos")}
            ${kpi("bad", "i-alert", "Avisos", "avisos", "Clases sin resolver")}
        </div>
        <div class="grid2">
            <div class="card">
                <div class="card-head"><h3>${icono("i-cal")} ${esPlanif ? "Clases que chocan con festivales" : "Tus clases de hoy"}</h3></div>
                <div class="ds-empty"><b>Disponible pronto</b>${esPlanif ? "Acá vas a ver las clases de los docentes que caen el día de un festival." : "Acá vas a ver las clases de hoy de tu calendario de Google."}</div>
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
