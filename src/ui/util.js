// src/ui/util.js — utilidades de pantalla compartidas

/* Escapa texto para meterlo en HTML */
export function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
