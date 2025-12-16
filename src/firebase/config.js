import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC1ThsFectDjYI4f5eCz0nMKACGAUwdknc",
  authDomain: "cardiac-strainlabs.firebaseapp.com",
  projectId: "cardiac-strainlabs",
  storageBucket: "cardiac-strainlabs.firebasestorage.app",
  messagingSenderId: "23271119955",
  appId: "1:23271119955:web:3e6887063acf6bb8bf7aa6",
  measurementId: "G-GB3YE64BSE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Initialize Firestore
export const db = getFirestore(app);

// Providers for Google and Apple Sign-In
export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');

export default app;

