import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let cachedDeferredPrompt: BeforeInstallPromptEvent | null = null;
let cachedIsInstalled = false;
let listenersInitialized = false;
const subscribers = new Set<() => void>();

function notifySubscribers() {
  subscribers.forEach((cb) => cb());
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function initGlobalListeners() {
  if (listenersInitialized || typeof window === 'undefined') return;
  listenersInitialized = true;
  cachedIsInstalled = detectStandalone();

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    cachedDeferredPrompt = e as BeforeInstallPromptEvent;
    notifySubscribers();
  });

  window.addEventListener('appinstalled', () => {
    cachedIsInstalled = true;
    cachedDeferredPrompt = null;
    notifySubscribers();
  });
}

if (typeof window !== 'undefined') {
  initGlobalListeners();
}

export function usePWAInstall() {
  const [, setTick] = useState(0);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    initGlobalListeners();
    cachedIsInstalled = detectStandalone();

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));

    const handleChange = () => setTick((t) => t + 1);
    subscribers.add(handleChange);
    handleChange();

    return () => {
      subscribers.delete(handleChange);
    };
  }, []);

  const install = async () => {
    if (!cachedDeferredPrompt) return false;
    const promptEvent = cachedDeferredPrompt;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    cachedDeferredPrompt = null;
    if (outcome === 'accepted') {
      cachedIsInstalled = true;
      notifySubscribers();
      return true;
    }
    notifySubscribers();
    return false;
  };

  return {
    isInstallable: !!cachedDeferredPrompt,
    isInstalled: cachedIsInstalled,
    isIOS,
    isAndroid,
    install,
  };
}
