import admin from 'firebase-admin';

// 門弟アプリ(ksvox-montei)と同じFirebaseを使う
export function getAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID || 'ksvox-montei',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/^"|"$/g, '').replace(/\\n/g, '\n')
      })
    });
  }
  return admin;
}
export const db = () => getAdmin().firestore();
export const SONGS = 'singflex_songs';
