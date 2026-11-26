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
            calendario: calendarioDeFicha(p)
        });
    });
    cacheDocentes = [...porProfe.values()]
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
        .map((d, i) => ({ ...d, color: COLORES[i % COLORES.length] }));
    return cacheDocentes;
}

export function olvidarCaches() {
    cacheConfig = null;
    cacheDocentes = null;
}
