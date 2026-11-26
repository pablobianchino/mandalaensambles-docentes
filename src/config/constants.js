// =======================================================================
// src/config/constants.js — Portal Docentes
// La versión se cambia en: este archivo (APP_VERSION), version.json, sw.js (CACHE_NAME)
// y los ?v= de index.html. Registro en CAMBIOS_docentes.md.
// =======================================================================

export const APP_VERSION = "v0.5";

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
    PROFESORES: "profesores",
    CONFIGURACION: "configuracion",  // doc "general": aulas, baterías, ícono de batería, calendario general (lo edita Admisión); doc "docentes": plantillas de mensajes
    MOVIMIENTOS: "docentes_movimientos" // v0.4: suplencias (y después recuperos)
};

/* Script de Google "API Calendario Mandala Ensambles" (el mismo de Admisión y Festivales).
   v0.2 solo usa getEvents (lectura). */
export const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx033Es_BuZJk5x0MmyV-u8foA58ENNl1K3Cv-BE6ZeguXCG62UIQl5H4v94EB7MT0/exec";
export const SCRIPT_API_KEY = "mandala-seg-2026";

/* Valores por defecto si configuracion/general no los tiene (mismos que Admisión) */
export const CONFIG_DEFECTO = {
    calendario_por_defecto: EMAIL_CUENTA_EMERGENCIA,
    cantidad_aulas: 3,
    cantidad_baterias: 2,
    identificador_bateria: "🥁"
};

/* Calendarios que no cuentan para la ocupación de aulas (mismo criterio que Admisión: calExcluidos) */
export const CALENDARIOS_EXCLUIDOS_AULAS = ["pablobianchino@gmail.com"];

/* Límite para navegar hacia adelante: un año desde hoy (decisión 6.2 del plan) */
export const DIAS_LIMITE_ADELANTE = 365;

/* Preferencia "Ver el portal como" (planificador que además es docente) */
export const CLAVE_VISTA_GUARDADA = "mdl_docentes_vista";
