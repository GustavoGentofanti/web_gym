const AppState = {
  currentUser: null,
  theme: 'dark',
  view: 'login',
  routines: [],
  exercises: [],
  recentSessions: [],
  currentRoutine: null,
  isAuthReady: false
};

const Views = {
  login: () => renderLoginScreen(),
  dashboard: () => renderDashboardScreen(),
  treinos: () => renderTreinosScreen(),
  exercicios: () => renderExerciseManagementScreen(),
  historico: () => renderHistoricoScreen(),
  biblioteca: () => renderBibliotecaScreen(),
  workout: () => renderWorkoutScreen(),
};

function getCurrentUser() {
  return AppState.currentUser;
}

function setView(name) {
  AppState.view = name;
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
  const target = document.getElementById(`screen-${name}`);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
  if (typeof Views[name] === 'function') Views[name]();
}

async function initApp() {
  await ensureDbReady();
  const savedTheme = await window.MeuTreinoDB.getSettings('theme');
  if (savedTheme) {
    AppState.theme = savedTheme;
    applyTheme(savedTheme);
  }

  const token = localStorage.getItem('meutreino_token');
  if (token) {
    try {
      const user = await window.MeuTreinoAPI.me();
      AppState.currentUser = user;
      AppState.isAuthReady = true;
      await loadUserData();
      setView('dashboard');
    } catch (error) {
      localStorage.removeItem('meutreino_token');
      AppState.isAuthReady = true;
      setView('login');
    }
  } else {
    AppState.isAuthReady = true;
    setView('login');
  }

  window.MeuTreinoSync.subscribeToConnectivity();
}

async function ensureDbReady() {
  await window.MeuTreinoDB.open();
}

function applyTheme(mode) {
  document.body.classList.toggle('light', mode === 'light');
  document.body.classList.toggle('dark', mode !== 'light');
}

async function loadUserData() {
  try {
    const [remoteRoutines, remoteExercises, remoteSessions] = await Promise.all([
      window.MeuTreinoAPI.getRoutines().catch(() => []),
      window.MeuTreinoAPI.getExercises().catch(() => []),
      window.MeuTreinoAPI.getWorkouts().catch(() => [])
    ]);

    AppState.routines = Array.isArray(remoteRoutines) ? remoteRoutines : [];
    AppState.exercises = Array.isArray(remoteExercises) ? remoteExercises : [];
    AppState.recentSessions = Array.isArray(remoteSessions) ? remoteSessions : [];

    AppState.routines = AppState.routines.map((routine) => ({
      ...routine,
      exercises: (routine.exercises || []).map((item) => ({
        ...item,
        exercise_name: item.exercise_name || AppState.exercises.find((exercise) => exercise.id === item.exercise_id)?.name || 'Exercício',
      }))
    }));

    await Promise.all([
      ...AppState.routines.map((routine) => window.MeuTreinoDB.put('routines', routine).catch(() => undefined)),
      ...AppState.exercises.map((exercise) => window.MeuTreinoDB.put('exercises', exercise).catch(() => undefined))
    ]);
  } catch (error) {
    const dbRoutines = await window.MeuTreinoDB.getUserData(AppState.currentUser.id, 'routines').catch(() => []);
    const dbExercises = await window.MeuTreinoDB.getUserData(AppState.currentUser.id, 'exercises').catch(() => []);
    AppState.routines = dbRoutines || [];
    AppState.exercises = dbExercises || [];
  }
}

function openExerciseModal() {
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-panel">
        <div class="modal-header">
          <h3>Novo exercício</h3>
          <button class="ghost-btn" data-close-modal>Fechar</button>
        </div>
        <div class="form-grid">
          <div class="field">
            <label>Nome</label>
            <input id="exercise-name-input" type="text" placeholder="Supino reto" />
          </div>
          <div class="field">
            <label>Grupo muscular</label>
            <input id="exercise-muscle-input" type="text" placeholder="Peito" />
          </div>
          <div class="field">
            <label>Equipamento</label>
            <input id="exercise-equipment-input" type="text" placeholder="Barra" />
          </div>
        </div>
        <div class="btn-row" style="margin-top:16px; justify-content:flex-end;">
          <button class="secondary-btn" data-close-modal>Cancelar</button>
          <button class="primary-btn" id="save-exercise-btn">Salvar</button>
        </div>
      </div>
    </div>
  `;

  modalRoot.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => {
      modalRoot.innerHTML = '';
    });
  });

  document.getElementById('save-exercise-btn').addEventListener('click', async () => {
    const name = document.getElementById('exercise-name-input').value.trim();
    const muscleGroup = document.getElementById('exercise-muscle-input').value.trim();
    const equipment = document.getElementById('exercise-equipment-input').value.trim();

    if (!name || !muscleGroup || !equipment) {
      showToast('Preencha nome, grupo muscular e equipamento.');
      return;
    }

    try {
      await window.MeuTreinoAPI.createExercise({ name, muscle_group: muscleGroup, equipment, is_custom: true });
      await loadUserData();
      modalRoot.innerHTML = '';
      renderBibliotecaScreen();
      setView('biblioteca');
      showToast('Exercício criado com sucesso.');
    } catch (error) {
      showToast(error.message || 'Erro ao criar exercício.');
    }
  });
}

function parseRepTarget(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { min: 8, max: 12, text: '8-12' };

  const rangeMatch = raw.match(/(\d+)\s*(?:-|–|a|ao)\s*(\d+)/i);
  if (rangeMatch) {
    return {
      min: Number(rangeMatch[1]),
      max: Number(rangeMatch[2]),
      text: raw,
    };
  }

  const directValue = Number(String(raw).replace(/[^0-9]/g, ''));
  if (!Number.isNaN(directValue)) {
    return {
      min: directValue,
      max: directValue,
      text: raw,
    };
  }

  return { min: 8, max: 12, text: raw };
}

function createSetEntry(type = 'Trabalho', reps = '8-12', load = '', rest = 60) {
  const normalizedReps = typeof reps === 'string' ? reps.trim() : String(reps ?? '').trim();
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type,
    reps: normalizedReps || '',
    load: typeof load === 'string' ? load.trim() : '',
    rest: Number(rest) || 0,
  };
}

function summarizeExerciseSeries(series = []) {
  const summary = {
    Aquecimento: 0,
    Preparação: 0,
    Trabalho: 0,
  };
  const workReps = [];
  let restSeconds = 90;

  series.forEach((entry) => {
    if (entry.type in summary) {
      summary[entry.type] += 1;
    }

    if (entry.type === 'Trabalho') {
      const parsed = parseRepTarget(entry.reps);
      workReps.push(parsed.min, parsed.max);
      if (entry.rest) {
        restSeconds = Number(entry.rest) || restSeconds;
      }
    }
  });

  return {
    warmup_sets: summary.Aquecimento,
    prep_sets: summary.Preparação,
    target_sets: summary.Trabalho,
    target_reps_min: workReps.length ? Math.min(...workReps) : 8,
    target_reps_max: workReps.length ? Math.max(...workReps) : 12,
    rest_seconds: restSeconds,
  };
}

function hydrateExerciseDraft(item) {
  const legacySeries = [];
  const warmupCount = Number(item.warmup_sets || 0);
  const prepCount = Number(item.prep_sets || 0);
  const workCount = Math.max(Number(item.target_sets || 0), 1);
  const repsMin = Number(item.target_reps_min || 8);
  const repsMax = Number(item.target_reps_max || 12);
  const restSeconds = Number(item.rest_seconds || 90);

  for (let index = 0; index < warmupCount; index += 1) {
    legacySeries.push(createSetEntry('Aquecimento', 12, '', 30));
  }

  for (let index = 0; index < prepCount; index += 1) {
    legacySeries.push(createSetEntry('Preparação', 8, '', 45));
  }

  for (let index = 0; index < workCount; index += 1) {
    legacySeries.push(createSetEntry('Trabalho', Math.max(repsMin, repsMax === repsMin ? repsMin : repsMin + (index % 2)), '10', restSeconds));
  }

  return {
    ...item,
    exercise_name: item.exercise_name || 'Exercício',
    muscle_group: item.muscle_group || 'Músculo',
    series: Array.isArray(item.series) && item.series.length ? item.series : legacySeries,
  };
}

function renderRoutineBuilderModal(routineToEdit = null) {
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return;

  const selectedExercises = (routineToEdit?.exercises || []).map((item) => hydrateExerciseDraft({
    ...item,
    exercise_name: item.exercise_name || AppState.exercises.find((exercise) => exercise.id === item.exercise_id)?.name || 'Exercício',
    muscle_group: AppState.exercises.find((exercise) => exercise.id === item.exercise_id)?.muscle_group || 'Músculo',
  }));

  const availableExercises = AppState.exercises.length ? AppState.exercises : [];
  let selectedExerciseId = availableExercises[0]?.id || '';
  let searchQuery = '';

  const renderExerciseManager = () => {
    const container = document.getElementById('routine-selected-items');
    if (!container) return;

    if (!selectedExercises.length) {
      container.innerHTML = '<div class="empty-state">Nenhum exercício adicionado.</div>';
      return;
    }

    container.innerHTML = selectedExercises.map((item, index) => {
      const summary = summarizeExerciseSeries(item.series);
      const isExpanded = Boolean(item._expanded);

      return `
        <div class="exercise-manager-card ${isExpanded ? '' : 'exercise-manager-card--collapsed'}" data-exercise-index="${index}">
          <div class="exercise-manager-header">
            <div class="exercise-info">
              <span class="muscle-icon">${item.muscle_group?.toLowerCase().includes('abdômen') || item.muscle_group?.toLowerCase().includes('abdomen') ? '🏋️' : '💪'}</span>
              <div>
                <strong>${item.exercise_name}</strong>
                <small>${item.muscle_group}</small>
              </div>
            </div>
            <div class="exercise-manager-actions">
              <button class="icon-btn ghost-icon" data-toggle-exercise="${index}" title="${isExpanded ? 'Recolher' : 'Expandir'} exercício">${isExpanded ? '▾' : '✎'}</button>
              <button class="icon-btn ghost-icon" data-remove-routine-item="${index}" title="Remover exercício">🗑</button>
            </div>
          </div>

          ${isExpanded ? `
            <div class="series-summary">
              <span>${summary.target_sets} séries</span>
              <span>${summary.warmup_sets} aquec.</span>
              <span>${summary.prep_sets} prep.</span>
              <span>${summary.target_reps_min}-${summary.target_reps_max} reps</span>
            </div>

            <div class="series-list">
              ${item.series.map((entry, entryIndex) => {
                const badgeClass = entry.type === 'Aquecimento' ? 'warm' : entry.type === 'Preparação' ? 'prep' : 'work';
                const icon = entry.type === 'Aquecimento' ? '↺' : entry.type === 'Preparação' ? '◌' : '✦';
                return `
                  <div class="series-row ${badgeClass}">
                    <div class="series-pill ${badgeClass}">
                      <span>${icon}</span>
                      ${entry.type}
                    </div>

                    <label class="compact-field">
                      <span>Meta</span>
                      <input type="text" value="${String(entry.reps ?? '')}" placeholder="8-12 / até falhar" data-series-reps="${index}:${entryIndex}" />
                    </label>

                    <label class="compact-field">
                      <span>Descanso</span>
                      <input type="number" min="0" max="600" value="${Number(entry.rest) || 0}" data-series-rest="${index}:${entryIndex}" />
                    </label>

                    <div class="series-actions-inline">
                      <select class="mini-select" data-series-type="${index}:${entryIndex}">
                        <option ${entry.type === 'Aquecimento' ? 'selected' : ''}>Aquecimento</option>
                        <option ${entry.type === 'Preparação' ? 'selected' : ''}>Preparação</option>
                        <option ${entry.type === 'Trabalho' ? 'selected' : ''}>Trabalho</option>
                      </select>
                      <button class="mini-remove" data-remove-series="${index}:${entryIndex}" title="Excluir série">×</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <div class="series-footer">
              <button class="soft-btn warm" data-add-series="${index}" data-series-type="Aquecimento">+ Série de Aquecimento</button>
              <button class="soft-btn prep" data-add-series="${index}" data-series-type="Preparação">+ Série de Preparação</button>
              <button class="soft-btn work" data-add-series="${index}" data-series-type="Trabalho">+ Série de Trabalho</button>
            </div>
          ` : `
            <div class="series-summary" style="margin-top:0;">
              <span>${summary.target_sets} Séries</span>
              <span>${summary.target_reps_min}-${summary.target_reps_max} reps</span>
              <span>${summary.rest_seconds}s descanso</span>
            </div>
          `}
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-toggle-exercise]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.toggleExercise);
        if (!selectedExercises[index]) return;
        selectedExercises[index]._expanded = !selectedExercises[index]._expanded;
        renderExerciseManager();
      });
    });

    container.querySelectorAll('[data-remove-routine-item]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.removeRoutineItem);
        selectedExercises.splice(index, 1);
        renderExerciseManager();
      });
    });

    container.querySelectorAll('[data-add-series]').forEach((button) => {
      button.addEventListener('click', () => {
        const exerciseIndex = Number(button.dataset.addSeries);
        const type = button.dataset.seriesType || 'Trabalho';
        const item = selectedExercises[exerciseIndex];
        if (!item) return;

        const defaults = {
          Aquecimento: { reps: '10-12', rest: 45 },
          Preparação: { reps: '', rest: 60 },
          Trabalho: { reps: '', rest: 120 },
        };

        const config = defaults[type] || defaults.Trabalho;
        item.series.push(createSetEntry(type, config.reps, '', config.rest));
        renderExerciseManager();
      });
    });

    container.querySelectorAll('[data-remove-series]').forEach((button) => {
      button.addEventListener('click', () => {
        const [exerciseIndex, seriesIndex] = button.dataset.removeSeries.split(':').map(Number);
        if (Number.isNaN(exerciseIndex) || Number.isNaN(seriesIndex)) return;

        selectedExercises[exerciseIndex]?.series.splice(seriesIndex, 1);
        renderExerciseManager();
      });
    });

    container.querySelectorAll('[data-series-reps]').forEach((input) => {
      input.addEventListener('input', (event) => {
        const [exerciseIndex, seriesIndex] = event.target.dataset.seriesReps.split(':').map(Number);
        if (selectedExercises[exerciseIndex]?.series[seriesIndex]) {
          selectedExercises[exerciseIndex].series[seriesIndex].reps = event.target.value || '8-12';
        }
      });
    });

    container.querySelectorAll('[data-series-load]').forEach((input) => {
      input.addEventListener('input', (event) => {
        const [exerciseIndex, seriesIndex] = event.target.dataset.seriesLoad.split(':').map(Number);
        if (selectedExercises[exerciseIndex]?.series[seriesIndex]) {
          selectedExercises[exerciseIndex].series[seriesIndex].load = event.target.value ? event.target.value : '';
        }
      });
    });

    container.querySelectorAll('[data-series-rest]').forEach((input) => {
      input.addEventListener('input', (event) => {
        const [exerciseIndex, seriesIndex] = event.target.dataset.seriesRest.split(':').map(Number);
        const value = Number(event.target.value || 0);
        if (selectedExercises[exerciseIndex]?.series[seriesIndex]) {
          selectedExercises[exerciseIndex].series[seriesIndex].rest = value;
        }
      });
    });

    container.querySelectorAll('[data-series-type]').forEach((select) => {
      select.addEventListener('change', (event) => {
        const [exerciseIndex, seriesIndex] = event.target.dataset.seriesType.split(':').map(Number);
        const value = event.target.value;
        if (selectedExercises[exerciseIndex]?.series[seriesIndex]) {
          selectedExercises[exerciseIndex].series[seriesIndex].type = value;
        }
        renderExerciseManager();
      });
    });
  };

  const filteredExercises = availableExercises.filter((exercise) => {
    if (!searchQuery) return true;
    const value = `${exercise.name} ${exercise.muscle_group}`.toLowerCase();
    return value.includes(searchQuery.toLowerCase());
  });

  const addExerciseToRoutine = (exerciseId) => {
    const exercise = AppState.exercises.find((item) => item.id === exerciseId);
    if (!exercise) return;

    const alreadyExists = selectedExercises.some((item) => item.exercise_id === exercise.id);
    if (alreadyExists) {
      const panel = document.querySelector('.exercise-search-panel');
      if (panel) panel.classList.remove('open');
      renderExerciseManager();
      return;
    }

    selectedExercises.push({
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      muscle_group: exercise.muscle_group,
      _expanded: true,
      series: [
        createSetEntry('Aquecimento', '10-12', '', 45),
        createSetEntry('Preparação', '', '', 60),
        createSetEntry('Trabalho', '', '', 120),
      ],
    });

    const panel = document.querySelector('.exercise-search-panel');
    if (panel) panel.classList.remove('open');

    renderExerciseManager();
    const summaryMeta = document.getElementById('series-summary-meta');
    if (summaryMeta) {
      summaryMeta.textContent = `${selectedExercises.reduce((count, item) => count + item.series.length, 0)} séries`;
    }
  };

  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-panel routine-modal">
        <div class="routine-modal-shell">
          <div class="routine-modal-header">
            <div>
              <div class="eyebrow-title">Criação</div>
              <h3>${routineToEdit ? 'Editar ficha' : 'Nova ficha'}</h3>
            </div>
            <button class="ghost-btn" data-close-modal>Fechar</button>
          </div>

          <div class="field modern-field">
            <label>Nome da ficha</label>
            <input id="routine-name-input" type="text" placeholder="ex: Treino de Inferiores A" value="${routineToEdit?.name || ''}" />
          </div>

          <div class="exercise-picker-panel">
            <div class="exercise-picker-head">
              <label>Exercício</label>
              <span class="picker-meta">Busca por músculo</span>
            </div>
            <button class="exercise-picker" type="button" id="routine-exercise-picker">
              <span class="muscle-icon small">🏋️</span>
              <span id="routine-selected-exercise-name">${availableExercises[0]?.name || 'Selecionar exercício'}</span>
              <span class="picker-actions"><span>×</span><span>⌄</span></span>
            </button>

            <div class="exercise-search-panel">
              <div class="search-input-wrap">
                <span>⌕</span>
                <input id="routine-exercise-search" type="text" placeholder="Buscar exercício, grupo muscular..." value="${searchQuery}" class="pl-10" />
              </div>

              <div class="search-results">
                ${filteredExercises.map((exercise) => `
                  <button class="search-result-item ${selectedExerciseId === exercise.id ? 'selected' : ''}" type="button" data-select-exercise="${exercise.id}">
                    <span class="muscle-icon small">${exercise.muscle_group?.toLowerCase().includes('abdômen') || exercise.muscle_group?.toLowerCase().includes('abdomen') ? '🏋️' : '💪'}</span>
                    <span class="result-text">
                      <strong>${exercise.name}</strong>
                      <small>${exercise.muscle_group}</small>
                    </span>
                  </button>
                `).join('') || '<div class="empty-state inline-empty">Nenhum exercício encontrado.</div>'}
              </div>
            </div>
          </div>

          <div class="driver-card">
            <div class="driver-header">
              <h4>Gerenciar Séries</h4>
              <span id="series-summary-meta">${selectedExercises.reduce((count, item) => count + item.series.length, 0)} séries</span>
            </div>

            <div id="routine-selected-items" class="routine-selected-items"></div>

            <button class="add-exercise-cta" id="add-routine-item-btn">+ Adicionar Exercício</button>
          </div>

          <div class="routine-footer-actions">
            <button class="secondary-btn" data-close-modal>Cancelar</button>
            <button class="primary-btn primary-cta" id="save-routine-btn">${routineToEdit ? 'Salvar ficha' : 'Salvar ficha'}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const selectedExerciseNameEl = document.getElementById('routine-selected-exercise-name');
  const searchInput = document.getElementById('routine-exercise-search');
  const exerciseResults = () => [...document.querySelectorAll('[data-select-exercise]')];

  const updateSelectedExerciseLabel = () => {
    const exercise = AppState.exercises.find((item) => item.id === selectedExerciseId);
    if (selectedExerciseNameEl) {
      selectedExerciseNameEl.textContent = exercise ? exercise.name : 'Selecionar exercício';
    }
    exerciseResults().forEach((button) => {
      const isSelected = button.dataset.selectExercise === selectedExerciseId;
      button.classList.toggle('selected', isSelected);
    });
  };

  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      searchQuery = event.target.value;
      const filtered = availableExercises.filter((exercise) => {
        if (!searchQuery) return true;
        const value = `${exercise.name} ${exercise.muscle_group}`.toLowerCase();
        return value.includes(searchQuery.toLowerCase());
      });

      const results = document.querySelector('.search-results');
      if (!results) return;
      results.innerHTML = filtered.length ? filtered.map((exercise) => `
        <button class="search-result-item ${selectedExerciseId === exercise.id ? 'selected' : ''}" type="button" data-select-exercise="${exercise.id}">
          <span class="muscle-icon small">${exercise.muscle_group?.toLowerCase().includes('abdômen') || exercise.muscle_group?.toLowerCase().includes('abdomen') ? '🏋️' : '💪'}</span>
          <span class="result-text">
            <strong>${exercise.name}</strong>
            <small>${exercise.muscle_group}</small>
          </span>
        </button>
      `).join('') : '<div class="empty-state inline-empty">Nenhum exercício encontrado.</div>';

      results.querySelectorAll('[data-select-exercise]').forEach((button) => {
        button.addEventListener('click', () => {
          selectedExerciseId = button.dataset.selectExercise;
          updateSelectedExerciseLabel();
          addExerciseToRoutine(selectedExerciseId);
        });
      });
    });
  }

  exerciseResults().forEach((button) => {
    button.addEventListener('click', () => {
      selectedExerciseId = button.dataset.selectExercise;
      updateSelectedExerciseLabel();
      addExerciseToRoutine(selectedExerciseId);
    });
  });

  updateSelectedExerciseLabel();
  renderExerciseManager();

  const summaryMeta = document.getElementById('series-summary-meta');
  if (summaryMeta) {
    summaryMeta.textContent = `${selectedExercises.reduce((count, item) => count + item.series.length, 0)} séries`;
  }

  modalRoot.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => {
      modalRoot.innerHTML = '';
    });
  });

  document.getElementById('routine-exercise-picker').addEventListener('click', () => {
    const panel = document.querySelector('.exercise-search-panel');
    if (panel) panel.classList.toggle('open');
  });

  document.getElementById('add-routine-item-btn').addEventListener('click', () => {
    const exercise = AppState.exercises.find((item) => item.id === selectedExerciseId);
    if (!exercise) {
      showToast('Selecione um exercício válido.');
      return;
    }

    const alreadyExists = selectedExercises.some((item) => item.exercise_id === exercise.id);
    if (alreadyExists) {
      showToast('Esse exercício já está na ficha.');
      return;
    }

    selectedExercises.push({
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      muscle_group: exercise.muscle_group,
      _expanded: true,
      series: [
        createSetEntry('Aquecimento', '12', '', 30),
        createSetEntry('Preparação', '8', '', 45),
        createSetEntry('Trabalho', '8-12', '10', 60),
      ],
    });

    renderExerciseManager();
    if (summaryMeta) {
      summaryMeta.textContent = `${selectedExercises.reduce((count, item) => count + item.series.length, 0)} séries`;
    }
  });

  document.getElementById('save-routine-btn').addEventListener('click', async () => {
    const name = document.getElementById('routine-name-input').value.trim();
    if (!name) {
      showToast('Informe o nome da ficha.');
      return;
    }
    if (!selectedExercises.length) {
      showToast('Adicione pelo menos um exercício à ficha.');
      return;
    }

    try {
      const payload = {
        name,
        exercises: selectedExercises.map((item, orderIndex) => {
          const summary = summarizeExerciseSeries(item.series);
          return {
            exercise_id: item.exercise_id,
            warmup_sets: summary.warmup_sets,
            prep_sets: summary.prep_sets,
            target_sets: summary.target_sets,
            target_reps_min: summary.target_reps_min,
            target_reps_max: summary.target_reps_max,
            rest_seconds: summary.rest_seconds,
            order_index: orderIndex,
          };
        }),
      };

      if (routineToEdit) {
        await window.MeuTreinoAPI.updateRoutine(routineToEdit.id, payload);
      } else {
        await window.MeuTreinoAPI.createRoutine(payload);
      }

      await loadUserData();
      modalRoot.innerHTML = '';
      renderTreinosScreen();
      setView('treinos');
      showToast(routineToEdit ? 'Ficha atualizada com sucesso.' : 'Ficha criada com sucesso.');
    } catch (error) {
      showToast(error.message || 'Erro ao criar ficha.');
    }
  });
}

function renderLoginScreen() {
  const screen = document.getElementById('screen-login');
  if (!screen) return;

  screen.innerHTML = `
    <div class="app-shell auth-shell">
      <div class="auth-form">
        <div class="auth-brandmark" aria-label="Gusliniker Legion logo">
          <svg class="gle-emblem" viewBox="0 0 320 120" role="img" aria-label="GLE emblem">
            <defs>
              <linearGradient id="gleText" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#edf5e3" />
                <stop offset="25%" stop-color="#bdc4af" />
                <stop offset="50%" stop-color="#8d9581" />
                <stop offset="75%" stop-color="#ecf1c6" />
                <stop offset="100%" stop-color="#4c554d" />
              </linearGradient>
              <linearGradient id="gleGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="rgba(118,255,179,0)" />
                <stop offset="50%" stop-color="rgba(118,255,179,0.9)" />
                <stop offset="100%" stop-color="rgba(118,255,179,0)" />
              </linearGradient>
            </defs>
            <line x1="20" y1="26" x2="110" y2="26" stroke="url(#gleGlow)" stroke-width="2" opacity="0.9"/>
            <line x1="210" y1="26" x2="300" y2="26" stroke="url(#gleGlow)" stroke-width="2" opacity="0.9"/>
            <text x="160" y="86" text-anchor="middle" fill="url(#gleText)" font-size="68" font-weight="900" font-style="italic" letter-spacing="8" transform="skewX(-10)" font-family="Arial Black, Segoe UI, sans-serif">GLE</text>
            <rect x="95" y="44" width="130" height="6" rx="3" fill="rgba(118,255,179,0.18)"/>
          </svg>
        </div>

        <div class="auth-kicker">GUSLINIKER LEGION</div>
        <h2>Bem-vindo de volta</h2>
        <div class="form-grid">
          <div class="field field-icon">
            <label for="login-email">E-mail</label>
            <input id="login-email" type="email" placeholder="seu@email.com" class="px-4" />
          </div>
          <div class="field field-icon">
            <label for="login-password">Senha</label>
            <input id="login-password" type="password" placeholder="Sua senha" class="px-4" />
          </div>
          <button class="primary-btn auth-cta" id="login-submit">Entrar</button>
        </div>
        <div class="auth-switch">
          <span>Não tem conta?</span>
          <button class="ghost-btn py-2 px-6 rounded-md" id="switch-to-register">Criar conta</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('login-submit').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    try {
      const result = await window.MeuTreinoAPI.login({ email, password });
      AppState.currentUser = await window.MeuTreinoAPI.me();
      await loadUserData();
      setView('dashboard');
    } catch (error) {
      showToast(error.message || 'Erro ao fazer login');
    }
  });

  document.getElementById('switch-to-register').addEventListener('click', () => {
    renderRegisterScreen();
  });

  screen.classList.add('active');
}

function renderRegisterScreen() {
  const screen = document.getElementById('screen-login');
  if (!screen) return;

  screen.innerHTML = `
    <div class="app-shell auth-shell">
      <div class="auth-form">
        <div class="auth-brandmark" aria-label="Gusliniker Legion logo">
          <svg class="gle-emblem" viewBox="0 0 320 120" role="img" aria-label="GLE emblem">
            <defs>
              <linearGradient id="gleTextRegister" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#edf5e3" />
                <stop offset="25%" stop-color="#bdc4af" />
                <stop offset="50%" stop-color="#8d9581" />
                <stop offset="75%" stop-color="#ecf1c6" />
                <stop offset="100%" stop-color="#4c554d" />
              </linearGradient>
              <linearGradient id="gleGlowRegister" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="rgba(118,255,179,0)" />
                <stop offset="50%" stop-color="rgba(118,255,179,0.9)" />
                <stop offset="100%" stop-color="rgba(118,255,179,0)" />
              </linearGradient>
            </defs>
            <line x1="20" y1="26" x2="110" y2="26" stroke="url(#gleGlowRegister)" stroke-width="2" opacity="0.9"/>
            <line x1="210" y1="26" x2="300" y2="26" stroke="url(#gleGlowRegister)" stroke-width="2" opacity="0.9"/>
            <text x="160" y="86" text-anchor="middle" fill="url(#gleTextRegister)" font-size="68" font-weight="900" font-style="italic" letter-spacing="8" transform="skewX(-10)" font-family="Arial Black, Segoe UI, sans-serif">GLE</text>
            <rect x="95" y="44" width="130" height="6" rx="3" fill="rgba(118,255,179,0.18)"/>
          </svg>
        </div>

        <div class="auth-kicker">GUSLINIKER LEGION</div>
        <h2>Crie sua conta</h2>
        <div class="form-grid">
          <div class="field field-icon">
            <label for="register-name">Nome</label>
            <input id="register-name" type="text" placeholder="Seu nome" class="px-4" />
          </div>
          <div class="field field-icon">
            <label for="register-email">E-mail</label>
            <input id="register-email" type="email" placeholder="seu@email.com" class="px-4" />
          </div>
          <div class="field field-icon">
            <label for="register-password">Senha</label>
            <input id="register-password" type="password" placeholder="Mínimo 6 caracteres" class="px-4" />
          </div>
          <button class="primary-btn auth-cta" id="register-submit">Criar conta</button>
        </div>
        <div class="auth-switch">
          <span>Já tem conta?</span>
          <button class="ghost-btn py-2 px-6 rounded-md" id="switch-to-login">Entrar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('register-submit').addEventListener('click', async () => {
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value.trim();

    try {
      await window.MeuTreinoAPI.register({ name, email, password });
      AppState.currentUser = await window.MeuTreinoAPI.me();
      await loadUserData();
      setView('dashboard');
    } catch (error) {
      showToast(error.message || 'Erro ao criar conta');
    }
  });

  document.getElementById('switch-to-login').addEventListener('click', () => {
    renderLoginScreen();
  });

  screen.classList.add('active');
}

function renderDashboardScreen() {
  const user = getCurrentUser();
  const screen = document.getElementById('screen-dashboard');
  if (!screen) return;

  const completedSessions = AppState.recentSessions.filter((session) => session.status === 'completed');
  const latestSession = completedSessions[0];
  const activeRoutine = AppState.routines[0];

  const weeklyBars = [
    { day: 'Seg', value: 42, tone: 'green' },
    { day: 'Ter', value: 56, tone: 'yellow' },
    { day: 'Qua', value: 68, tone: 'green' },
    { day: 'Qui', value: 74, tone: 'green' },
    { day: 'Sex', value: 64, tone: 'yellow' },
    { day: 'Sáb', value: 90, tone: 'red' },
    { day: 'Dom', value: 58, tone: 'green' }
  ];

  screen.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div>
          <div class="brand">Início</div>
          <small style="color:var(--muted);">Bom treino, ${user?.name || 'atleta'}</small>
        </div>
        <div class="status-pill ${navigator.onLine ? 'online' : 'offline'}">${navigator.onLine ? '● Online' : '● Offline'}</div>
      </header>

      <div class="home-grid">
        <div class="screen-card dashboard-hero">
          <div class="mini-topline">
            <span>Resumo da semana</span>
            <button class="chip-btn">${completedSessions.length ? '+ ' + Math.max(1, completedSessions.length) + '%' : 'Sem dados'}</button>
          </div>
          ${completedSessions.length ? `
            <div class="week-chart">
              ${weeklyBars.map((item) => `
                <div class="chart-column">
                  <div class="chart-bar-wrap">
                    <span class="chart-bar ${item.tone}" style="height:${item.value}%"></span>
                  </div>
                  <span class="chart-label">${item.day}</span>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="empty-state compact-empty">
              <strong>📊</strong>
              Complete seu primeiro treino para visualizar o progresso semanal.
            </div>
          `}
        </div>

        <div class="screen-card next-workout">
          <div class="mini-topline">
            <span>Seu próximo treino</span>
            <button class="chip-btn">${activeRoutine ? activeRoutine.name.split(' ')[0] : 'Ficha'}</button>
          </div>
          ${activeRoutine ? `
            <div class="upcoming-card">
              <h4>${activeRoutine.name}</h4>
              <div class="upcoming-meta">
                <span>${(activeRoutine.exercises || []).length || 0} exercícios</span>
                <span>•</span>
                <span>${Math.max(20, (activeRoutine.exercises || []).length * 18)} min</span>
              </div>
              <div class="routine-meta" style="margin-top:16px;">
                <span class="meta-badge good">Aquecimento</span>
                <span class="meta-badge">Trabalho</span>
                <span class="meta-badge hot">Carga</span>
              </div>
            </div>
          ` : `
            <div class="empty-state compact-empty">
              <strong>🏋️</strong>
              Sem ficha cadastrada.
            </div>
          `}
        </div>
      </div>

      <div class="dashboard-grid" style="margin-top:18px;">
        <div class="card">
          <div class="card-header">
            <h3>Resumo</h3>
            <button class="secondary-btn" id="dashboard-start-btn">Começar</button>
          </div>
          <div class="list">
            <div class="list-item">
              <span>Ficha atual</span>
              <strong>${activeRoutine?.name || 'Sem ficha'}</strong>
            </div>
            <div class="list-item">
              <span>${latestSession ? 'Último treino' : 'Pronto para começar?'}</span>
              <strong>${latestSession ? `${latestSession.duration_minutes || 0} min` : 'Vamos nessa'}</strong>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Visão geral</h3>
          </div>
          <div class="metric-row">
            <div class="metric">
              <div class="metric-label">Fichas</div>
              <div class="metric-value">${AppState.routines.length}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Exercícios</div>
              <div class="metric-value">${AppState.exercises.length}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Treinos</div>
              <div class="metric-value">${completedSessions.length}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Consistência</div>
              <div class="metric-value">${completedSessions.length ? 'Ativa' : '--'}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="screen-card" style="margin-top:18px;">
        <div class="mini-topline">
          <span>Seu progresso</span>
          <button class="chip-btn">Seu app</button>
        </div>
        ${completedSessions.length ? `
          <div class="activity-feed">
            ${completedSessions.slice(0, 3).map((session, index) => `
              <div class="activity-item">
                <div class="avatar" style="background:linear-gradient(135deg,#d9f56a,#7fe3d1);">${(user?.name || 'T')[0].toUpperCase()}</div>
                <div class="activity-body">
                  <strong>Treino ${index + 1}</strong>
                  <small>${new Date(session.start_time || session.created_at).toLocaleDateString('pt-BR')}</small>
                </div>
                <div class="activity-stat">+${Math.min(18, (index + 1) * 6)}%</div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="empty-state compact-empty">
            <strong>📈</strong>
            Ainda não há registros suficientes para mostrar seu progresso.
          </div>
        `}
      </div>
    </div>
    ${renderNavBar()}
  `;

  document.getElementById('dashboard-start-btn').addEventListener('click', () => startWorkoutFlow());
}

function getRoutineVolumeByMuscle(routine) {
  const totals = {};
  const items = Array.isArray(routine?.exercises) ? routine.exercises : [];

  items.forEach((item) => {
    const muscleName = item.muscle_group || AppState.exercises.find((exercise) => exercise.id === item.exercise_id)?.muscle_group || 'Músculo';
    const directSeries = Array.isArray(item.series) ? item.series : [];
    const workSets = directSeries.length
      ? directSeries.filter((entry) => entry.type === 'Trabalho').length
      : Number(item.target_sets || 0);

    if (!workSets) return;
    totals[muscleName] = (totals[muscleName] || 0) + Number(workSets);
  });

  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

function renderTreinosScreen() {
  const screen = document.getElementById('screen-treinos');
  if (!screen) return;
  screen.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">Fichas</div>
        <button class="primary-btn" id="new-routine-btn">+ Nova ficha</button>
      </header>
      <div class="routine-card-grid" id="routine-list"></div>
    </div>
    ${renderNavBar()}
  `;

  const list = document.getElementById('routine-list');
  if (!AppState.routines.length) {
    list.innerHTML = `
      <div class="empty-state screen-card">
        <strong>🏋️</strong>
        Você ainda não possui treinos.<br />
        Crie sua primeira ficha para começar.
        <div class="btn-row" style="justify-content:center;margin-top:16px;">
          <button class="primary-btn" id="empty-create-routine">Criar ficha</button>
        </div>
      </div>
    `;
    document.getElementById('empty-create-routine').addEventListener('click', () => renderRoutineBuilderModal());
  } else {
    list.innerHTML = AppState.routines.map((routine) => {
      const volumeSummary = getRoutineVolumeByMuscle(routine);
      const volumeText = volumeSummary.length
        ? volumeSummary.map(([muscle, total]) => `${muscle}: ${total} séries`).join(' | ')
        : 'Sem volume de trabalho';

      return `
        <div class="routine-card-feature">
          <div class="card-header">
            <h3>${routine.name}</h3>
            <div class="btn-row">
              <button class="icon-btn" data-action="start" data-id="${routine.id}">▶</button>
              <button class="icon-btn" data-action="edit" data-id="${routine.id}" title="Editar ficha">✎</button>
              <button class="icon-btn" data-action="delete" data-id="${routine.id}">✕</button>
            </div>
          </div>
          <div class="routine-meta">
            <span class="meta-badge good">${(routine.exercises || []).length} exercícios</span>
            <span class="meta-badge">${Math.max(20, (routine.exercises || []).length * 18)} min</span>
            <span class="meta-badge hot">Superior</span>
          </div>
          <div class="routine-volume-row">
            <span>${volumeText}</span>
          </div>
          <div class="list" style="margin-top:14px;">
            ${(routine.exercises || []).map((item) => `
              <div class="list-item">
                <span>${item.exercise_name || item.exercise_id}</span>
                <strong>${item.target_sets || 1}x${item.target_reps_min || 8}-${item.target_reps_max || 12}</strong>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-action="start"]').forEach((btn) => {
      btn.addEventListener('click', () => startWorkoutFlow(btn.dataset.id));
    });

    list.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Excluir esta ficha?')) return;
        try {
          await window.MeuTreinoAPI.deleteRoutine(btn.dataset.id);
          await loadUserData();
          renderTreinosScreen();
          setView('treinos');
          showToast('Ficha removida.');
        } catch (error) {
          showToast(error.message || 'Erro ao remover ficha.');
        }
      });
    });

    list.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const routine = AppState.routines.find((item) => item.id === btn.dataset.id);
        if (routine) renderRoutineBuilderModal(routine);
      });
    });
  }

  document.getElementById('new-routine-btn').addEventListener('click', () => renderRoutineBuilderModal());
}

function renderHistoricoScreen() {
  const screen = document.getElementById('screen-historico');
  if (!screen) return;

  (async () => {
    try {
      const sessions = await window.MeuTreinoAPI.getWorkouts();
      AppState.recentSessions = Array.isArray(sessions) ? sessions : [];
      const completedSessions = AppState.recentSessions.filter((session) => session.status === 'completed');
      const totalVolume = completedSessions.reduce((sum, session) => sum + Number(session.total_volume || 0), 0);
      const averageVolume = completedSessions.length ? totalVolume / completedSessions.length : 0;
      const chartSessions = completedSessions.slice(0, 7).reverse();
      const chartMax = Math.max(...chartSessions.map((session) => Number(session.total_volume || 0)), 1);
      const contributionMatrix = Array.from({ length: 12 }, (_, weekIndex) => {
        return Array.from({ length: 7 }, (_, dayIndex) => {
          const date = new Date();
          date.setHours(0, 0, 0, 0);
          date.setDate(date.getDate() - ((11 - weekIndex) * 7 + (6 - dayIndex)));

          const volume = completedSessions.reduce((sum, session) => {
            const sessionDate = new Date(session.start_time || session.created_at);
            const sameDay = sessionDate.toDateString() === date.toDateString();
            return sameDay ? sum + Number(session.total_volume || 0) : sum;
          }, 0);

          return {
            date,
            volume,
            level: volume <= 0 ? 0 : volume >= chartMax * 0.9 ? 4 : volume >= chartMax * 0.7 ? 3 : volume >= chartMax * 0.45 ? 2 : 1,
          };
        });
      });

      screen.innerHTML = `
        <div class="app-shell history-shell">
          <header class="topbar">
            <div>
              <div class="brand">Diário</div>
              <small style="color:var(--muted);">Calendário e registros</small>
            </div>
          </header>

          <section class="screen-card history-calendar-card">
            <div class="mini-topline">
              <span>Consistência</span>
              <button class="chip-btn">Últimos 12 semanas</button>
            </div>
            <div class="contribution-graph">
              ${contributionMatrix.map((week) => `
                <div class="contribution-row">
                  ${week.map((cell) => `
                    <div class="contribution-cell level-${cell.level}" title="${cell.date.toLocaleDateString('pt-BR')} · ${cell.volume} kg"></div>
                  `).join('')}
                </div>
              `).join('')}
            </div>
            <div class="contribution-legend">
              <span>Menos</span>
              <div class="legend-scale">
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span>Mais</span>
            </div>
          </section>

          <section class="summary-grid">
            <div class="summary-card">
              <span class="summary-label">Treinos</span>
              <strong>${completedSessions.length}</strong>
            </div>
            <div class="summary-card">
              <span class="summary-label">Volume</span>
              <strong>${Math.round(totalVolume)} kg</strong>
            </div>
            <div class="summary-card">
              <span class="summary-label">Média</span>
              <strong>${Math.round(averageVolume)} kg</strong>
            </div>
            <div class="summary-card">
              <span class="summary-label">Status</span>
              <strong>${completedSessions.length ? 'OK' : '--'}</strong>
            </div>
          </section>

          <section class="card progress-chart-card">
            <div class="card-header">
              <div><h3>Volume por treino</h3><small style="color:var(--muted);">Últimos 7 treinos</small></div>
              <span class="progress-accent">KG</span>
            </div>
            ${chartSessions.length ? `
              <div class="volume-chart" aria-label="Gráfico de volume dos últimos treinos">
                ${chartSessions.map((session) => `
                  <div class="volume-column">
                    <strong>${Math.round(Number(session.total_volume || 0))}</strong>
                    <div class="volume-track"><div class="volume-bar" style="height:${Math.max(8, (Number(session.total_volume || 0) / chartMax) * 100)}%"></div></div>
                    <small>${new Date(session.start_time || session.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</small>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="history-empty-panel">
                <div class="empty-icon">↗</div>
                <p>Complete seu primeiro treino para desbloquear seu histórico e acompanhar o progresso.</p>
              </div>
            `}
          </section>

          <section class="card history-list-card">
            ${AppState.recentSessions.length ? AppState.recentSessions.map((session) => `
              <div class="routine-card history-item">
                <div class="card-header">
                  <div><h3>${session.status === 'completed' ? 'Treino concluído' : 'Treino em andamento'}</h3><small style="color:var(--muted);">${new Date(session.start_time || session.created_at).toLocaleDateString('pt-BR')}</small></div>
                  <div class="history-actions"><span class="history-status ${session.status === 'completed' ? 'completed' : ''}">${session.status === 'completed' ? 'Concluído' : 'Em aberto'}</span><button class="icon-btn" data-delete-workout="${session.id}" title="Excluir treino">✕</button></div>
                </div>
                <div class="list-item">
                  <span>${Math.round(Number(session.total_volume || 0))} kg movimentados</span>
                  <strong>${session.duration_minutes || 0} min</strong>
                </div>
              </div>
            `).join('') : `
              <div class="history-empty-panel empty-history-panel">
                <div class="empty-icon">↗</div>
                <p>Ainda não há histórico de treinos. Quando houver registros, eles aparecem aqui.</p>
              </div>
            `}
          </section>
        </div>
        ${renderNavBar()}
      `;
      screen.querySelectorAll('[data-delete-workout]').forEach((button) => {
        button.addEventListener('click', async () => {
          if (!window.confirm('Excluir este treino do histórico?')) return;
          try {
            await window.MeuTreinoAPI.deleteWorkout(button.dataset.deleteWorkout);
            AppState.recentSessions = AppState.recentSessions.filter((session) => session.id !== button.dataset.deleteWorkout);
            renderHistoricoScreen();
            showToast('Treino excluído.');
          } catch (error) {
            showToast(error.message || 'Erro ao excluir treino.');
          }
        });
      });
    } catch (error) {
      screen.innerHTML = `
        <div class="app-shell">
          <header class="topbar">
            <div>
              <div class="brand">Diário</div>
              <small style="color:var(--muted);">Seus dados aparecem aqui</small>
            </div>
          </header>
          <div class="metric-row progress-metrics">
            <div class="metric"><div class="metric-label">Treinos</div><div class="metric-value">0</div></div>
            <div class="metric"><div class="metric-label">Volume</div><div class="metric-value">0 kg</div></div>
            <div class="metric"><div class="metric-label">Média</div><div class="metric-value">0 kg</div></div>
            <div class="metric"><div class="metric-label">Status</div><div class="metric-value">--</div></div>
          </div>
          <div class="card progress-chart-card">
            <div class="card-header"><div><h3>Volume por treino</h3><small style="color:var(--muted);">Ainda sem dados sincronizados</small></div><span class="progress-accent">KG</span></div>
            <div class="empty-state compact-empty"><strong>↗</strong>Complete seu primeiro treino para acompanhar sua evolução.</div>
          </div>
        </div>
        ${renderNavBar()}
      `;
    }
  })();
}

function renderExerciseManagementScreen() {
  const screen = document.getElementById('screen-exercicios');
  if (!screen) return;

  const exerciseList = AppState.exercises.length ? AppState.exercises : [];

  screen.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div>
          <div class="brand">Exercícios</div>
          <small style="color:var(--muted);">Gerencie a biblioteca pessoal</small>
        </div>
        <button class="primary-btn" id="new-exercise-btn">+ Novo</button>
      </header>

      <div class="screen-card">
        <div class="mini-topline">
          <span>Lista de exercícios</span>
          <button class="chip-btn">${exerciseList.length} itens</button>
        </div>

        <div class="exercise-library-search" style="margin-bottom:12px;">
          <input id="exercise-library-search" type="text" placeholder="Buscar exercício ou grupo muscular" style="width:100%; min-height:48px; border-radius:12px; border:1px solid var(--border); background:var(--panel-soft); color:var(--text); padding: 0 14px;" />
        </div>

        ${exerciseList.length ? `
          <div class="list">
            ${exerciseList.map((exercise) => `
              <div class="list-item exercise-library-item" data-exercise-id="${exercise.id}">
                <div>
                  <strong>${exercise.name}</strong>
                  <div style="color:var(--muted); font-size:0.8rem;">${exercise.muscle_group || 'Grupo muscular'} · ${exercise.equipment || 'Sem equipamento'}</div>
                </div>
                <div class="btn-row">
                  <button class="icon-btn" data-edit-exercise="${exercise.id}" title="Editar">✎</button>
                  <button class="icon-btn" data-delete-exercise="${exercise.id}" title="Excluir">✕</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="empty-state compact-empty">
            <strong>💪</strong>
            Sua biblioteca está vazia. Adicione o primeiro exercício.
          </div>
        `}
      </div>
    </div>
    ${renderNavBar()}
  `;

  document.getElementById('new-exercise-btn').addEventListener('click', openExerciseModal);

  const searchInput = document.getElementById('exercise-library-search');
  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      const query = event.target.value.toLowerCase();
      const items = Array.from(document.querySelectorAll('.exercise-library-item'));
      items.forEach((item) => {
        const name = item.querySelector('strong')?.textContent.toLowerCase() || '';
        const details = item.textContent.toLowerCase();
        item.style.display = !query || name.includes(query) || details.includes(query) ? '' : 'none';
      });
    });
  }

  document.querySelectorAll('[data-delete-exercise]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Excluir este exercício da biblioteca?')) return;
      try {
        await window.MeuTreinoAPI.deleteExercise(button.dataset.deleteExercise);
        await loadUserData();
        renderExerciseManagementScreen();
        showToast('Exercício removido.');
      } catch (error) {
        showToast(error.message || 'Erro ao remover exercício.');
      }
    });
  });

  document.querySelectorAll('[data-edit-exercise]').forEach((button) => {
    button.addEventListener('click', () => {
      const exercise = AppState.exercises.find((item) => item.id === button.dataset.editExercise);
      if (!exercise) return;
      const modalRoot = document.getElementById('modal-root');
      if (!modalRoot) return;

      modalRoot.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal-panel">
            <div class="modal-header">
              <h3>Editar exercício</h3>
              <button class="ghost-btn" data-close-modal>Fechar</button>
            </div>
            <div class="form-grid">
              <div class="field">
                <label>Nome</label>
                <input id="exercise-edit-name" type="text" value="${exercise.name || ''}" />
              </div>
              <div class="field">
                <label>Grupo muscular</label>
                <input id="exercise-edit-muscle" type="text" value="${exercise.muscle_group || ''}" />
              </div>
              <div class="field">
                <label>Equipamento</label>
                <input id="exercise-edit-equipment" type="text" value="${exercise.equipment || ''}" />
              </div>
            </div>
            <div class="btn-row" style="margin-top:16px; justify-content:flex-end;">
              <button class="secondary-btn" data-close-modal>Cancelar</button>
              <button class="primary-btn" id="save-edited-exercise">Salvar</button>
            </div>
          </div>
        </div>
      `;

      modalRoot.querySelectorAll('[data-close-modal]').forEach((btn) => btn.addEventListener('click', () => { modalRoot.innerHTML = ''; }));
      document.getElementById('save-edited-exercise').addEventListener('click', async () => {
        const name = document.getElementById('exercise-edit-name').value.trim();
        const muscle = document.getElementById('exercise-edit-muscle').value.trim();
        const equipment = document.getElementById('exercise-edit-equipment').value.trim();

        if (!name || !muscle || !equipment) {
          showToast('Preencha todos os campos.');
          return;
        }

        try {
          await window.MeuTreinoAPI.updateExercise(exercise.id, { name, muscle_group: muscle, equipment, is_custom: true });
          await loadUserData();
          modalRoot.innerHTML = '';
          renderExerciseManagementScreen();
          showToast('Exercício atualizado.');
        } catch (error) {
          showToast(error.message || 'Erro ao atualizar exercício.');
        }
      });
    });
  });
}

function renderBibliotecaScreen() {
  const screen = document.getElementById('screen-biblioteca');
  if (!screen) return;

  const completedSessions = AppState.recentSessions.filter((session) => session.status === 'completed');
  const totalVolume = completedSessions.reduce((sum, session) => sum + Number(session.total_volume || 0), 0);

  screen.innerHTML = `
    <div class="app-shell progress-shell">
      <header class="topbar progress-topbar">
        <div>
          <div class="brand">Progresso</div>
        </div>
        <div class="status-pill online">● Ativo</div>
      </header>

      <div class="progress-grid">
        <div class="screen-card pr-card">
          <div class="mini-topline"><span>Recordes pessoais</span><button class="chip-btn">PR</button></div>
          ${completedSessions.length ? `
            <div class="pr-list">
              <div class="pr-item">
                <div class="pr-icon green">🏋️</div>
                <div class="pr-body">
                  <span>Volume total</span>
                  <strong>${Math.round(totalVolume)} kg</strong>
                </div>
                <small>+ ${Math.min(20, completedSessions.length * 4)}%</small>
              </div>
              <div class="pr-item">
                <div class="pr-icon yellow">🏆</div>
                <div class="pr-body">
                  <span>Treinos feitos</span>
                  <strong>${completedSessions.length}</strong>
                </div>
                <small>+ ${Math.min(18, completedSessions.length * 3)}%</small>
              </div>
              <div class="pr-item">
                <div class="pr-icon red">⚡</div>
                <div class="pr-body">
                  <span>Média por treino</span>
                  <strong>${completedSessions.length ? Math.round(totalVolume / completedSessions.length) : 0} kg</strong>
                </div>
                <small>+ ${Math.min(14, completedSessions.length * 2)}%</small>
              </div>
            </div>
          ` : `
            <div class="empty-state compact-empty">
              <strong>📉</strong>
              Conclua o primeiro treino para ver seus dados de progresso.
            </div>
          `}
        </div>

        <div class="screen-card trend-card">
          <div class="mini-topline"><span>Tendência</span><button class="chip-btn">Últimos treinos</button></div>
          ${completedSessions.length ? `
            <div class="trend-chart">
              ${completedSessions.slice(0, 6).reverse().map((session) => `
                <span class="line line-green" style="height:${Math.max(18, Math.min(92, Number(session.total_volume || 0) / 3))}%"></span>
              `).join('')}
            </div>
          ` : `
            <div class="empty-state compact-empty">
              <strong>📊</strong>
              Sem dados suficientes para exibir tendência.
            </div>
          `}
        </div>
      </div>
    </div>
    ${renderNavBar()}
  `;
}

function renderWorkoutScreen() {
  const routine = AppState.currentRoutine || AppState.routines[0];
  if (!routine) {
    setView('dashboard');
    return;
  }

  const screen = document.getElementById('screen-workout');
  if (!screen) return;
  const currentExercise = routine.exercises[WorkoutLogic.state.currentExerciseIndex];
  const setRowsList = WorkoutLogic.getSetRows(currentExercise);
  const previousOrdinals = { Aquecimento: 0, Preparação: 0, Trabalho: 0 };
  const rowsWithHistory = setRowsList.map((row) => {
    const ordinal = previousOrdinals[row.apiType];
    previousOrdinals[row.apiType] += 1;
    return { ...row, previous: WorkoutLogic.getPreviousLog(currentExercise?.exercise_id, row.apiType, ordinal) };
  });

  screen.innerHTML = `
    <div class="app-shell workout-shell">
      <header class="topbar workout-topbar">
        <div class="brand">${routine.name}</div>
        <div class="status-pill online">● vivo</div>
      </header>

      <div class="workout-scoreboard">
        <div class="timer-display" id="workout-timer">00:32:56</div>
      </div>

      <div class="screen-card workout-panel">
        <div class="series-panel-header">
          <div>
            <span class="eyebrow">Gerenciar Séries</span>
            <h3>${currentExercise?.exercise_name || 'Exercício'}</h3>
          </div>
          <span class="series-badge badge-work">${rowsWithHistory.length} séries</span>
        </div>

        <div class="series-table">
          <div class="series-table-head">
            <span>Série</span>
            <span>Tipo</span>
            <span>Reps</span>
            <span>Carga</span>
            <span>Desc.</span>
          </div>
          ${rowsWithHistory.map((row, index) => `
            <div class="series-row-item ${index === 0 ? 'selected' : ''} ${row.type === 'Trabalho' ? 'work' : row.type === 'Preparação' ? 'prep' : 'warm'} ${row.previous ? 'filled' : ''}" data-set-type="${row.apiType}" data-set-weight="${row.previous?.weight_kg ?? row.load ?? ''}" data-set-reps="${row.previous?.reps ?? row.reps ?? ''}" data-set-rir="${row.previous?.rir_rpe ?? ''}">
              <span class="series-number">${index + 1}</span>
              <span class="series-kind ${row.type === 'Trabalho' ? 'work' : row.type === 'Preparação' ? 'prep' : 'warm'}">${row.type}</span>
              <span>${row.previous?.reps ?? row.reps ?? 0}</span>
              <span>${row.previous?.weight_kg ?? row.load ?? 0} kg</span>
              <span>${row.rest ?? 60}s</span>
            </div>
          `).join('')}
        </div>

        <div class="workout-actions">
          <button class="primary-btn action-green" id="save-set-btn">Registrar Série</button>
          <button class="secondary-btn action-cyan" id="next-exercise-btn">Adicionar Série Extra</button>
          <button class="danger-btn action-red" id="finish-workout-btn">Terminar Treino</button>
        </div>
      </div>
    </div>
  `;

  const setRowsEls = document.querySelectorAll('.series-row-item');
  setRowsEls.forEach((row) => {
    row.addEventListener('click', () => {
      setRowsEls.forEach((item) => item.classList.remove('selected'));
      row.classList.add('selected');
    });
  });

  document.getElementById('save-set-btn').addEventListener('click', async () => {
    const currentExercise = routine.exercises[WorkoutLogic.state.currentExerciseIndex];
    if (!currentExercise || !WorkoutLogic.state.currentSession) {
      showToast('Sessão de treino não iniciada.');
      return;
    }

    const payload = {
      session_id: WorkoutLogic.state.currentSession.id,
      exercise_id: currentExercise.exercise_id,
      set_type: 'Trabalho',
      weight_kg: 10,
      reps: 8,
      rir_rpe: '2',
      is_completed: true,
      order_index: 0,
    };

    try {
      const savedLog = await window.MeuTreinoAPI.createWorkoutLog(WorkoutLogic.state.currentSession.id, payload);
      WorkoutLogic.state.workoutLogs.push(savedLog);
      showToast('Série registrada.');
      WorkoutLogic.startRestTimer(currentExercise.rest_seconds || 90);
    } catch (error) {
      showToast(error.message || 'Erro ao salvar série.');
    }
  });

  document.getElementById('next-exercise-btn').addEventListener('click', () => {
    showToast('Série extra adicionada.');
  });

  document.getElementById('finish-workout-btn').addEventListener('click', async () => {
    if (!WorkoutLogic.state.currentSession) {
      setView('dashboard');
      return;
    }

    try {
      const payload = {
        routine_id: WorkoutLogic.state.currentRoutine?.id || AppState.currentRoutine?.id || null,
        start_time: WorkoutLogic.state.currentSession.start_time || new Date().toISOString(),
        end_time: new Date().toISOString(),
        total_volume: WorkoutLogic.getTotalVolumeFromLogs(WorkoutLogic.state.workoutLogs),
        duration_minutes: WorkoutLogic.getCurrentSessionDuration(),
        status: 'completed',
      };

      const updatedSession = await window.MeuTreinoAPI.updateWorkout(WorkoutLogic.state.currentSession.id, payload);
      WorkoutLogic.state.currentSession = updatedSession;
      WorkoutLogic.stopTimer();
      WorkoutLogic.stopRestTimer();
      showToast('Treino finalizado');
      setView('dashboard');
      if (typeof renderHistoricoScreen === 'function') {
        renderHistoricoScreen();
      }
    } catch (error) {
      showToast(error.message || 'Erro ao finalizar treino.');
    }
  });

  WorkoutLogic.startTimer();
}

function renderNavBar() {
  return `
    <nav class="navbar">
      <div class="navbar-inner navbar-inner-wide">
        <button class="nav-btn ${AppState.view === 'dashboard' ? 'active' : ''}" data-view="dashboard">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11.5L12 4l9 7.5"></path><path d="M5 10.5V20h14v-9.5"></path></svg>
          <span class="nav-label">Início</span>
        </button>
        <button class="nav-btn ${AppState.view === 'treinos' ? 'active' : ''}" data-view="treinos">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14"></path><path d="M9 8h6M9 12h6M9 16h6"></path></svg>
          <span class="nav-label">Fichas</span>
        </button>
        <button class="nav-btn ${AppState.view === 'exercicios' ? 'active' : ''}" data-view="exercicios">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M5 12h14"></path><path d="M8 7h8v10H8z"></path></svg>
          <span class="nav-label">Exercícios</span>
        </button>
        <button class="nav-btn ${AppState.view === 'historico' ? 'active' : ''}" data-view="historico">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h2l2.5 7 3.5-14 2.5 7H20"></path></svg>
          <span class="nav-label">Diário</span>
        </button>
        <button class="nav-btn ${AppState.view === 'biblioteca' ? 'active' : ''}" data-view="biblioteca">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18"></path><path d="M7 8.5c0-1.5 1-2.5 5-2.5s5 1 5 2.5-1 2.5-5 2.5-5 1-5 2.5 1 2.5 5 2.5 5-1 5-2.5"></path></svg>
          <span class="nav-label">Progresso</span>
        </button>
        <button class="nav-btn ${AppState.view === 'workout' ? 'active' : ''}" data-view="workout">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h3l2-5 3 10 2-5h6"></path></svg>
          <span class="nav-label">Treino</span>
        </button>
      </div>
    </nav>
  `;
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  container.innerHTML = `<div class="toast show">${message}</div>`;
  setTimeout(() => {
    const toast = container.querySelector('.toast');
    if (toast) toast.classList.remove('show');
  }, 2200);
}

async function startWorkoutFlow(routineId = null) {
  const routine = AppState.routines.find((item) => item.id === (routineId || AppState.routines[0]?.id)) || AppState.routines[0];
  if (!routine) {
    showToast('Crie uma ficha antes de iniciar o treino.');
    return;
  }

  AppState.currentRoutine = routine;
  WorkoutLogic.state.currentRoutine = routine;
  WorkoutLogic.state.currentExerciseIndex = 0;
  WorkoutLogic.state.workoutLogs = [];
  WorkoutLogic.state.previousLogs = [];
  WorkoutLogic.stopTimer();
  WorkoutLogic.stopRestTimer();
  WorkoutLogic.state.timerSeconds = 0;

  try {
    const completedSession = AppState.recentSessions.find((session) => session.status === 'completed' && session.routine_id === routine.id);
    if (completedSession) {
      WorkoutLogic.state.previousLogs = await window.MeuTreinoAPI.getWorkoutLogs(completedSession.id).catch(() => []);
    }
    const session = await window.MeuTreinoAPI.createWorkout({
      routine_id: routine.id,
      start_time: new Date().toISOString(),
      total_volume: 0,
      duration_minutes: 0,
      status: 'in_progress'
    });

    WorkoutLogic.state.currentSession = session;
    setView('workout');
    WorkoutLogic.startTimer();
  } catch (error) {
    showToast(error.message || 'Erro ao iniciar treino.');
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('app');
  root.innerHTML = `
    <div id="screen-login" class="screen"></div>
    <div id="screen-dashboard" class="screen"></div>
    <div id="screen-treinos" class="screen"></div>
    <div id="screen-exercicios" class="screen"></div>
    <div id="screen-historico" class="screen"></div>
    <div id="screen-biblioteca" class="screen"></div>
    <div id="screen-workout" class="screen"></div>
  `;

  document.body.addEventListener('click', (event) => {
    const navBtn = event.target.closest('.nav-btn');
    if (navBtn) {
      const target = navBtn.dataset.view;
      if (target) setView(target);
    }
  });

  await initApp();
  if (!AppState.currentUser) {
    setView('login');
  }
});
