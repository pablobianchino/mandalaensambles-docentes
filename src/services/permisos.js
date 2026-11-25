// =======================================================================
// src/services/permisos.js — Quién entra al Portal Docentes y con qué vista
// Lógica pura (sin Firebase): se puede probar aparte (scratch/probar_permisos.mjs).
//
// Nivel 1 (lo da Core): la app "docentes" en usuarios_sistema.apps_habilitadas.
//   Si la ficha no tiene el campo (fichas viejas), se deduce de los roles, igual que Core v1.4.
// Además del acceso hace falta un rol (decisión de Pablo, 25/11/2026):
//   - docente (rol compartido con Admisión; profesor y evaluador cuentan como docente) → ve solo lo suyo;
//   - planificador_clases → ve a todos los docentes;
//   - el administrador entra siempre.
//   Con acceso pero sin ninguno de esos roles → 'sin_rol'.
// Varias fichas con el mismo correo: alcanza con una activa y se unen roles y apps (criterio de Core).
// =======================================================================

import { ID_APP, EMAIL_CUENTA_EMERGENCIA } from "../config/constants.js";

const normalizar = (v) => String(v || "").toLowerCase().trim();

/* Nombres viejos que todavía pueden estar en algunas fichas (mismo criterio que Core) */
const ROLES_EQUIVALENTES = { admisiones: "admisor", coordinador: "coordinador_grupos", profesor: "docente", evaluador: "docente" };
const ROLES_QUE_DAN_DOCENTES = ["docente", "planificador_clases"];

export function listaRoles(u) {
    if (!u) return [];
    const roles = Array.isArray(u.roles) ? u.roles : (u.rol ? [u.rol] : []);
    return roles.map(normalizar).filter(Boolean).map(r => ROLES_EQUIVALENTES[r] || r);
}

/* Apps de una ficha: el campo apps_habilitadas si existe; si no, lo que dan los roles */
export function appsDeFicha(u) {
    if (u && Array.isArray(u.apps_habilitadas)) return u.apps_habilitadas.map(normalizar).filter(Boolean);
    const roles = listaRoles(u);
    const apps = [];
    if (roles.includes("admin")) return ["admision", "festival", ID_APP];
    if (roles.some(r => ["admisor", "coordinador_grupos", "atencion_cliente", "docente"].includes(r))) apps.push("admision");
    if (roles.some(r => ["gestor_festivales", "sonidista_festivales", "planificador_clases"].includes(r))) apps.push("festival");
    if (roles.some(r => ROLES_QUE_DAN_DOCENTES.includes(r))) apps.push(ID_APP);
    return apps;
}

/**
 * Perfil de sesión.
 * @returns {{estado: 'ok'|'sin_perfil'|'inactivo'|'sin_acceso_app', perfil: object|null}}
 */
export function armarPerfil(email, fichas) {
    const emailNorm = normalizar(email);
    const esEmergencia = emailNorm === EMAIL_CUENTA_EMERGENCIA;
    const coincidencias = (fichas || []).filter(f => normalizar(f.email) === emailNorm);
    const activas = coincidencias.filter(f => f.activo !== false);

    if (activas.length === 0 && !esEmergencia) {
        return { estado: coincidencias.length === 0 ? "sin_perfil" : "inactivo", perfil: null };
    }

    const roles = [...new Set(activas.flatMap(listaRoles))];
    const esAdmin = esEmergencia || roles.includes("admin");
    const apps = esAdmin ? ["admision", "festival", ID_APP] : [...new Set(activas.flatMap(appsDeFicha))];
    const base = activas.find(f => f.profesor_id) || activas[0] || {};

    const perfil = {
        id: base.id || null,
        ids: activas.map(f => f.id).filter(Boolean),
        email: emailNorm,
        nombre: base.nombre || (esEmergencia ? "Administración" : emailNorm.split("@")[0]),
        roles: esAdmin && !roles.includes("admin") ? ["admin", ...roles] : roles,
        apps,
        esAdmin,
        esEmergencia,
        esPlanificador: esAdmin || roles.includes("planificador_clases"),
        // Manda el rol: un perfil docente vinculado sin el rol no alcanza
        esDocente: roles.includes("docente"),
        profesorId: base.profesor_id || "",
        password_modificada: !activas.some(f => f.password_modificada === false)
    };

    if (!apps.includes(ID_APP)) return { estado: "sin_acceso_app", perfil };
    if (!perfil.esPlanificador && !perfil.esDocente) return { estado: "sin_rol", perfil };
    return { estado: "ok", perfil };
}

/* Vistas que puede elegir la persona, en orden de preferencia */
export function vistasDisponibles(perfil) {
    if (!perfil) return [];
    const v = [];
    if (perfil.esPlanificador) v.push("planificador");
    if (perfil.esDocente) v.push("docente");
    return v;
}

/* Vista activa: la guardada si sigue siendo válida; si no, la primera disponible */
export function elegirVista(perfil, guardada) {
    const v = vistasDisponibles(perfil);
    return v.includes(guardada) ? guardada : v[0];
}

/* Etiqueta del rol para el widget */
export function etiquetaRol(perfil, vista) {
    if (perfil.esAdmin) return "Admin";
    return vista === "planificador" ? "Planificador" : "Docente";
}
