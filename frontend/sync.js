const SYNC_STATUS = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  FAILED: 'failed'
};

const SyncManager = {
  async queueOperation(entity, operation, payload, meta = {}) {
    const queueItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      entity,
      operation,
      payload: {
        ...payload,
        updated_at: payload.updated_at || new Date().toISOString()
      },
      created_at: new Date().toISOString(),
      attempts: 0,
      status: SYNC_STATUS.PENDING,
      ...meta
    };

    await window.MeuTreinoDB.put('sync_queue', queueItem);
    return queueItem;
  },

  async markSyncState(id, status, attempts = 0) {
    const item = await window.MeuTreinoDB.getById('sync_queue', id);
    if (!item) return;
    item.status = status;
    item.attempts = attempts;
    item.updated_at = new Date().toISOString();
    await window.MeuTreinoDB.put('sync_queue', item);
  },

  async getPendingQueue() {
    const records = await window.MeuTreinoDB.getAll('sync_queue');
    return records.filter((item) => item.status === SYNC_STATUS.PENDING || item.status === SYNC_STATUS.FAILED);
  },

  async processQueue() {
    if (!navigator.onLine) return { synced: 0, queued: 0 };

    const pending = await this.getPendingQueue();
    if (!pending.length) return { synced: 0, queued: 0 };

    const batch = pending.slice(0, 20).map((item) => ({
      id: item.id,
      entity: item.entity,
      operation: item.operation,
      payload: item.payload,
      created_at: item.created_at,
      attempts: item.attempts,
      status: item.status
    }));

    try {
      for (const item of batch) {
        await this.markSyncState(item.id, SYNC_STATUS.SYNCING, (item.attempts || 0) + 1);
      }

      const response = await window.MeuTreinoAPI.sync(batch);

      const allSynced = (response?.synced || 0) === batch.length;
      for (const item of batch) {
        if (allSynced) {
          await window.MeuTreinoDB.delete('sync_queue', item.id);
        } else {
          await this.markSyncState(item.id, SYNC_STATUS.FAILED, (item.attempts || 0) + 1);
        }
      }

      return {
        synced: batch.length,
        queued: pending.length - batch.length
      };
    } catch (error) {
      for (const item of batch) {
        await this.markSyncState(item.id, SYNC_STATUS.FAILED, (item.attempts || 0) + 1);
      }
      return {
        synced: 0,
        queued: pending.length,
        error: error.message
      };
    }
  },

  subscribeToConnectivity() {
    const updateStatus = () => {
      const online = navigator.onLine;
      document.body.dataset.online = online ? 'true' : 'false';
      if (online) {
        this.processQueue().catch(() => undefined);
      }
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
  }
};

window.MeuTreinoSync = SyncManager;
