// src/firebase.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { initializeFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getFunctions } from "firebase/functions";

// Firebase Web SDK config is injected at build time from local env files or
// the Vercel project's Environment Variables. Each deployment can use its own
// Firebase project without changing or committing application source.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL
};

export const runtimeFirebaseConfig = firebaseConfig;
export const firebaseFunctionsRegion = String(
  process.env.REACT_APP_FIREBASE_FUNCTIONS_REGION || 'us-central1',
).trim();
export const hasRuntimeFirebaseConfig = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']
  .every(key => Boolean(String(firebaseConfig[key] || '').trim()));

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta os serviços que iremos usar
export const auth = getAuth(app);

// Detecta automaticamente quando o navegador precisa de long polling. Forçá-lo
// em todos os navegadores gera falhas WebChannel 400 em alguns proxies e CDNs.
export const firestore = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false
});

export const storage = getStorage(app);

// Exporta a instância do Realtime Database
export const db = getDatabase(app);
export const functions = getFunctions(app, firebaseFunctionsRegion);

// Exporta o app para uso futuro, se necessário
export default app;
