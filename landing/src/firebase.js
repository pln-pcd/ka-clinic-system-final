import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyCcjj9YoRJ-DSICbZp9v9JflPcha1kdseo",
  authDomain: "ka-clinic-system.firebaseapp.com",
  projectId: "ka-clinic-system",
  storageBucket: "ka-clinic-system.firebasestorage.app",
  messagingSenderId: "1073780714968",
  appId: "1:1073780714968:web:84c73168989e685181d6ad"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app, 'default')
