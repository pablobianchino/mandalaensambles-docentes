// =======================================================================
// src/config/constants.js — Portal Docentes
// La versión se cambia en: este archivo (APP_VERSION), version.json, sw.js (CACHE_NAME)
// y los ?v= de index.html. Registro en CAMBIOS_docentes.md.
// =======================================================================

export const APP_VERSION = "v0.1";

/* Mismo proyecto de Firebase que Core, Admisión y Festivales */
export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCgAg2EwTJh4zbMdpkqG3VKTGfDeofblyg",
    authDomain: "priel-mdl-seguimientos.firebaseapp.com",
    projectId: "priel-mdl-seguimientos",
    storageBucket: "priel-mdl-seguimientos.firebasestorage.app",
    messagingSenderId: "118730133451",
    appId: "1:118730133451:web:9e407e81a9b22ae9d0704e"
};

/* Id de esta app en usuarios_sistema.apps_habilitadas (lo da Core) */
export const ID_APP = "docentes";

export const URL_PORTAL_CORE = "https://mandalaensambles-core.vercel.app";

/* Nombre de cada app para "Tus aplicaciones" */
export const NOMBRES_APPS = {
    admision: "Admisión",
    festival: "Festivales",
    docentes: "Docentes"
};

/* Clave inicial de las cuentas nuevas (la misma de todas las apps): no se acepta como clave nueva */
export const CLAVE_INICIAL_DEFECTO = "mandala333";

export const EMAIL_CUENTA_EMERGENCIA = "productora.mandalahouse@gmail.com";

export const COLLECTIONS = {
    USUARIOS_SISTEMA: "usuarios_sistema",
    PROFESORES: "profesores"
};

/* Preferencia "Ver el portal como" (planificador que además es docente) */
export const CLAVE_VISTA_GUARDADA = "mdl_docentes_vista";
