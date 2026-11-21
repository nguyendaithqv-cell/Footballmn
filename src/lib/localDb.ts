import {
  ActivityLog,
  ArenaChallenge,
  ArenaProfile,
  CareerSave,
  ClubNotificationItem,
  Friendship,
  MarketOverride,
  NewsArticle,
  PushNotificationItem,
  UserProfile,
} from '../types/game';

const DB_NAME = 'touchline_xi_local_v1';
const DB_VERSION = 1;
const SESSION_UID_KEY = 'txi_local_session_uid';

const STORES = {
  ACCOUNTS: 'accounts',
  USERS: 'users',
  CAREERS: 'careers',
  CLUB_NOTIFICATIONS: 'clubNotifications',
  NEWS: 'news',
  NOTIFICATIONS: 'notifications',
  MARKET_OVERRIDES: 'marketOverrides',
  ACTIVITY_LOGS: 'activityLogs',
  ARENA_PROFILES: 'arenaProfiles',
  ARENA_CHALLENGES: 'arenaChallenges',
  FRIENDSHIPS: 'friendships',
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

export interface LocalUser {
  uid: string;
  username: string;
}

interface StoredAccount {
  uid: string;
  username: string;
  usernameLower: string;
  salt: string;
  passwordHash: string;
  createdAt: number;
}

export interface LocalAccountPreview {
  uid: string;
  username: string;
  managerName?: string;
  clubName?: string;
  role?: 'admin' | 'manager';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openLocalDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Trình duyệt không hỗ trợ IndexedDB để lưu dữ liệu cục bộ.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.ACCOUNTS)) {
        const s = db.createObjectStore(STORES.ACCOUNTS, { keyPath: 'uid' });
        s.createIndex('usernameLower', 'usernameLower', { unique: true });
      }
      if (!db.objectStoreNames.contains(STORES.USERS)) {
        db.createObjectStore(STORES.USERS, { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains(STORES.CAREERS)) {
        db.createObjectStore(STORES.CAREERS, { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains(STORES.CLUB_NOTIFICATIONS)) {
        const s = db.createObjectStore(STORES.CLUB_NOTIFICATIONS, { keyPath: 'id' });
        s.createIndex('uid', 'uid', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.NEWS)) {
        db.createObjectStore(STORES.NEWS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.NOTIFICATIONS)) {
        db.createObjectStore(STORES.NOTIFICATIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.MARKET_OVERRIDES)) {
        db.createObjectStore(STORES.MARKET_OVERRIDES, { keyPath: 'playerId' });
      }
      if (!db.objectStoreNames.contains(STORES.ACTIVITY_LOGS)) {
        db.createObjectStore(STORES.ACTIVITY_LOGS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.ARENA_PROFILES)) {
        db.createObjectStore(STORES.ARENA_PROFILES, { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains(STORES.ARENA_CHALLENGES)) {
        db.createObjectStore(STORES.ARENA_CHALLENGES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.FRIENDSHIPS)) {
        db.createObjectStore(STORES.FRIENDSHIPS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Không thể mở cơ sở dữ liệu cục bộ IndexedDB.'));
    };
  });
  return dbPromise;
}

async function idbGet<T>(store: StoreName, key: string): Promise<T | null> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut<T>(store: StoreName, value: T): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function toTimestampMs(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val && typeof (val as { toMillis?: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  return 0;
}

// --- Password Hashing (Web Crypto SHA-256 with pure-JS fallback for plain HTTP LAN testing) ---
function fallbackHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const raw = `${salt}:${password}`;
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    try {
      const encoded = new TextEncoder().encode(raw);
      const digest = await window.crypto.subtle.digest('SHA-256', encoded);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      return fallbackHash(raw);
    }
  }
  return fallbackHash(raw);
}

function makeSalt(): string {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const buf = new Uint8Array(12);
    window.crypto.getRandomValues(buf);
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// --- Local Auth Session & Listeners ---
const authListeners = new Set<(user: LocalUser | null) => void>();

function notifyAuthListeners(user: LocalUser | null): void {
  authListeners.forEach((cb) => cb(user));
}

function getSessionUid(): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(SESSION_UID_KEY) : null;
  } catch {
    return null;
  }
}

function setSessionUid(uid: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (uid) {
      window.localStorage.setItem(SESSION_UID_KEY, uid);
    } else {
      window.localStorage.removeItem(SESSION_UID_KEY);
    }
  } catch {
    // Ignore storage quota / privacy mode issues
  }
}

export async function getCurrentLocalUser(): Promise<LocalUser | null> {
  const uid = getSessionUid();
  if (!uid) return null;
  try {
    const acc = await idbGet<StoredAccount>(STORES.ACCOUNTS, uid);
    if (!acc) {
      setSessionUid(null);
      return null;
    }
    return { uid: acc.uid, username: acc.username };
  } catch {
    return null;
  }
}

export function subscribeLocalAuth(cb: (user: LocalUser | null) => void): () => void {
  authListeners.add(cb);
  void getCurrentLocalUser().then((u) => cb(u));
  return () => {
    authListeners.delete(cb);
  };
}

export async function registerLocalAccount(
  rawUsername: string,
  password: string
): Promise<LocalUser> {
  const username = rawUsername.trim();
  if (username.length < 2 || username.length > 40) {
    throw new Error('Tên tài khoản phải từ 2 đến 40 ký tự.');
  }
  if (password.length < 4) {
    throw new Error('Mật khẩu cần tối thiểu 4 ký tự.');
  }

  const usernameLower = username.toLowerCase();
  const existing = await idbGetAll<StoredAccount>(STORES.ACCOUNTS);
  if (existing.some((a) => a.usernameLower === usernameLower)) {
    throw new Error('Tên tài khoản này đã tồn tại trên thiết bị. Hãy chuyển sang tab Đăng nhập.');
  }

  const uid = `loc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const salt = makeSalt();
  const passwordHash = await hashPassword(password, salt);

  const account: StoredAccount = {
    uid,
    username,
    usernameLower,
    salt,
    passwordHash,
    createdAt: Date.now(),
  };

  await idbPut(STORES.ACCOUNTS, account);
  setSessionUid(uid);
  const localUser: LocalUser = { uid, username };
  notifyAuthListeners(localUser);
  return localUser;
}

export async function loginLocalAccount(
  rawUsername: string,
  password: string
): Promise<LocalUser> {
  const usernameLower = rawUsername.trim().toLowerCase();
  if (!usernameLower || !password) {
    throw new Error('Vui lòng nhập đầy đủ Tên tài khoản và Mật khẩu.');
  }

  const accounts = await idbGetAll<StoredAccount>(STORES.ACCOUNTS);
  const found = accounts.find((a) => a.usernameLower === usernameLower);
  if (!found) {
    throw new Error('Không tìm thấy tài khoản này trên thiết bị. Hãy kiểm tra lại tên hoặc tạo tài khoản mới.');
  }

  const candidateHash = await hashPassword(password, found.salt);
  if (candidateHash !== found.passwordHash) {
    throw new Error('Mật khẩu chưa chính xác.');
  }

  setSessionUid(found.uid);
  const localUser: LocalUser = { uid: found.uid, username: found.username };
  notifyAuthListeners(localUser);
  return localUser;
}

export function logoutLocalAccount(): void {
  setSessionUid(null);
  notifyAuthListeners(null);
}

export async function listLocalAccountPreviews(): Promise<LocalAccountPreview[]> {
  try {
    const [accounts, users] = await Promise.all([
      idbGetAll<StoredAccount>(STORES.ACCOUNTS),
      idbGetAll<UserProfile>(STORES.USERS),
    ]);
    const userMap = new Map(users.map((u) => [u.uid, u]));
    return accounts
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((a) => {
        const prof = userMap.get(a.uid);
        return {
          uid: a.uid,
          username: a.username,
          managerName: prof?.managerName,
          clubName: prof?.clubName,
          role: prof?.role,
        };
      });
  } catch {
    return [];
  }
}

export async function shouldBeInitialAdmin(username: string): Promise<boolean> {
  if (username.trim().toLowerCase() === 'admin') return true;
  const users = await idbGetAll<UserProfile>(STORES.USERS);
  return !users.some((u) => u.role === 'admin');
}

// --- Users ---
export async function getLocalUserProfile(uid: string): Promise<UserProfile | null> {
  return idbGet<UserProfile>(STORES.USERS, uid);
}

export async function putLocalUserProfile(profile: UserProfile): Promise<void> {
  await idbPut(STORES.USERS, profile);
}

export async function updateLocalUserProfile(
  uid: string,
  patch: Partial<UserProfile>
): Promise<UserProfile | null> {
  const existing = await getLocalUserProfile(uid);
  if (!existing) return null;
  const updated: UserProfile = {
    ...existing,
    ...patch,
    uid: existing.uid,
    updatedAt: Date.now(),
  };
  await putLocalUserProfile(updated);
  return updated;
}

export async function listLocalUsers(): Promise<UserProfile[]> {
  const users = await idbGetAll<UserProfile>(STORES.USERS);
  return users.sort((a, b) => toTimestampMs(b.updatedAt) - toTimestampMs(a.updatedAt));
}

// --- Careers ---
export async function getLocalCareer(uid: string): Promise<CareerSave | null> {
  return idbGet<CareerSave>(STORES.CAREERS, uid);
}

export async function putLocalCareer(career: CareerSave): Promise<void> {
  await idbPut(STORES.CAREERS, {
    ...career,
    updatedAt: Date.now(),
  });
}

// --- Club Notifications ---
export async function listLocalClubNotifications(
  uid: string,
  maxItems = 25
): Promise<ClubNotificationItem[]> {
  const all = await idbGetAll<ClubNotificationItem>(STORES.CLUB_NOTIFICATIONS);
  return all
    .filter((item) => item.uid === uid)
    .sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt))
    .slice(0, maxItems);
}

export async function putLocalClubNotification(item: ClubNotificationItem): Promise<void> {
  await idbPut(STORES.CLUB_NOTIFICATIONS, {
    ...item,
    createdAt: toTimestampMs(item.createdAt) || Date.now(),
  });
}

export async function deleteLocalClubNotification(id: string): Promise<void> {
  await idbDelete(STORES.CLUB_NOTIFICATIONS, id);
}

// --- News ---
export async function listLocalNews(maxItems = 25): Promise<NewsArticle[]> {
  const all = await idbGetAll<NewsArticle>(STORES.NEWS);
  return all
    .sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt))
    .slice(0, maxItems);
}

export async function putLocalNews(article: NewsArticle): Promise<void> {
  await idbPut(STORES.NEWS, {
    ...article,
    createdAt: toTimestampMs(article.createdAt) || Date.now(),
    updatedAt: Date.now(),
  });
}

export async function deleteLocalNews(id: string): Promise<void> {
  await idbDelete(STORES.NEWS, id);
}

// --- System Push Notifications ---
export async function listLocalNotifications(maxItems = 20): Promise<PushNotificationItem[]> {
  const all = await idbGetAll<PushNotificationItem>(STORES.NOTIFICATIONS);
  return all
    .sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt))
    .slice(0, maxItems);
}

export async function putLocalNotification(item: PushNotificationItem): Promise<void> {
  await idbPut(STORES.NOTIFICATIONS, {
    ...item,
    createdAt: toTimestampMs(item.createdAt) || Date.now(),
  });
}

export async function deleteLocalNotification(id: string): Promise<void> {
  await idbDelete(STORES.NOTIFICATIONS, id);
}

// --- Market Overrides ---
export async function listLocalMarketOverrides(): Promise<Record<string, MarketOverride>> {
  const all = await idbGetAll<MarketOverride>(STORES.MARKET_OVERRIDES);
  const map: Record<string, MarketOverride> = {};
  all.forEach((item) => {
    map[item.playerId] = item;
  });
  return map;
}

export async function putLocalMarketOverride(override: MarketOverride): Promise<void> {
  await idbPut(STORES.MARKET_OVERRIDES, {
    ...override,
    updatedAt: Date.now(),
  });
}

// --- Activity Logs ---
export async function listLocalActivityLogs(maxItems = 40): Promise<ActivityLog[]> {
  const all = await idbGetAll<ActivityLog>(STORES.ACTIVITY_LOGS);
  return all
    .sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt))
    .slice(0, maxItems);
}

export async function putLocalActivityLog(log: ActivityLog): Promise<void> {
  await idbPut(STORES.ACTIVITY_LOGS, {
    ...log,
    createdAt: toTimestampMs(log.createdAt) || Date.now(),
  });
}

// --- Arena Profiles ---
export async function listLocalArenaProfiles(): Promise<ArenaProfile[]> {
  return idbGetAll<ArenaProfile>(STORES.ARENA_PROFILES);
}

export async function getLocalArenaProfile(uid: string): Promise<ArenaProfile | null> {
  return idbGet<ArenaProfile>(STORES.ARENA_PROFILES, uid);
}

export async function putLocalArenaProfile(profile: ArenaProfile): Promise<void> {
  await idbPut(STORES.ARENA_PROFILES, {
    ...profile,
    visibility: 'public',
    updatedAt: Date.now(),
  });
}

// --- Arena Challenges ---
export async function listLocalArenaChallenges(uid: string): Promise<ArenaChallenge[]> {
  const all = await idbGetAll<ArenaChallenge>(STORES.ARENA_CHALLENGES);
  return all
    .filter((c) => Array.isArray(c.participants) && c.participants.includes(uid))
    .sort(
      (a, b) =>
        (toTimestampMs(b.updatedAt) || toTimestampMs(b.createdAt)) -
        (toTimestampMs(a.updatedAt) || toTimestampMs(a.createdAt))
    )
    .slice(0, 30);
}

export async function putLocalArenaChallenge(challenge: ArenaChallenge): Promise<void> {
  await idbPut(STORES.ARENA_CHALLENGES, {
    ...challenge,
    createdAt: toTimestampMs(challenge.createdAt) || Date.now(),
    updatedAt: Date.now(),
  });
}

export async function updateLocalArenaChallenge(
  id: string,
  patch: Partial<ArenaChallenge>
): Promise<ArenaChallenge | null> {
  const existing = await idbGet<ArenaChallenge>(STORES.ARENA_CHALLENGES, id);
  if (!existing) return null;
  const updated: ArenaChallenge = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };
  await idbPut(STORES.ARENA_CHALLENGES, updated);
  return updated;
}

// --- Friendships ---
export async function listLocalFriendships(uid: string): Promise<Friendship[]> {
  const all = await idbGetAll<Friendship>(STORES.FRIENDSHIPS);
  return all
    .filter((f) => Array.isArray(f.participants) && f.participants.includes(uid))
    .sort(
      (a, b) =>
        (toTimestampMs(b.updatedAt) || toTimestampMs(b.createdAt)) -
        (toTimestampMs(a.updatedAt) || toTimestampMs(a.createdAt))
    )
    .slice(0, 40);
}

export async function putLocalFriendship(friendship: Friendship): Promise<void> {
  await idbPut(STORES.FRIENDSHIPS, {
    ...friendship,
    createdAt: toTimestampMs(friendship.createdAt) || Date.now(),
    updatedAt: Date.now(),
  });
}

export async function updateLocalFriendship(
  id: string,
  patch: Partial<Friendship>
): Promise<Friendship | null> {
  const existing = await idbGet<Friendship>(STORES.FRIENDSHIPS, id);
  if (!existing) return null;
  const updated: Friendship = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };
  await idbPut(STORES.FRIENDSHIPS, updated);
  return updated;
}

export async function deleteLocalFriendship(id: string): Promise<void> {
  await idbDelete(STORES.FRIENDSHIPS, id);
}
