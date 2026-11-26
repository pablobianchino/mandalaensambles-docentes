// =======================================================================
// src/app.js — Portal Docentes: sesión, acceso, menú y navegación
// Historial de cambios: CAMBIOS_docentes.md
// =======================================================================

import { APP_VERSION, URL_PORTAL_CORE, NOMBRES_APPS, CLAVE_INICIAL_DEFECTO, CLAVE_VISTA_GUARDADA } from "./config/constants.js";
import {
    alCambiarSesion, loginConEmail, loginConGoogle, cerrarSesion, esSesionConPassword,
    cambiarPassword, marcarPasswordModificada, consultarPerfil
} from "./services/acceso.js";
import { vistasDisponibles, elegirVista, etiquetaRol } from "./services/permisos.js";
import { SECCIONES, renderInicio, renderProximamente, esc } from "./ui/vistas.js";
import { renderAgenda, refrescarAgenda } from "./ui/agenda.js";
import { configurarSuplencias, renderSuplencias, pendientesParaContador, cerrarVentana as cerrarVentanaSuplencia } from "./ui/suplencias.js";
import { escucharSuplencias } from "./services/suplencias.js";
import { usarPaseDeCore } from "./services/pase.js";
import { auth } from "./config/firebase.js";

const RUTAS = Object.keys(SECCIONES);

let usuarioActual = null;   // perfil (services/permisos.js → armarPerfil)
let vistaActual = "docente"; // 'docente' | 'planificador'
let cambioClaveForzado = false;

/* ================================================================ ARRANQUE */
document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("app-version").textContent = APP_VERSION;
    document.getElementById("btn-ir-core").href = URL_PORTAL_CORE;
    bindEventos();
    // v0.6 (etapa 4 de Core): primero el pase de un solo uso (borra #pase= de la dirección), después la sesión y la ruta
    const resultadoPase = await usarPaseDeCore(auth, "docentes");
    if (resultadoPase.error) console.warn("[Docentes] Pase de Core:", resultadoPase.error);
    window.addEventListener("hashchange", aplicarRuta);
    registrarServiceWorker();
    alCambiarSesion(manejarCambioSesion);
});

/* ================================================================ ESTADO DE LA PÁGINA */
function mostrarEstado(estado) {
    document.body.classList.remove("estado-cargando", "estado-login", "estado-app");
    document.body.classList.add(`estado-${estado}`);
}
const mostrarSplash = () => { if (typeof window.mostrarSplashInicial === "function") window.mostrarSplashInicial(); };
const ocultarSplash = () => { if (typeof window.ocultarSplashInicial === "function") window.ocultarSplashInicial(); };

/* ================================================================ SESIÓN */
async function manejarCambioSesion(user) {
    if (!user) {
        usuarioActual = null;
        cerrarVentanas();
        // Si se estaba mostrando "sin acceso", queda visible hasta que la persona vuelva al formulario
        mostrarEstado("login");
        ocultarSplash();
        return;
    }

    mostrarEstado("cargando");
    mostrarSplash();
    let estado, perfil;
    try {
        ({ estado, perfil } = await consultarPerfil(user.email));
    } catch (e) {
        estado = "error";
    }

    if (estado !== "ok") {
        ocultarSplash();
        if (["sin_acceso_app", "sin_rol", "inactivo", "sin_perfil"].includes(estado)) {
            mostrarSinAcceso(estado, user.email, perfil);
        } else {
            mostrarErrorLogin(estado === "sin_permiso"
                ? "No se pudo verificar tu acceso (permiso denegado). Avisale al administrador."
                : "No se pudo verificar tu acceso. Revisá tu conexión y volvé a intentar.");
        }
        await cerrarSesion();
        return;
    }

    usuarioActual = perfil;
    let guardada = "";
    try { guardada = localStorage.getItem(CLAVE_VISTA_GUARDADA) || ""; } catch (e) { /* sin almacenamiento */ }
    vistaActual = elegirVista(perfil, guardada);

    pintarWidget();
    aplicarTextosDeVista();
    mostrarFormularioLogin();
    mostrarEstado("app");
    configurarSuplencias({ get perfil() { return usuarioActual; }, get vista() { return vistaActual; }, toast: mostrarToast, refrescar: refrescarAgenda });
    escucharSuplencias(actualizarContadores);
    aplicarRuta();
    ocultarSplash();

    // Cambio obligatorio de la clave inicial (solo si se ingresó con correo y contraseña)
    if (perfil.password_modificada === false && await esSesionConPassword(user)) {
        abrirCambioClave(true);
    }
}

/* ---- Pantalla "sin acceso" dentro de la tarjeta del login (igual a la etapa 3 de las otras apps) ---- */
function mostrarSinAcceso(estado, email, perfil) {
    const titulos = {
        sin_acceso_app: "No tenés acceso al Portal Docentes",
        sin_rol: "No tenés el rol docente",
        inactivo: "Tu usuario está inactivo",
        sin_perfil: "Tu correo no está dado de alta"
    };
    const pedido = estado === "sin_rol"
        ? "Tenés acceso a la app, pero falta el rol Docente o Planificador de clases. Pedíselo al administrador."
        : "Pedile acceso al administrador.";
    document.getElementById("sin-acceso-titulo").textContent = titulos[estado];
    document.getElementById("sin-acceso-texto").innerHTML = `Ingresaste como <b>${esc(email)}</b>.<br>${pedido}`;
    const apps = (perfil?.apps || []).filter(id => NOMBRES_APPS[id]);
    document.getElementById("sin-acceso-apps").innerHTML = apps.map(id => `<span class="ds-chip ${chipApp(id)}">${esc(NOMBRES_APPS[id])}</span>`).join("");
    document.getElementById("sin-acceso-apps-bloque").hidden = apps.length === 0;
    document.getElementById("login-card-form").hidden = true;
    document.getElementById("login-card-sin-acceso").hidden = false;
}

function mostrarFormularioLogin() {
    document.getElementById("login-card-form").hidden = false;
    document.getElementById("login-card-sin-acceso").hidden = true;
}

function chipApp(id) {
    return { admision: "teal", festival: "vio", docentes: "info" }[id] || "";
}

/* ================================================================ WIDGET DE USUARIO */
function iniciales(nombre) {
    return String(nombre || "").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("") || "?";
}

function pintarWidget() {
    const p = usuarioActual;
    const nombre = p.nombre || p.email;
    document.getElementById("widget-user-name").textContent = nombre;
    document.getElementById("widget-user-avatar").textContent = iniciales(nombre);
    document.getElementById("widget-role-badge").innerHTML =
        `${p.esAdmin ? '<svg viewBox="0 0 24 24"><use href="#i-star"/></svg>' : ""}<span>${esc(etiquetaRol(p, vistaActual))}</span><span class="widget-role-caret" aria-hidden="true">▾</span>`;
    document.getElementById("popover-avatar").textContent = iniciales(nombre);
    document.getElementById("popover-name").textContent = nombre;
    document.getElementById("popover-email").textContent = p.email;

    const apps = (p.apps || []).filter(id => NOMBRES_APPS[id]);
    document.getElementById("popover-apps").innerHTML = apps.length
        ? apps.map(id => `<span class="ds-chip ${chipApp(id)}">${esc(NOMBRES_APPS[id])}</span>`).join("")
        : '<span class="popover-sin-apps">Todavía no tenés aplicaciones habilitadas.</span>';

    // "Ver el portal como": solo si hay más de una vista posible
    const vistas = vistasDisponibles(p);
    const bloque = document.getElementById("popover-vistas-bloque");
    bloque.hidden = vistas.length < 2;
    if (vistas.length > 1) {
        document.getElementById("popover-vistas-titulo").textContent = `Ver el portal como · ${vistas.length} roles`;
        const etiquetas = { planificador: ["i-grid", "Planificador de clases"], docente: ["i-cal", "Docente (solo mis clases)"] };
        document.getElementById("popover-vistas").innerHTML = vistas.map(v => `
            <button type="button" class="vista-opcion ${v === vistaActual ? "on" : ""}" data-vista="${v}">
                <svg class="i"><use href="#${etiquetas[v][0]}"/></svg> ${etiquetas[v][1]}
                ${v === vistaActual ? '<span class="check">✓</span>' : ""}
            </button>`).join("");
    }
}

function abrirPopover(abrir) {
    const pop = document.getElementById("profile-popover");
    const btn = document.getElementById("user-top-btn");
    const mostrar = typeof abrir === "boolean" ? abrir : !pop.classList.contains("show");
    pop.classList.toggle("show", mostrar);
    btn.setAttribute("aria-expanded", mostrar ? "true" : "false");
}

function cambiarVista(v) {
    if (v === vistaActual) return;
    vistaActual = v;
    try { localStorage.setItem(CLAVE_VISTA_GUARDADA, v); } catch (e) { /* sin almacenamiento */ }
    pintarWidget();
    aplicarTextosDeVista();
    aplicarRuta();
    mostrarToast(v === "planificador" ? "Viendo como Planificador de clases" : "Viendo solo tus clases");
}

/* Textos del menú que cambian entre docente y planificador */
function aplicarTextosDeVista() {
    document.querySelectorAll("[data-texto-docente]").forEach(el => {
        el.textContent = vistaActual === "planificador" ? el.dataset.textoPlanificador : el.dataset.textoDocente;
    });
}

/* ================================================================ NAVEGACIÓN */
function rutaActual() {
    const r = (location.hash || "").replace(/^#/, "");
    return RUTAS.includes(r) ? r : "inicio";
}

function irA(ruta) {
    if (location.hash === `#${ruta}`) aplicarRuta();
    else location.hash = `#${ruta}`;
}

function aplicarRuta() {
    if (!usuarioActual) return;
    const ruta = rutaActual();
    document.querySelectorAll("#nav-lateral .nav-item").forEach(li => li.classList.toggle("active", li.dataset.ruta === ruta));
    const enGestiones = ruta === "suplencias" || ruta === "recuperos";
    document.querySelectorAll("#bnav button").forEach(b => {
        const r = b.dataset.ruta;
        b.classList.toggle("on", r === ruta || (r === "gestiones" && enGestiones) || (r === "mas" && ["alumnos", "solicitudes"].includes(ruta)));
    });

    const cont = document.getElementById("vista");
    const ctx = { perfil: usuarioActual, vista: vistaActual, ruta, toast: mostrarToast };
    if (ruta === "inicio") renderInicio(cont, ctx);
    else if (ruta === "agenda") renderAgenda(cont, ctx);
    else if (ruta === "suplencias") renderSuplencias(cont, ctx);
    else renderProximamente(cont, ctx);
    actualizarContadores();
    cont.scrollTop = 0;
    window.scrollTo(0, 0);
}

/* Contadores del menú (suplencias pendientes) y la tarjeta de Inicio */
function actualizarContadores() {
    if (!usuarioActual) return;
    const n = pendientesParaContador(usuarioActual, vistaActual);
    document.querySelectorAll('[data-badge="suplencias"], [data-badge="gestiones"]').forEach(b => { b.textContent = String(n); b.hidden = n === 0; });
    const k = document.getElementById("kpi-sup");
    if (k) {
        k.textContent = String(n);
        k.classList.remove("vacio");
        const d = document.getElementById("kpi-sup-d");
        if (d) d.textContent = n ? (vistaActual === "planificador" ? "Esperando respuesta" : "Esperando tu confirmación") : "Ninguna pendiente";
    }
}

/* ================================================================ EVENTOS */
function bindEventos() {
    // Login con correo y contraseña
    document.getElementById("form-login-email").addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email").value.trim();
        const pass = document.getElementById("login-password").value;
        if (!email || !pass) return mostrarErrorLogin("Completá tu correo y tu contraseña.");
        const btn = document.getElementById("btn-login-email-submit");
        btn.disabled = true;
        btn.textContent = "Ingresando…";
        mostrarErrorLogin("");
        const res = await loginConEmail(email, pass);
        btn.disabled = false;
        btn.textContent = "Iniciar sesión";
        if (!res.ok) return mostrarErrorLogin(res.error);
        document.getElementById("login-password").value = "";
    });

    document.getElementById("btn-login-google").addEventListener("click", async () => {
        mostrarErrorLogin("");
        const res = await loginConGoogle();
        if (!res.ok) mostrarErrorLogin(res.error);
    });

    document.getElementById("btn-toggle-login-pass").addEventListener("click", () => {
        const input = document.getElementById("login-password");
        input.type = input.type === "password" ? "text" : "password";
    });

    // Sin acceso: volver al formulario (la sesión ya está cerrada)
    document.getElementById("btn-sin-acceso-salir").addEventListener("click", async () => {
        await cerrarSesion();
        mostrarFormularioLogin();
    });

    // Widget de usuario
    document.getElementById("user-top-btn").addEventListener("click", (e) => { e.stopPropagation(); abrirPopover(); });
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#user-header-widget-wrapper")) abrirPopover(false);
        const vistaBtn = e.target.closest(".vista-opcion");
        if (vistaBtn) { abrirPopover(false); cambiarVista(vistaBtn.dataset.vista); }
        const kpiBtn = e.target.closest("[data-ir]");
        if (kpiBtn) irA(kpiBtn.dataset.ir);
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { abrirPopover(false); cerrarVentana("hoja-mas"); }
    });

    document.getElementById("btn-cerrar-sesion").addEventListener("click", async () => {
        abrirPopover(false);
        await cerrarSesion();
        mostrarToast("Sesión cerrada");
    });
    document.getElementById("popover-link-cambiar-pass").addEventListener("click", () => {
        abrirPopover(false);
        abrirCambioClave(false);
    });

    // Cambio de clave
    document.getElementById("form-cambio-clave").addEventListener("submit", enviarCambioClave);
    document.getElementById("btn-cambio-clave-salir").addEventListener("click", async () => {
        cerrarVentana("modal-cambio-clave");
        if (cambioClaveForzado) await cerrarSesion();
    });

    // Menú lateral
    document.querySelectorAll("#nav-lateral .nav-item").forEach(li => li.addEventListener("click", () => irA(li.dataset.ruta)));
    document.getElementById("btn-gestionar").addEventListener("click", () => irA("agenda"));

    // Barra inferior (celular) y hoja "Más"
    document.querySelectorAll("#bnav button").forEach(b => b.addEventListener("click", () => {
        const r = b.dataset.ruta;
        if (r === "mas") return abrirVentana("hoja-mas");
        irA(r === "gestiones" ? "suplencias" : r);
    }));
    document.getElementById("hoja-mas").addEventListener("click", (e) => {
        const item = e.target.closest(".hoja-item");
        cerrarVentana("hoja-mas");
        if (item) irA(item.dataset.ruta);
    });
}

function mostrarErrorLogin(msg) {
    const el = document.getElementById("login-error-msg");
    el.textContent = msg || "";
    el.hidden = !msg;
}

/* ================================================================ VENTANAS */
function abrirVentana(id) { document.getElementById(id).hidden = false; }
function cerrarVentana(id) { const el = document.getElementById(id); if (el) el.hidden = true; }
function cerrarVentanas() {
    abrirPopover(false);
    cerrarVentanaSuplencia();
    ["modal-cambio-clave", "hoja-mas"].forEach(cerrarVentana);
}

/* ---- Cambio de clave: obligatorio (clave inicial) o voluntario (desde el perfil) ---- */
function abrirCambioClave(forzado) {
    cambioClaveForzado = forzado;
    document.getElementById("titulo-cambio-clave").textContent = forzado ? "Cambiá tu contraseña" : "Cambiar contraseña";
    document.getElementById("texto-cambio-clave").textContent = forzado
        ? "Estás usando la contraseña inicial. Por seguridad, elegí una nueva antes de continuar. La vas a usar también en las otras aplicaciones de Mandala."
        : "La nueva contraseña vale para todas las aplicaciones de Mandala (Portal Central, Admisión, Festivales y Docentes).";
    document.getElementById("btn-cambio-clave-salir").textContent = forzado ? "Cerrar sesión" : "Cancelar";
    ["clave-actual", "clave-nueva", "clave-repetir"].forEach(id => { document.getElementById(id).value = ""; });
    mostrarErrorCambioClave("");
    abrirVentana("modal-cambio-clave");
    setTimeout(() => document.getElementById("clave-actual").focus(), 60);
}

function mostrarErrorCambioClave(msg) {
    const el = document.getElementById("cambio-clave-error");
    el.textContent = msg || "";
    el.hidden = !msg;
}

async function enviarCambioClave(e) {
    e.preventDefault();
    const actual = document.getElementById("clave-actual").value;
    const nueva = document.getElementById("clave-nueva").value;
    const repetir = document.getElementById("clave-repetir").value;
    if (!actual || !nueva || !repetir) return mostrarErrorCambioClave("Completá los tres campos.");
    if (nueva.length < 6) return mostrarErrorCambioClave("La nueva contraseña debe tener al menos 6 caracteres.");
    if (nueva !== repetir) return mostrarErrorCambioClave("Las dos contraseñas nuevas no coinciden.");
    if (nueva === CLAVE_INICIAL_DEFECTO) return mostrarErrorCambioClave("No podés usar la contraseña inicial como contraseña nueva.");
    if (nueva === actual) return mostrarErrorCambioClave("La nueva contraseña tiene que ser distinta de la actual.");

    const btn = document.getElementById("btn-cambio-clave-ok");
    btn.disabled = true;
    btn.textContent = "Guardando…";
    const res = await cambiarPassword(actual, nueva);
    btn.disabled = false;
    btn.textContent = "Cambiar contraseña";
    if (!res.ok) return mostrarErrorCambioClave(res.error);

    await marcarPasswordModificada(usuarioActual?.ids || []);
    if (usuarioActual) usuarioActual.password_modificada = true;
    cerrarVentana("modal-cambio-clave");
    mostrarToast("Contraseña actualizada");
}

/* ================================================================ AVISOS Y SERVICE WORKER */
let timerToast = null;
function mostrarToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(timerToast);
    timerToast = setTimeout(() => { t.hidden = true; }, 2600);
}

function registrarServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    // En local no se registra, para ver siempre los archivos recién editados
    if (["localhost", "127.0.0.1"].includes(location.hostname)) return;
    navigator.serviceWorker.register("./sw.js").catch(e => console.warn("[Docentes] Service worker:", e));
}
