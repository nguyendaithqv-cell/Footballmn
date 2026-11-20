import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Persist ONLY authentication login state on user device; all game data lives in Firestore.
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Auth persistence setup notice:', err);
});

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

export const FIRESTORE_QUOTA_UPGRADE_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;

const QUOTA_SESSION_KEY = 'txi_firestore_quota_utc_day';
const getUtcDay = () => new Date().toISOString().slice(0, 10);

let quotaExceededFlag = (() => {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(QUOTA_SESSION_KEY) === getUtcDay();
  } catch {
    return false;
  }
})();
const quotaListeners = new Set<(exceeded: boolean) => void>();

export function hasFirestoreQuotaExceeded(): boolean {
  return quotaExceededFlag;
}

export function subscribeFirestoreQuota(listener: (exceeded: boolean) => void): () => void {
  quotaListeners.add(listener);
  listener(quotaExceededFlag);
  return () => {
    quotaListeners.delete(listener);
  };
}

export function markFirestoreQuotaExceeded(): void {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(QUOTA_SESSION_KEY, getUtcDay());
    }
  } catch {
    // Ignore storage access restrictions
  }
  if (!quotaExceededFlag) {
    quotaExceededFlag = true;
    quotaListeners.forEach((fn) => fn(true));
  }
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  if (code === 'resource-exhausted') return true;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('resource-exhausted') ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('Quota exceeded') ||
    msg.includes('Free daily write units') ||
    msg.includes('Free daily read units')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  if (isQuotaExceededError(error)) {
    markFirestoreQuotaExceeded();
    console.warn(`Firestore Quota Exceeded (${operationType} at ${path ?? 'unknown'})`);
    return;
  }

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
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (isQuotaExceededError(error)) {
      markFirestoreQuotaExceeded();
      return false;
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firebase connection failed: client is offline.');
      return false;
    }
    // Permission denied means server responded cleanly.
    return true;
  }
}

testConnection();
