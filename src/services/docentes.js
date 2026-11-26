// =======================================================================
// src/services/docentes.js — Docentes, sus calendarios y la configuración de la escuela (solo lectura)
// El calendario de cada docente sale de usuarios_sistema.profesor_id → profesores/{id}.correo_calendario
// (mismo criterio que Admisión y Festivales).
// =======================================================================

import { db, collection, doc, getDoc, getDocs } from "../config/firebase.js";
import { COLLECTIONS, CONFIG_DEFECTO } from "../config/constants.js";
import { listaRoles } from "./permisos.js";

/* Colores por docente (tokens de la suite), en orden */
const COLORES = ["#007b8f", "#6d4b9b", "#9a5b00", "#1f7a4d", "#b2402b", "#1f5491", "#8a6d3b", "#c0397a"];

let cacheConfig = null;
let cacheDocentes = null;

function calendarioDeFicha(p) {
    return String((p && (p.correo_calendario || p.email_calendar)) || "").trim().toLowerCase();
}

/* Configuración de la escuela (configuracion/general), con los valores por defecto de Admisión */
export async function leerConfiguracion() {
    if (cacheConfig) return cacheConfig;
    let c = {};
    try {
        const snap = await getDoc(doc(db, COLLECTIONS.CONFIGURACION, "general"));
        if (snap.exists()) c = snap.data() || {};
    } catch (e) { console.warn("[Docentes] No se pudo leer la configuración:", e.code || e); }
    cacheConfig = {
        calendarioGeneral: String(c.calendario_por_defecto || CONFIG_DEFECTO.calendario_por_defecto).trim().toLowerCase(),
        aulas: parseInt(c.cantidad_aulas, 10) || CONFIG_DEFECTO.cantidad_aulas,
        baterias: parseInt(c.cantidad_baterias, 10) || CONFIG_DEFECTO.cantidad_baterias,
        iconoBateria: c.identificador_bateria || CONFIG_DEFECTO.identificador_bateria
    };
    return cacheConfig;
}

/* Calendario de un docente a partir de su id de ficha docente ('' si no tiene) */
export async function calendarioDeProfesor(profesorId) {
    if (!profesorId) return "";
    try {
        const snap = await getDoc(doc(db, COLLECTIONS.PROFESORES, profesorId));
        return snap.exists() ? calendarioDeFicha(snap.data()) : "";
    } catch (e) {
        console.warn("[Docentes] No se pudo leer la ficha docente:", e.code || e);
        return "";
    }
}

/**
 * Docentes activos para el planificador: fichas activas de usuarios_sistema con el rol docente
 * (profesor y evaluador cuentan) y perfil docente vinculado. Uno por perfil docente.
 * @returns {Promise<Array<{profesorId, nombre, email, calendario, color}>>}
 */
export async function listarDocentes() {
    if (cacheDocentes) return cacheDocentes;
    const [usuarios, profes] = await Promise.all([
        getDocs(collection(db, COLLECTIONS.USUARIOS_SISTEMA)),
        getDocs(collection(db, COLLECTIONS.PROFESORES))
    ]);
    const fichasProfe = {};
    profes.forEach(d => { fichasProfe[d.id] = d.data() || {}; });

    const porProfe = new Map();
    usuarios.forEach(d => {
        const u = d.data() || {};
        if (u.activo === false || !u.profesor_id || !listaRoles(u).includes("docente")) return;
        const p = fichasProfe[u.profesor_id];
        if (!p || p.activo === false || p.estado === "inactivo") return;
        if (porProfe.has(u.profesor_id)) return;
        porProfe.set(u.profesor_id, {
            profesorId: u.profesor_id,
            nombre: (u.nombre || p.nombre || u.email || "Docente").trim(),
            email: String(u.email || "").toLowerCase(),
            calendario: calendarioDeFicha(p),
            disponibilidad: p.disponibilidad || u.disponibilidad || null // { L: [{inicio, fin}], … } (Admisión)
        });
    });
    cacheDocentes = [...porProfe.values()]
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
        .map((d, i) => ({ ...d, color: COLORES[i % COLORES.length] }));
    return cacheDocentes;
}

/* ¿La franja cae dentro de la disponibilidad declarada? true / false / null (no declaró nada) */
export function dentroDeDisponibilidad(docente, inicio, fin) {
    const disp = docente && docente.disponibilidad;
    if (!disp || typeof disp !== "object") return null;
    const cod = ["D", "L", "M", "X", "J", "V", "S"][inicio.getDay()];
    const rangos = Array.isArray(disp[cod]) ? disp[cod] : [];
    if (!Object.values(disp).some(v => Array.isArray(v) && v.length)) return null;
    const min = (t) => { const [h, m] = String(t || "").split(":").map(Number); return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m); };
    const s = inicio.getHours() * 60 + inicio.getMinutes();
    let e = fin.getHours() * 60 + fin.getMinutes(); if (e === 0) e = 24 * 60;
    return rangos.some(r => {
        if (!r) return false;
        const ini = typeof r === "string" ? min(r.split(/[-a]/)[0]) : min(r.inicio);
        let f = typeof r === "string" ? min(r.split(/[-a]/)[1]) : min(r.fin);
        if (f === 0 || f < ini) f += 24 * 60;
        return s >= ini && e <= f;
    });
}

/* Plantillas de mensajes (configuracion/docentes). Si no existen, las propuestas del mockup 3. */
const PLANTILLAS_DEFECTO = {
    mensaje_suplente: "¡Hola {suplente}! ¿Cómo estás? 👋\n\nTe escribo para pedirte si podés cubrirme una clase:\n\n📅 {dia} {fecha}\n🕒 {hora_inicio} a {hora_fin} ({duracion} min)\n🎵 {clase}\n\n¿Te queda bien? Avisame así lo confirmo en el portal. ¡Gracias!\n{docente}",
    aviso_alumnos_suplencia: "¡Hola! 👋 Les cuento que el {dia} {fecha} la clase de las {hora_inicio} la da {suplente}, porque yo no voy a poder estar.\n\nEs en el mismo horario y lugar de siempre. ¡Que la disfruten! 🎶\n{docente}"
};
let cachePlantillas = null;
export async function leerPlantillas() {
    if (cachePlantillas) return cachePlantillas;
    let c = {};
    try {
        const snap = await getDoc(doc(db, COLLECTIONS.CONFIGURACION, "docentes"));
        if (snap.exists()) c = snap.data() || {};
    } catch (e) { console.warn("[Docentes] No se pudieron leer las plantillas:", e.code || e); }
    cachePlantillas = { ...PLANTILLAS_DEFECTO, ...Object.fromEntries(Object.entries(c).filter(([, v]) => typeof v === "string" && v.trim())) };
    return cachePlantillas;
}

/* Reemplaza {variables} en una plantilla */
export function completarPlantilla(texto, datos) {
    return String(texto || "").replace(/\{([a-z_]+)\}/gi, (m, k) => (datos[k] != null ? String(datos[k]) : ""));
}

export function olvidarCaches() {
    cacheConfig = null;
    cacheDocentes = null;
}
