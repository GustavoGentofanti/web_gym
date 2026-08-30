const DB_NAME = 'meu_treino_db';
const DB_VERSION = 1;

const STORE_DEFS = {
  users: { keyPath: 'id' },
  exercises: { keyPath: 'id' },
  routines: { keyPath: 'id' },
  routine_exercises: { keyPath: 'id' },
  workout_sessions: { keyPath: 'id' },
  workout_logs: { keyPath: 'id' },
  sync_queue: { keyPath: 'id' },
  settings: { keyPath: 'key' }
};

const DB = {
  db: null,

  async open() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        Object.entries(STORE_DEFS).forEach(([storeName, config]) => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, config);
            if (storeName === 'users') {
              store.createIndex('email', 'email', { unique: true });
            }
            if (storeName === 'exercises') {
              store.createIndex('user_id', 'user_id', { unique: false });
              store.createIndex('name', 'name', { unique: false });
            }
            if (storeName === 'routines') {
              store.createIndex('user_id', 'user_id', { unique: false });
            }
            if (storeName === 'routine_exercises') {
              store.createIndex('routine_id', 'routine_id', { unique: false });
              store.createIndex('exercise_id', 'exercise_id', { unique: false });
            }
            if (storeName === 'workout_sessions') {
              store.createIndex('user_id', 'user_id', { unique: false });
              store.createIndex('status', 'status', { unique: false });
            }
            if (storeName === 'workout_logs') {
              store.createIndex('session_id', 'session_id', { unique: false });
              store.createIndex('exercise_id', 'exercise_id', { unique: false });
              store.createIndex('user_id', 'user_id', { unique: false });
            }
            if (storeName === 'sync_queue') {
              store.createIndex('status', 'status', { unique: false });
              store.createIndex('entity', 'entity', { unique: false });
            }
          }
        });
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = () => reject(request.error);
    });
  },

  async transaction(storeNames, mode = 'readonly', callback) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      const result = callback(tx);

      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  async getAll(storeName) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  async getById(storeName, id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },

  async put(storeName, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const request = tx.objectStore(storeName).put(value);
      request.onsuccess = () => resolve(value);
      request.onerror = () => reject(request.error);
    });
  },

  async add(storeName, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const request = tx.objectStore(storeName).add(value);
      request.onsuccess = () => resolve(value);
      request.onerror = () => reject(request.error);
    });
  },

  async delete(storeName, id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const request = tx.objectStore(storeName).delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  async clearStore(storeName) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const request = tx.objectStore(storeName).clear();
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  async getByIndex(storeName, indexName, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).index(indexName).getAll(value);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  async saveSettings(key, value) {
    await this.put('settings', { key, value, updated_at: new Date().toISOString() });
  },

  async getSettings(key) {
    const record = await this.getById('settings', key);
    return record ? record.value : null;
  },

  async getUserData(userId, storeName) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result || [];
        const filtered = storeName === 'users'
          ? records.filter((item) => item.id === userId)
          : records.filter((item) => item.user_id === userId);
        resolve(filtered);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async seedDefaultState() {
    const existing = await this.getAll('settings');
    if (existing.some((item) => item.key === 'app_initialized')) return;

    await this.saveSettings('app_initialized', true);
    await this.saveSettings('theme', 'dark');
    await this.saveSettings('last_sync_at', null);
  }
};

window.MeuTreinoDB = DB;

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.MeuTreinoDB.seedDefaultState().catch(() => undefined);
  });
}
