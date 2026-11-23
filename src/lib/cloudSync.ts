import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  ClubBackupBundle,
  parseAndValidateBackup,
  summarizeBackupBundle,
} from './backupEngine';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
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

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const cloudDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const cloudAuth = getAuth(app);

let connectionChecked = false;

export async function testCloudConnection(): Promise<void> {
  if (connectionChecked) return;
  connectionChecked = true;
  try {
    await getDocFromServer(doc(cloudDb, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Không thể kết nối Firestore Cloud Sync:', error.message);
    }
  }
}

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: cloudAuth.currentUser?.uid,
      email: cloudAuth.currentUser?.email,
      emailVerified: cloudAuth.currentUser?.emailVerified,
      isAnonymous: cloudAuth.currentUser?.isAnonymous,
      tenantId: cloudAuth.currentUser?.tenantId,
      providerInfo:
        cloudAuth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(errInfo.error || 'Lỗi đồng bộ đám mây Firestore.');
}

export function subscribeCloudAuth(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(cloudAuth, cb);
}

export async function signInCloudGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(cloudAuth, provider);
  await testCloudConnection();
  return cred.user;
}

export async function signOutCloudGoogle(): Promise<void> {
  await signOut(cloudAuth);
}

export interface CloudBackupMeta {
  clubId: string;
  clubName: string;
  managerName: string;
  season: string;
  matchweek: number;
  syncedAtIso: string;
}

export async function pushBackupToCloud(
  bundle: ClubBackupBundle
): Promise<{ ok: boolean; message: string; meta?: CloudBackupMeta }> {
  const user = cloudAuth.currentUser;
  if (!user) {
    return { ok: false, message: 'Vui lòng đăng nhập Google để đồng bộ đám mây.' };
  }

  const payloadJson = JSON.stringify(bundle);
  if (payloadJson.length > 900_000) {
    return {
      ok: false,
      message: 'Dữ liệu save vượt quá giới hạn 900KB của đám mây. Hãy xuất file JSON thủ công.',
    };
  }

  const summary = summarizeBackupBundle(bundle);
  const path = `clubBackups/${user.uid}`;
  const docRef = doc(cloudDb, 'clubBackups', user.uid);
  const syncedAtIso = new Date().toISOString();

  try {
    await setDoc(docRef, {
      uid: user.uid,
      clubId: summary.clubId.slice(0, 64),
      clubName: summary.clubName.slice(0, 80),
      managerName: summary.managerName.slice(0, 60),
      season: summary.season.slice(0, 16),
      matchweek: Math.max(1, Math.min(80, Math.round(summary.matchweek))),
      payloadJson,
      updatedAt: serverTimestamp(),
    });
    return {
      ok: true,
      message: `Đã đồng bộ "${summary.clubName} (${summary.season} - Vòng ${summary.matchweek})" lên đám mây thành công!`,
      meta: {
        clubId: summary.clubId,
        clubName: summary.clubName,
        managerName: summary.managerName,
        season: summary.season,
        matchweek: summary.matchweek,
        syncedAtIso,
      },
    };
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch (wrapped) {
      return {
        ok: false,
        message: wrapped instanceof Error ? wrapped.message : 'Đồng bộ lên đám mây thất bại.',
      };
    }
  }
}

export async function pullBackupFromCloud(): Promise<{
  ok: boolean;
  message: string;
  bundle?: ClubBackupBundle;
}> {
  const user = cloudAuth.currentUser;
  if (!user) {
    return { ok: false, message: 'Vui lòng đăng nhập Google để tải dữ liệu đám mây.' };
  }

  const path = `clubBackups/${user.uid}`;
  const docRef = doc(cloudDb, 'clubBackups', user.uid);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return {
        ok: false,
        message: 'Tài khoản Google này chưa có bản lưu đám mây nào.',
      };
    }
    const data = snap.data() as { payloadJson?: unknown };
    if (typeof data?.payloadJson !== 'string') {
      return { ok: false, message: 'Dữ liệu bản lưu đám mây không hợp lệ.' };
    }
    const parsed = parseAndValidateBackup(data.payloadJson);
    if (!parsed.ok) {
      return { ok: false, message: parsed.error };
    }
    return {
      ok: true,
      message: `Đã tải bản lưu "${parsed.summary.clubName} (${parsed.summary.season} · Vòng ${parsed.summary.matchweek})" từ đám mây!`,
      bundle: parsed.bundle,
    };
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.GET, path);
    } catch (wrapped) {
      return {
        ok: false,
        message: wrapped instanceof Error ? wrapped.message : 'Tải dữ liệu từ đám mây thất bại.',
      };
    }
  }
}

export async function peekCloudBackupMeta(): Promise<CloudBackupMeta | null> {
  const user = cloudAuth.currentUser;
  if (!user) return null;
  try {
    const snap = await getDoc(doc(cloudDb, 'clubBackups', user.uid));
    if (!snap.exists()) return null;
    const d = snap.data() as {
      clubId?: string;
      clubName?: string;
      managerName?: string;
      season?: string;
      matchweek?: number;
      updatedAt?: { toMillis?: () => number };
    };
    const ms = typeof d.updatedAt?.toMillis === 'function' ? d.updatedAt.toMillis() : Date.now();
    return {
      clubId: d.clubId || 'club',
      clubName: d.clubName || 'CLB',
      managerName: d.managerName || 'HLV',
      season: d.season || '2026/27',
      matchweek: d.matchweek || 1,
      syncedAtIso: new Date(ms).toISOString(),
    };
  } catch {
    return null;
  }
}
