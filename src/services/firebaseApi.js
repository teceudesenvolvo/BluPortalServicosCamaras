import { httpsCallable } from "firebase/functions";
import {
    addDoc,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    startAfter,
    updateDoc,
    where,
    writeBatch,
} from "firebase/firestore";
import {
    EmailAuthProvider,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import {
    deleteObject,
    getDownloadURL,
    ref as storageRef,
    uploadBytes,
} from "firebase/storage";
import { get as getDatabaseValue, ref as databaseRef } from "firebase/database";
import app, {
    auth,
    db,
    firestore,
    functions,
    hasRuntimeFirebaseConfig,
    runtimeFirebaseConfig,
    storage,
} from "../firebase";

export const firebaseApp = app;
export const getApp = () => app;

const projectId = String(runtimeFirebaseConfig?.projectId || "").trim();

/** Resolve Firebase Function URLs for the Firebase project configured at build time. */
export const getFirebaseFunctionsBaseUrl = (region = "us-central1") => {
    const normalizedRegion = String(region || "us-central1").trim();
    if (!/^[a-z0-9-]+$/i.test(normalizedRegion)) {
        throw new Error("A região da Cloud Function é inválida.");
    }
    if (!projectId) {
        throw new Error("O Project ID do Firebase não está configurado.");
    }

    return `https://${normalizedRegion}-${projectId}.cloudfunctions.net`;
};

export const getFirebaseFunctionUrl = (name, region = "us-central1") => {
    const functionName = String(name || "").trim().replace(/^\/+|\/+$/g, "");
    if (!functionName) throw new Error("Informe o nome da Cloud Function.");
    return `${getFirebaseFunctionsBaseUrl(region)}/${functionName}`;
};

export const getFirebaseFirestoreCollectionUrl = (collectionName) => {
    const collectionPath = String(collectionName || "").trim().replace(/^\/+|\/+$/g, "");
    if (!collectionPath) throw new Error("Informe o nome da coleção Firestore.");
    if (!projectId) throw new Error("O Project ID do Firebase não está configurado.");
    return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}`;
};

export const requestFirebaseRest = (url, options = {}) => fetch(url, options);

/** HTTP Cloud Function request; Firebase project and regional host are resolved here. */
export const requestFirebaseFunction = (name, options = {}) => {
    const { region = "us-central1", ...requestOptions } = options;
    return fetch(getFirebaseFunctionUrl(name, region), requestOptions);
};

/** Callable Functions share the same configured Firebase app as Auth and Firestore. */
export const callFirebaseFunction = (name, data = {}, options = {}) =>
    httpsCallable(functions, name, options)(data);

export {
    addDoc,
    arrayUnion,
    auth,
    collection,
    createUserWithEmailAndPassword,
    databaseRef,
    db,
    deleteDoc,
    deleteObject,
    doc,
    EmailAuthProvider,
    firestore,
    getDatabaseValue as get,
    getDoc,
    getDocs,
    getDownloadURL,
    hasRuntimeFirebaseConfig,
    functions,
    limit,
    onAuthStateChanged,
    onSnapshot,
    orderBy,
    query,
    reauthenticateWithCredential,
    runtimeFirebaseConfig,
    runTransaction,
    sendPasswordResetEmail,
    serverTimestamp,
    setDoc,
    signInWithEmailAndPassword,
    signOut,
    startAfter,
    storage,
    storageRef,
    updateDoc,
    uploadBytes,
    where,
    writeBatch,
};
