// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC6Ss8AX9YnOJfvRB-TRSKZVdx_Im1hMXE",
  authDomain: "omni-3688d.firebaseapp.com",
  projectId: "omni-3688d",
  storageBucket: "omni-3688d.firebasestorage.app",
  messagingSenderId: "729484483964",
  appId: "1:729484483964:web:145217cb6c5f4a0c1998f9",
  measurementId: "G-485EBWTD5R"
};

// Debug: Check if environment variables are loaded
console.log('Firebase Config:', {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY ? 'Present' : 'Missing',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN ? 'Present' : 'Missing',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID ? 'Present' : 'Missing',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET ? 'Present' : 'Missing',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID ? 'Present' : 'Missing',
  appId: process.env.REACT_APP_FIREBASE_APP_ID ? 'Present' : 'Missing',
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID ? 'Present' : 'Missing'
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// API URL for backend
export const API_URL = "https://omni-backend-1qqz.onrender.com"; 