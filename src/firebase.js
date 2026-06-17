import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            'AIzaSyD3oKmVZVzG9w6W7xMhl-fG4lOUdwT-GdM',
  authDomain:        'starmapper-d935e.firebaseapp.com',
  projectId:         'starmapper-d935e',
  storageBucket:     'starmapper-d935e.appspot.com',
  messagingSenderId: '705907604480',
  appId:             '1:705907604480:web:77ed0f2b2c1fc70dd2ace5',
}

const app = initializeApp(firebaseConfig)
export const db      = getFirestore(app)
export const storage = getStorage(app)
