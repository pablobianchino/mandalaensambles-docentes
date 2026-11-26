// =======================================================================
// src/services/calendario.js — Lectura de Google Calendar (v0.2, solo lectura)
// Cliente del mismo Apps Script que Admisión y Festivales (acción getEvents).
// Base: app_mdl_festival/src/services/calendarioService.js (reintentos, token de sesión, allDay).
// =======================================================================

import { auth } from "../config/firebase.js";
import { SCRIPT_URL, SCRIPT_API_KEY } from "../config/constants.js";

const ESPERA_MS = 12000;

async function pedirAlScript(payload) {
    const cuerpo = { ...payload, apiKey: SCRIPT_API_KEY };
    try {
        const token = await auth.currentUser?.getIdToken();
        if (token) cuerpo.idToken = token;
    } catch (e) { console.warn("[Calendario] No se pudo obtener el token de sesión:", e && e.message); }

    let ultimoError = null;
    for (let intento = 0; intento < 3; intento++) {
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), ESPERA_MS) : null;
        try {
            const res = await fetch(SCRIPT_URL, {
                method: "POST",
                body: JSON.stringify(cuerpo),
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                redirect: "follow",
                credentials: "omit",
                signal: ctrl ? ctrl.signal : undefined
            });
            const texto = await res.text();
            if (!res.ok || texto.trim().startsWith("<")) throw new Error(`Google Calendar respondió con un error (HTTP ${res.status}).`);
            const datos = JSON.parse(texto);
            if (datos && datos.error) {
                const err = new Error(datos.error);
                err.definitivo = true; // calendario sin permiso o sesión rechazada: no se reintenta
                throw err;
            }
            return datos;
        } catch (e) {
            ultimoError = e;
            if (e && e.definitivo) throw e;
            await new Promise(r => setTimeout(r, 700));
        } finally {
            if (timer) clearTimeout(timer);
        }
    }
    throw ultimoError || new Error("No se pudo consultar Google Calendar.");
}

/* Fecha local → ISO con zona horaria (como lo arma Admisión) */
export function isoLocal(d) {
    const tzo = -d.getTimezoneOffset(), dif = tzo >= 0 ? "+" : "-", p = n => (n < 10 ? "0" : "") + n;
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds())
        + dif + p(Math.floor(Math.abs(tzo) / 60)) + ":" + p(Math.abs(tzo) % 60);
}

/* 'AAAA-MM-DD' del día local */
export function diaISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Un evento de todo el día (feriados, recordatorios) o de 8 h o más: no cuenta como clase (criterio de Admisión) */
function esDeTodoElDia(ev, ini, fin) {
    if (ev && ev.allDay === true) return true;
    if (ev && ev.start && !ev.start.dateTime && ev.start.date) return true;
    if (!ini || !fin) return false;
    return (fin - ini) >= 8 * 3600 * 1000;
}

/**
 * Eventos de un calendario entre dos fechas, normalizados.
 * Las instancias de una serie comparten id: la clave única es id + inicio.
 * @returns {Promise<{clases: Array, ocultos: number}>}
 */
export async function leerEventos(calendarioId, desde, hasta, { iconoBateria = "🥁" } = {}) {
    if (!calendarioId) return { clases: [], ocultos: 0 };
    const datos = await pedirAlScript({ action: "getEvents", calendarId: calendarioId, timeMin: isoLocal(desde), timeMax: isoLocal(hasta) });
    const items = Array.isArray(datos && datos.items) ? datos.items : [];
    const clases = [];
    let ocultos = 0;
    items.forEach(ev => {
        const ini = ev.start && (ev.start.dateTime || ev.start.date) ? new Date(ev.start.dateTime || ev.start.date) : null;
        const fin = ev.end && (ev.end.dateTime || ev.end.date) ? new Date(ev.end.dateTime || ev.end.date) : null;
        if (!ev || !ev.id || !ini || isNaN(ini)) return;
        if (esDeTodoElDia(ev, ini, fin)) { ocultos++; return; }
        const titulo = String(ev.summary || "(sin título)");
        const tituloMin = titulo.toLowerCase();
        clases.push({
            id: String(ev.id),
            clave: `${ev.id}__${ini.toISOString()}`,
            calendarioId,
            titulo,
            inicio: ini,
            fin: fin && !isNaN(fin) ? fin : new Date(ini.getTime() + 60 * 60000),
            duracionMin: fin && !isNaN(fin) ? Math.round((fin - ini) / 60000) : 60,
            bateria: (iconoBateria && titulo.includes(iconoBateria)) || tituloMin.includes("bater"),
            // Llegan con la versión 4 del script; mientras tanto quedan sin dato
            recurrente: typeof ev.recurrente === "boolean" ? ev.recurrente : null,
            descripcion: typeof ev.descripcion === "string" ? ev.descripcion : null,
            anulada: titulo.trim().startsWith("❌")
        });
    });
    clases.sort((a, b) => a.inicio - b.inicio);
    return { clases, ocultos };
}
