import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { ApiTokenRecord, AuthUser } from './services/api';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const TERMINAL_STATUSES = new Set(['Completed', 'Cancelled', 'Skipped', 'NoShow']);

function sanitizeString(value: string | undefined, maxLength: number, fallback = ''): string {
  const trimmed = (value || fallback).trim();
  return trimmed.slice(0, maxLength);
}

export async function syncUserToFirestore(
  firebaseUser: FirebaseUser,
  appUser: AuthUser
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== firebaseUser.uid) return;
  if (!VALID_ID_REGEX.test(firebaseUser.uid) || firebaseUser.uid.length > 128) return;

  const userPath = `users/${firebaseUser.uid}`;
  const userRef = doc(db, 'users', firebaseUser.uid);

  const displayName = sanitizeString(
    appUser.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0],
    120,
    'SmartQueue User'
  );
  const rawPhoto = appUser.profilePhoto || firebaseUser.photoURL || '';
  const photoURL = rawPhoto && !rawPhoto.startsWith('data:') ? sanitizeString(rawPhoto, 2048) : '';

  try {
    const existingSnap = await getDoc(userRef);
    if (!existingSnap.exists()) {
      const normalizedEmail = firebaseUser.email?.toLowerCase() || '';
      const isOwnerAdmin =
        (normalizedEmail === 'shahsikarnann@gmail.com' ||
          normalizedEmail === 'nallashashikaran42@gmail.com') &&
        firebaseUser.emailVerified &&
        appUser.role === 'admin';

      const payload: Record<string, unknown> = {
        uid: firebaseUser.uid,
        displayName,
        role: isOwnerAdmin ? 'admin' : 'citizen',
        accountStatus: 'active',
        trustScore: isOwnerAdmin ? 100 : 95,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (photoURL) {
        payload.photoURL = photoURL;
      }
      await setDoc(userRef, payload);
    } else {
      const updatePayload: Record<string, unknown> = {
        displayName,
        updatedAt: serverTimestamp(),
      };
      if (photoURL) {
        updatePayload.photoURL = photoURL;
      }
      await updateDoc(userRef, updatePayload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  const privatePath = `users/${firebaseUser.uid}/private/info`;
  const privateRef = doc(db, 'users', firebaseUser.uid, 'private', 'info');
  try {
    const existingPrivate = await getDoc(privateRef);
    const phone = sanitizeString(appUser.phone, 32);
    if (!existingPrivate.exists()) {
      const email = sanitizeString(firebaseUser.email || appUser.email, 254);
      if (email.length >= 3) {
        const privatePayload: Record<string, unknown> = {
          uid: firebaseUser.uid,
          email,
          updatedAt: serverTimestamp(),
        };
        if (phone) {
          privatePayload.phone = phone;
        }
        await setDoc(privateRef, privatePayload);
      }
    } else if (phone) {
      await updateDoc(privateRef, {
        phone,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privatePath);
  }
}

export async function syncTicketToFirestore(
  uid: string,
  token: ApiTokenRecord,
  facilityName: string
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  if (
    !VALID_ID_REGEX.test(uid) ||
    !VALID_ID_REGEX.test(token.tokenId) ||
    !VALID_ID_REGEX.test(token.facilityId) ||
    !VALID_ID_REGEX.test(token.queueId)
  ) {
    return;
  }

  const ticketPath = `users/${uid}/tickets/${token.tokenId}`;
  const ticketRef = doc(db, 'users', uid, 'tickets', token.tokenId);

  try {
    const existingSnap = await getDoc(ticketRef);
    if (!existingSnap.exists()) {
      if (token.status !== 'Waiting') return;
      await setDoc(ticketRef, {
        tokenId: sanitizeString(token.tokenId, 64),
        uid,
        facilityId: sanitizeString(token.facilityId, 64),
        facilityName: sanitizeString(facilityName, 120, 'Service Center'),
        queueId: sanitizeString(token.queueId, 64),
        queueName: sanitizeString(token.queueName, 120, 'Queue'),
        status: token.status,
        joinedAt: sanitizeString(token.joinedAt, 64, 'Just now'),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const prevStatus = existingSnap.data()?.status as string | undefined;
      if (prevStatus && TERMINAL_STATUSES.has(prevStatus)) {
        return;
      }
      if (prevStatus !== token.status) {
        await updateDoc(ticketRef, {
          status: token.status,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, ticketPath);
  }
}

export interface FirestoreTicketItem {
  tokenId: string;
  facilityName: string;
  queueName: string;
  status: string;
  joinedAt: string;
}

export function subscribeToUserTickets(
  uid: string,
  onTickets: (tickets: FirestoreTicketItem[]) => void
): Unsubscribe {
  const path = `users/${uid}/tickets`;
  const q = query(collection(db, 'users', uid, 'tickets'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          tokenId: String(data.tokenId || d.id),
          facilityName: String(data.facilityName || ''),
          queueName: String(data.queueName || ''),
          status: String(data.status || 'Waiting'),
          joinedAt: String(data.joinedAt || ''),
        };
      });
      onTickets(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
