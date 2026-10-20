// sessionStorage wrapper with an in-memory fallback. `getStorage` may throw.

export function createStore(getStorage) {
  const memory = new Map();
  let persistent = true;

  return {
    get persistent() {
      return persistent;
    },
    read(key, fallback) {
      try {
        const raw = getStorage().getItem(key);
        if (raw !== null) return JSON.parse(raw);
      } catch {
        persistent = false;
      }
      return memory.has(key) ? memory.get(key) : fallback;
    },
    write(key, value) {
      memory.set(key, value);
      try {
        getStorage().setItem(key, JSON.stringify(value));
      } catch {
        persistent = false;
      }
    },
  };
}
