import React, { createContext, useContext, useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithCredential, signOut as firebaseSignOut, User } from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { getFirebaseApp } from '../config/firebase';

// Firebase Console → Authentication → Sign-in method → Google → 웹 클라이언트 ID
const WEB_CLIENT_ID = '452033348410-9ddifqme5shqt3hh3ade0j815058glpj.apps.googleusercontent.com';

GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const auth = getAuth(getFirebaseApp());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    await GoogleSignin.hasPlayServices();
    const { data } = await GoogleSignin.signIn();
    const credential = GoogleAuthProvider.credential(data?.idToken ?? null);
    await signInWithCredential(auth, credential);
  };

  const signOut = async () => {
    await GoogleSignin.signOut();
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
