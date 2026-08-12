import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "AIzaSyCcjj9YoRJ-DSICbZp9v9JflPcha1kdseo",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "ka-clinic-system.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "ka-clinic-system",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "ka-clinic-system.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1073780714968",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "1:1073780714968:web:84c73168989e685181d6ad"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);