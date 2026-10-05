// 注入最小 localStorage 垫片后运行验证（Proxy 保证 Object.keys 可用）。
const createMemoryStorage = () => {
  const map = new Map<string, string>();
  const target = {
    get length() {
      return map.size;
    },
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => map.set(key, String(value)),
    removeItem: (key: string) => map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
  };
  return new Proxy(target, {
    ownKeys: () => [...map.keys()],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    get: (obj, prop) => {
      if (typeof prop === 'string' && map.has(prop)) return map.get(prop);
      return Reflect.get(obj, prop);
    },
  });
};

Object.defineProperty(globalThis, 'localStorage', {
  value: createMemoryStorage(),
  configurable: true,
});

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      randomUUID: () =>
        `uuid_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 10)}`,
    },
    configurable: true,
  });
}

import('./verify-isolation.ts');
