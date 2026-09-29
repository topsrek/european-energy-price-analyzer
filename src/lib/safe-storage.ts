const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const safeStorageGetItem = (key: string): string | null => {
  const storage = getStorage();
  if (!storage) return null;

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

export const safeStorageSetItem = (key: string, value: string): boolean => {
  const storage = getStorage();
  if (!storage) return false;

  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};
