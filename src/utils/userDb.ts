import { getDatabase, ref, DatabaseReference } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';

export function userRef(uid: string, path: string): DatabaseReference {
  return ref(getDatabase(getFirebaseApp()), `users/${uid}/${path}`);
}
