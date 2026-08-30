const WorkoutLogic = {
  state: {
    currentSession: null,
    currentRoutine: null,
    currentExerciseIndex: 0,
    exerciseIndexMap: {},
    workoutLogs: [],
    timerSeconds: 0,
    timerInterval: null,
    restSeconds: 0,
    restInterval: null,
    wakeLock: null,
    lastExerciseHistory: {},
    previousLogs: []
  },

  getCurrentExercise() {
    const routine = this.state.currentRoutine;
    if (!routine || !routine.exercises || !routine.exercises.length) return null;
    return routine.exercises[this.state.currentExerciseIndex] || null;
  },

  getSetRows(exercise) {
    if (!exercise) return [];
    const rows = [];
    for (let index = 0; index < (Number(exercise.warmup_sets) || 0); index += 1) rows.push({ type: 'A', apiType: 'Aquecimento' });
    for (let index = 0; index < (Number(exercise.prep_sets) || 0); index += 1) rows.push({ type: 'P', apiType: 'Preparação' });
    const workSets = Math.max(1, Number(exercise.target_sets) || 1);
    for (let index = 0; index < workSets; index += 1) rows.push({ type: 'T', apiType: 'Trabalho' });
    return rows.map((row, index) => ({ ...row, index }));
  },

  getPreviousLog(exerciseId, apiType, ordinal) {
    return (this.state.previousLogs || []).filter((log) => log.exercise_id === exerciseId && log.set_type === apiType)[ordinal] || null;
  },

  getExerciseProgress(exercise, logs = this.state.previousLogs) {
    const workLogs = (logs || []).filter((log) => log.exercise_id === exercise?.exercise_id && log.set_type === 'Trabalho' && log.is_completed);
    if (!workLogs.length) return { bestWeight: 0, bestReps: 0, suggestion: null };

    const bestWeight = Math.max(...workLogs.map((log) => Number(log.weight_kg) || 0));
    const bestReps = Math.max(...workLogs.map((log) => Number(log.reps) || 0));
    const latest = workLogs[workLogs.length - 1];
    const targetMax = Number(exercise?.target_reps_max) || 0;
    const reachedTop = Number(latest.reps) >= targetMax && targetMax > 0;
    const suggestedWeight = reachedTop ? (Number(latest.weight_kg) || 0) + 2.5 : Number(latest.weight_kg) || 0;

    return {
      bestWeight,
      bestReps,
      suggestion: suggestedWeight > 0 ? `${suggestedWeight} kg` : null,
      message: reachedTop ? 'Você bateu o topo da faixa. Suba 2,5 kg.' : 'Mantenha a carga e busque mais repetições.'
    };
  },

  formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  },

  startTimer() {
    this.stopTimer();
    this.state.timerInterval = setInterval(() => {
      this.state.timerSeconds += 1;
      const timerEl = document.getElementById('workout-timer');
      if (timerEl) timerEl.textContent = this.formatTime(this.state.timerSeconds);
    }, 1000);
  },

  stopTimer() {
    if (this.state.timerInterval) {
      clearInterval(this.state.timerInterval);
      this.state.timerInterval = null;
    }
  },

  startRestTimer(seconds = 90) {
    this.stopRestTimer();
    this.state.restSeconds = seconds;
    this.state.restInterval = setInterval(() => {
      this.state.restSeconds = Math.max(0, this.state.restSeconds - 1);
      const restEl = document.getElementById('rest-timer');
      if (restEl) restEl.textContent = this.formatTime(this.state.restSeconds);
      if (this.state.restSeconds <= 0) {
        this.stopRestTimer();
        this.showToast('🔥 Descanso finalizado');
      }
    }, 1000);
  },

  stopRestTimer() {
    if (this.state.restInterval) {
      clearInterval(this.state.restInterval);
      this.state.restInterval = null;
    }
  },

  async requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      this.state.wakeLock = await navigator.wakeLock.request('screen');
    } catch (error) {
      console.warn('Wake Lock indisponível:', error);
    }
  },

  releaseWakeLock() {
    if (this.state.wakeLock) {
      this.state.wakeLock.release().catch(() => undefined);
      this.state.wakeLock = null;
    }
  },

  buildDefaultWorkoutLog(exercise, index) {
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      exercise_id: exercise.exercise_id,
      exercise_name: exercise.exercise_name || exercise.name || 'Exercício',
      set_type: 'Trabalho',
      weight_kg: 0,
      reps: 0,
      rir_rpe: '2',
      is_completed: false,
      order_index: index,
      session_id: this.state.currentSession?.id || null,
      created_at: new Date().toISOString()
    };
  },

  getTotalVolumeFromLogs(logs = []) {
    return (logs || []).reduce((sum, log) => sum + ((Number(log.weight_kg) || 0) * (Number(log.reps) || 0)), 0);
  },

  getCurrentSessionDuration() {
    return Math.max(1, Math.floor((this.state.timerSeconds || 0) / 60));
  },

  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    container.innerHTML = `<div class="toast show">${message}</div>`;
    setTimeout(() => {
      const toast = container.querySelector('.toast');
      if (toast) toast.classList.remove('show');
    }, 2200);
  }
};

window.WorkoutLogic = WorkoutLogic;
