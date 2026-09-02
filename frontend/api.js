const API_BASE_URL = window.API_BASE_URL || 'http://localhost:8000';

class ApiClient {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  getToken() {
    return localStorage.getItem('meutreino_token');
  }

  setToken(token) {
    if (token) {
      localStorage.setItem('meutreino_token', token);
    } else {
      localStorage.removeItem('meutreino_token');
    }
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const contentType = response.headers.get('content-type') || '';
    const rawPayload = await response.text();
    const payload = !rawPayload
      ? null
      : contentType.includes('application/json')
        ? JSON.parse(rawPayload)
        : rawPayload;

    if (!response.ok) {
      const message = typeof payload === 'string' ? payload : (payload.detail || 'Erro ao acessar a API.');
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  authHeaders() {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async mutation(path, method, payload, entity, operation = method === 'POST' ? 'create' : 'update') {
    try {
      return await this.request(path, {
        method,
        headers: this.authHeaders(),
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (navigator.onLine && error.message !== 'Failed to fetch') throw error;
      const queuedPayload = { ...payload, id: payload.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`) };
      await window.MeuTreinoDB.put(entity === 'exercise' ? 'exercises' : entity === 'routine' ? 'routines' : entity === 'workout_session' ? 'workout_sessions' : 'workout_logs', queuedPayload);
      await window.MeuTreinoSync.queueOperation(entity, operation, queuedPayload);
      return queuedPayload;
    }
  }

  async register({ name, email, password }) {
    const result = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });

    if (result.access_token) {
      this.setToken(result.access_token);
    }

    return result;
  }

  async login({ email, password }) {
    const result = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (result.access_token) {
      this.setToken(result.access_token);
    }

    return result;
  }

  async logout() {
    try {
      await this.request('/api/auth/logout', {
        method: 'POST',
        headers: this.authHeaders()
      });
    } finally {
      this.setToken(null);
    }
  }

  async me() {
    return this.request('/api/auth/me', {
      method: 'GET',
      headers: this.authHeaders()
    });
  }

  async getExercises(query = '') {
    const url = query ? `/api/exercises?q=${encodeURIComponent(query)}` : '/api/exercises';
    return this.request(url, {
      method: 'GET',
      headers: this.authHeaders()
    });
  }

  async createExercise(payload) {
    return this.mutation('/api/exercises', 'POST', payload, 'exercise');
  }

  async updateExercise(exerciseId, payload) {
    return this.request(`/api/exercises/${exerciseId}`, {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify(payload)
    });
  }

  async deleteExercise(exerciseId) {
    return this.request(`/api/exercises/${exerciseId}`, {
      method: 'DELETE',
      headers: this.authHeaders()
    });
  }

  async getRoutines() {
    return this.request('/api/routines', {
      method: 'GET',
      headers: this.authHeaders()
    });
  }

  async createRoutine(payload) {
    return this.mutation('/api/routines', 'POST', payload, 'routine');
  }

  async updateRoutine(routineId, payload) {
    return this.request(`/api/routines/${routineId}`, {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify(payload)
    });
  }

  async deleteRoutine(routineId) {
    return this.request(`/api/routines/${routineId}`, {
      method: 'DELETE',
      headers: this.authHeaders()
    });
  }

  async getWorkouts() {
    return this.request('/api/workouts', {
      method: 'GET',
      headers: this.authHeaders()
    });
  }

  async createWorkout(payload) {
    return this.mutation('/api/workouts', 'POST', payload, 'workout_session');
  }

  async updateWorkout(sessionId, payload) {
    return this.request(`/api/workouts/${sessionId}`, {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify(payload)
    });
  }

  async deleteWorkout(sessionId) {
    return this.request(`/api/workouts/${sessionId}`, {
      method: 'DELETE',
      headers: this.authHeaders()
    });
  }

  async getWorkoutLogs(sessionId) {
    return this.request(`/api/workouts/${sessionId}/logs`, {
      method: 'GET',
      headers: this.authHeaders()
    });
  }

  async createWorkoutLog(sessionId, payload) {
    return this.mutation(`/api/workouts/${sessionId}/logs`, 'POST', payload, 'workout_log');
  }

  async updateWorkoutLog(logId, payload) {
    return this.request(`/api/workouts/logs/${logId}`, {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify(payload)
    });
  }

  async sync(entries) {
    return this.request('/api/sync', {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ entries })
    });
  }
}

window.MeuTreinoAPI = new ApiClient();
