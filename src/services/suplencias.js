// =======================================================================
// src/services/suplencias.js — Suplencias (v0.4). Diseño: mockup_03_suplencias.html
//
// docentes_movimientos/{id}  (tipo 'suplencia')
//   estado: 'pendiente' → 'confirmada' | 'cancelada'
//   clase: { calendarioId, eventId, inicio (ISO), fin (ISO), titulo, duracionMin, bateria, recurrente, descripcion }
//   docente:  { profesorId, nombre, email, calendario }   ← a quién se reemplaza
//   suplente: { profesorId, nombre, email, calendario }   ← quién cubre (el elegido actual)
//   intentos: [{ suplente, fecha, por }]                   ← elegidos antes que no pudieron
//   pedidaPor: { email, nombre }, enNombreDe: true si la pidió un planificador por otro docente
//   eventos (al confirmar): { creado: { calendarioId, eventId }, renombrado: { calendarioId, eventId, inicio, tituloAnterior, tituloNuevo } }
//   historial: [{ fecha, por, texto }], creadoEn, actualizadoEn
//
// Reglas de calendario (decisiones de Pablo): la confirma quien la pidió; al confirmar, la clase de ESE día
// se renombra con "❌ " adelante y se crea la clase en el calendario del suplente. Nada se toca antes.
// =======================================================================

import { db, collection, doc, getDoc, addDoc, updateDoc, onSnapshot, query, where } from "../config/firebase.js";
import { COLLECTIONS } from "../config/constants.js";
import { leerEventos, renombrarClaseDelDia, crearEvento, eliminarEvento } from "./calendario.js";

const PREFIJO_ANULADA = "❌ ";

let ultimas = [];
const oyentes = new Set();

/* Escucha todas las suplencias (las reglas actuales dejan leer la colección a los autorizados). */
export function escucharSuplencias(onCambio) {
    if (onCambio) oyentes.add(onCambio);
    if (escucharSuplencias.activo) { if (onCambio) onCambio(ultimas); return () => oyentes.delete(onCambio); }
    escucharSuplencias.activo = true;
    onSnapshot(query(collection(db, COLLECTIONS.MOVIMIENTOS), where("tipo", "==", "suplencia")), (snap) => {
        ultimas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        oyentes.forEach(f => { try { f(ultimas); } catch (e) { console.warn(e); } });
    }, (err) => console.warn("[Suplencias] No se pudieron leer:", err.code || err));
    return () => oyentes.delete(onCambio);
}
export const suplenciasActuales = () => ultimas;

/* Suplencia abierta o confirmada de una clase (mismo calendario, mismo evento, mismo inicio) */
export function suplenciaDeClase(c) {
    const ini = c.inicio.toISOString();
    return ultimas.find(m => m.estado !== "cancelada" && m.clase && m.clase.calendarioId === c.calendarioId && m.clase.eventId === c.id && m.clase.inicio === ini) || null;
}

const persona = (d) => ({ profesorId: d.profesorId || "", nombre: d.nombre || "", email: d.email || "", calendario: d.calendario || "" });
const ahoraISO = () => new Date().toISOString();
const quien = (perfil) => ({ email: perfil.email || "", nombre: perfil.nombre || "" });

/* Crea la suplencia pendiente (después de copiar el mensaje) */
export async function crearPendiente({ clase, docente, suplente, perfil, mensaje }) {
    const p = quien(perfil);
    const datos = {
        tipo: "suplencia",
        estado: "pendiente",
        clase: {
            calendarioId: clase.calendarioId, eventId: clase.id, inicio: clase.inicio.toISOString(), fin: clase.fin.toISOString(),
            titulo: clase.titulo, duracionMin: clase.duracionMin, bateria: !!clase.bateria,
            recurrente: clase.recurrente, descripcion: clase.descripcion || ""
        },
        docente: persona(docente),
        suplente: persona(suplente),
        intentos: [],
        pedidaPor: p,
        enNombreDe: docente.profesorId !== perfil.profesorId,
        mensaje: mensaje || "",
        creadoEn: ahoraISO(),
        actualizadoEn: ahoraISO(),
        historial: [{ fecha: ahoraISO(), por: p.nombre, texto: `Pidió a ${suplente.nombre} que cubra la clase.` }]
    };
    const ref = await addDoc(collection(db, COLLECTIONS.MOVIMIENTOS), datos);
    return ref.id;
}

async function leerMov(id) {
    const snap = await getDoc(doc(db, COLLECTIONS.MOVIMIENTOS, id));
    if (!snap.exists()) throw new Error("La suplencia ya no existe.");
    return { id: snap.id, ...snap.data() };
}

/* El elegido no puede: se cambia por otro (queda el intento registrado) */
export async function cambiarSuplente(id, nuevo, perfil, mensaje) {
    const m = await leerMov(id);
    if (m.estado !== "pendiente") throw new Error("La suplencia ya no está pendiente.");
    const p = quien(perfil);
    await updateDoc(doc(db, COLLECTIONS.MOVIMIENTOS, id), {
        suplente: persona(nuevo),
        intentos: [...(m.intentos || []), { suplente: m.suplente, fecha: ahoraISO(), por: p.nombre }],
        mensaje: mensaje || m.mensaje || "",
        actualizadoEn: ahoraISO(),
        historial: [...(m.historial || []), { fecha: ahoraISO(), por: p.nombre, texto: `${m.suplente.nombre} no pudo. Se pidió a ${nuevo.nombre}.` }]
    });
}

export async function cancelar(id, perfil, motivo = "") {
    const m = await leerMov(id);
    if (m.estado !== "pendiente") throw new Error("Solo se puede cancelar una suplencia pendiente.");
    const p = quien(perfil);
    await updateDoc(doc(db, COLLECTIONS.MOVIMIENTOS, id), {
        estado: "cancelada", actualizadoEn: ahoraISO(),
        historial: [...(m.historial || []), { fecha: ahoraISO(), por: p.nombre, texto: `Canceló el pedido.${motivo ? " " + motivo : ""}` }]
    });
}

/* Lee la clase y el calendario del suplente justo antes de confirmar.
   → { clase, choques: [eventos del suplente que se superponen] } o error si la clase ya no está. */
export async function revisarAntesDeConfirmar(m) {
    const ini = new Date(m.clase.inicio), fin = new Date(m.clase.fin);
    const desde = new Date(ini); desde.setHours(0, 0, 0, 0);
    const hasta = new Date(ini); hasta.setHours(23, 59, 59, 0);
    const { clases } = await leerEventos(m.clase.calendarioId, desde, hasta);
    const clase = clases.find(c => c.id === m.clase.eventId && Math.abs(c.inicio - ini) < 60000);
    if (!clase) throw new Error("La clase ya no está en ese horario en el calendario (puede haberse movido o borrado). No se cambió nada.");
    if (clase.anulada) throw new Error("La clase ya figura con ❌ en el calendario. No se cambió nada.");
    let choques = [];
    if (m.suplente.calendario) {
        const r = await leerEventos(m.suplente.calendario, desde, hasta);
        choques = r.clases.filter(c => !c.anulada && c.inicio < fin && c.fin > ini);
    }
    return { clase, choques };
}

/* Confirma: crea la clase en el calendario del suplente y renombra la original de ese día con ❌.
   Si el renombre falla, borra la clase creada para no dejar las cosas a medias. */
export async function confirmar(id, perfil) {
    const m = await leerMov(id);
    if (m.estado !== "pendiente") throw new Error("La suplencia ya no está pendiente.");
    if (!m.suplente.calendario) throw new Error(`${m.suplente.nombre} no tiene un calendario cargado: no se puede crear la clase en su agenda.`);
    const { clase } = await revisarAntesDeConfirmar(m);

    const tituloNuevo = `Suplencia de ${m.docente.nombre} · ${clase.titulo}`;
    const desc = [clase.descripcion || "", `Suplencia registrada en el Portal Docentes: cubre a ${m.docente.nombre}.`].filter(Boolean).join("\n\n");
    const tituloAnulado = PREFIJO_ANULADA + clase.titulo;

    // 1) Primero se marca la clase original con ❌ (si el script del calendario no es la v4, falla acá y no se toca nada)
    try {
        await renombrarClaseDelDia(m.clase.calendarioId, clase.id, clase.inicio, tituloAnulado);
    } catch (e) {
        const sinV4 = /desconocida/i.test(e.message || "");
        throw new Error(sinV4
            ? "El script del calendario todavía no tiene la versión 4 (renombrar solo la clase de un día). No se cambió nada."
            : `No se pudo marcar la clase con ❌ (${e.message}). No se cambió nada.`);
    }
    // 2) Después se crea la clase en el calendario del suplente; si falla, se le quita el ❌ a la original
    let creado = null;
    try {
        creado = await crearEvento(m.suplente.calendario, tituloNuevo, clase.inicio, clase.fin, desc);
        if (!creado || !creado.id) throw new Error("el calendario no devolvió la clase creada");
    } catch (e) {
        try { await renombrarClaseDelDia(m.clase.calendarioId, clase.id, clase.inicio, clase.titulo); } catch (e2) { console.warn("[Suplencias] No se pudo quitar el ❌:", e2); }
        throw new Error(`No se pudo crear la clase en el calendario de ${m.suplente.nombre} (${e.message}). Se restauró la clase original.`);
    }

    const p = quien(perfil);
    await updateDoc(doc(db, COLLECTIONS.MOVIMIENTOS, id), {
        estado: "confirmada", confirmadaEn: ahoraISO(), actualizadoEn: ahoraISO(),
        eventos: {
            creado: { calendarioId: m.suplente.calendario, eventId: creado.id, titulo: tituloNuevo },
            renombrado: { calendarioId: m.clase.calendarioId, eventId: clase.id, inicio: clase.inicio.toISOString(), tituloAnterior: clase.titulo, tituloNuevo: tituloAnulado }
        },
        historial: [...(m.historial || []), { fecha: ahoraISO(), por: p.nombre, texto: `${m.suplente.nombre} aceptó. Calendarios actualizados.` }]
    });
    return { ...m, estado: "confirmada" };
}

/* Deshace una suplencia confirmada: borra la clase del suplente y le quita el ❌ a la original */
export async function deshacer(id, perfil) {
    const m = await leerMov(id);
    if (m.estado !== "confirmada" || !m.eventos) throw new Error("Solo se puede deshacer una suplencia confirmada.");
    const r = m.eventos.renombrado, c = m.eventos.creado;
    await renombrarClaseDelDia(r.calendarioId, r.eventId, new Date(r.inicio), r.tituloAnterior);
    try { await eliminarEvento(c.calendarioId, c.eventId); } catch (e) { console.warn("[Suplencias] No se pudo borrar la clase del suplente:", e); }
    const p = quien(perfil);
    await updateDoc(doc(db, COLLECTIONS.MOVIMIENTOS, id), {
        estado: "cancelada", deshechaEn: ahoraISO(), actualizadoEn: ahoraISO(),
        historial: [...(m.historial || []), { fecha: ahoraISO(), por: p.nombre, texto: "Deshizo la suplencia: se restauró la clase original y se borró la del suplente." }]
    });
}
