import { getDatabase, ref, DatabaseReference } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';

// Global-only data store: uid is kept for backward compatibility but not used in paths
// All user data is stored globally since there's only one user
export function userRef(_uid: string, path: string): DatabaseReference {
  return ref(getDatabase(getFirebaseApp()), path);
}
