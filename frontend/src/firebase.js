// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase web app configuration.
// NOTE: Firebase web API keys are public identifiers, not secrets — they are
// safe to ship in client bundles and are protected by Firebase Security Rules
// (see storage.rules) and Firestore rules, not by key secrecy. They are read
// from environment variables here so the project can be pointed at a different
// Firebase project without code changes. Copy .env.example to .env and fill in.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// URL of the Express backend. Override per-environment via REACT_APP_API_URL.
export const API_URL =
  process.env.REACT_APP_API_URL || "http://localhost:3001";