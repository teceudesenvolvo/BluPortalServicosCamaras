// src/firebase.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { initializeFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

// As chaves são lidas das variáveis de ambiente (arquivo .env.local) para segurança e para garantir que a configuração esteja completa.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta os serviços que iremos usar
export const auth = getAuth(app);

// Inicializa o Firestore com configurações de rede mais robustas para evitar timeouts
export const firestore = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false // Desabilita streams que causam erros de CORS em alguns ambientes
});

export const storage = getStorage(app);

// Exporta a instância do Realtime Database
export const db = getDatabase(app);

// Exporta o app para uso futuro, se necessário
export default app;