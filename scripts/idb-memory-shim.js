// idb-keyval 的内存版垫片，仅供隔离验证脚本使用。
const store = new Map();

export const get = async (key) => (store.has(key) ? structuredClone(store.get(key)) : undefined);
export const set = async (key, value) => {
  store.set(key, structuredClone(value));
};
export const del = async (key) => {
  store.delete(key);
};
export const keys = async () => [...store.keys()];
export const clear = async () => {
  store.clear();
};
