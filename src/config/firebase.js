// =======================================================================
// src/config/firebase.js — Inicialización de Firebase (SDK 10.8.1 por CDN, igual que las otras apps)
// =======================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getFirestore, collection, doc, getDoc, getDocs, query, where, updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import {
    getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, signOut,
    onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { FIREBASE_CONFIG } from "./constants.js";

export const app = initializeApp(FIREBASE_CONFIG);
export const db = getFirestore(app);
export const auth = getAuth(app);

export {
    collection, doc, getDoc, getDocs, query, where, updateDoc,
    GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, signOut,
    onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword
};
