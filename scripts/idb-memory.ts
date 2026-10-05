// 运行时验证：用内存版 localStorage / idb-keyval 跑通迁移、作用域隔离、会话与并发提交。
// 通过 esbuild 别名把 idb-keyval 指向本文件。
const memory = new Map<string, unknown>();

export const get = async <T>(key: string): Promise<T | undefined> => memory.get(key) as T | undefined;
export const set = async (key: string, value: unknown): Promise<void> => {
  memory.set(key, value);
};
export const del = async (key: string): Promise<void> => {
  memory.delete(key);
};
export const keys = async (): Promise<IDBValidKey[]> => [...memory.keys()];
export const clear = async (): Promise<void> => {
  memory.clear();
};
