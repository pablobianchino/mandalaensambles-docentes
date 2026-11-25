// =======================================================================
// src/services/acceso.js — Inicio de sesión (Firebase Auth) y lectura del perfil
// Copia de app_mdl_central/acceso.js (Core v1.5), con el perfil propio de Docentes.
// =======================================================================

import {
    db, auth, collection, doc, getDocs, query, where, updateDoc,
    GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, signOut,
    onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from "../config/firebase.js";
import { COLLECTIONS } from "../config/constants.js";
import { armarPerfil } from "./permisos.js";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export function alCambiarSesion(callback) {
    return onAuthStateChanged(auth, callback);
}

function mensajeErrorAuth(error) {
    switch (error && error.code) {
        case "auth/wrong-password":
        case "auth/invalid-credential":
            return "Contraseña o correo incorrectos. Si tu cuenta usa Google, ingresá con el botón de Google. Si olvidaste tu contraseña, pedile al administrador que te restablezca el acceso.";
        case "auth/user-not-found":
            return "No se encontró un usuario registrado con este correo.";
        case "auth/too-many-requests":
            return "Demasiados intentos fallidos. Esperá unos minutos antes de reintentar.";
        case "auth/invalid-email":
            return "El formato del correo electrónico no es válido.";
        case "auth/network-request-failed":
            return "No hay conexión con el servidor. Revisá tu internet y reintentá.";
        case "auth/unauthorized-domain":
            return "Este sitio todavía no está autorizado para ingresar con Google. Usá correo y contraseña o avisale al administrador.";
        case "auth/popup-blocked":
            return "El navegador bloqueó la ventana de Google. Permití las ventanas emergentes para este sitio y reintentá.";
        case "auth/popup-closed-by-user":
        case "auth/cancelled-popup-request":
            return "Se cerró la ventana de Google antes de completar el ingreso.";
        default:
            return "No se pudo iniciar sesión. Reintentá en unos instantes.";
    }
}

export async function loginConEmail(email, password) {
    try {
        const cred = await signInWithEmailAndPassword(auth, (email || "").trim().toLowerCase(), password);
        return { ok: true, user: cred.user };
    } catch (error) {
        console.warn("[Docentes] Error de credenciales:", error.code);
        return { ok: false, error: mensajeErrorAuth(error) };
    }
}

export async function loginConGoogle() {
    try {
        const result = await signInWithPopup(auth, provider);
        return { ok: true, user: result.user };
    } catch (error) {
        console.warn("[Docentes] Error al ingresar con Google:", error.code);
        return { ok: false, error: mensajeErrorAuth(error) };
    }
}

export async function cerrarSesion() {
    try { await signOut(auth); } catch (e) { console.warn("[Docentes] Error al cerrar sesión:", e); }
}

/* La sesión se inició con correo y contraseña (no con Google) */
export async function esSesionConPassword(user) {
    try {
        const tok = await (user || auth.currentUser).getIdTokenResult();
        return tok?.signInProvider === "password";
    } catch (e) {
        return false;
    }
}

export async function cambiarPassword(passActual, passNueva) {
    const user = auth.currentUser;
    if (!user || !user.email) return { ok: false, error: "No hay una sesión activa para cambiar la contraseña." };
    try {
        const cred = EmailAuthProvider.credential(user.email, passActual);
        await reauthenticateWithCredential(user, cred);
        await updatePassword(user, passNueva);
        return { ok: true };
    } catch (error) {
        console.warn("[Docentes] Error al cambiar contraseña:", error.code);
        let msg = mensajeErrorAuth(error);
        if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
            msg = "La contraseña actual es incorrecta. Si no la recordás, pedile al administrador que te restablezca el acceso.";
        } else if (error.code === "auth/weak-password") {
            msg = "La nueva contraseña es demasiado débil. Usá al menos 6 caracteres.";
        } else if (error.code === "auth/requires-recent-login") {
            msg = "Por seguridad, cerrá sesión, volvé a ingresar y reintentá el cambio.";
        }
        return { ok: false, error: msg };
    }
}

/* Marca en las fichas del usuario que ya cambió su clave inicial */
export async function marcarPasswordModificada(ids) {
    const fecha = new Date().toISOString();
    for (const id of (ids || [])) {
        try {
            await updateDoc(doc(db, COLLECTIONS.USUARIOS_SISTEMA, id), { password_modificada: true, fecha_modificacion_password: fecha });
        } catch (e) {
            console.warn("[Docentes] No se pudo registrar el cambio de contraseña en", id, e.code || e);
        }
    }
}

/* Los autorizados leen toda la colección; quien no está en la lista de acceso
   (por ejemplo, un planificador que solo es planificador) solo puede leer su propia ficha. */
async function leerFichas(emailNorm) {
    try {
        const snap = await getDocs(collection(db, COLLECTIONS.USUARIOS_SISTEMA));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
        if (error && error.code === "permission-denied") {
            const snap = await getDocs(query(collection(db, COLLECTIONS.USUARIOS_SISTEMA), where("email", "==", emailNorm)));
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        throw error;
    }
}

export async function consultarPerfil(email) {
    const emailNorm = (email || "").trim().toLowerCase();
    try {
        return armarPerfil(emailNorm, await leerFichas(emailNorm));
    } catch (error) {
        console.warn("[Docentes] No se pudo leer el perfil:", error.code || error);
        const r = armarPerfil(emailNorm, []); // la cuenta de emergencia entra siempre
        if (r.estado === "ok") return r;
        return { estado: error && error.code === "permission-denied" ? "sin_permiso" : "error", perfil: null };
    }
}
