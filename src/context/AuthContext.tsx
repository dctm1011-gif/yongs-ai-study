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
    try {
      await GoogleSignin.hasPlayServices();
      const { data } = await GoogleSignin.signIn();
      if (!data?.idToken) throw new Error('Google 로그인 토큰 없음');
      await signInWithCredential(auth, GoogleAuthProvider.credential(data.idToken));
    } catch (e: any) {
      if (e?.code !== 'SIGN_IN_CANCELLED') throw e;
    }
  };

  const signOut = async () => {
    try {
      await GoogleSignin.signOut();
      await firebaseSignOut(auth);
    } catch (e) {
      console.error('[AuthContext] signOut error:', e);
    }
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
