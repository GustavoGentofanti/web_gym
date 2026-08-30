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

function renderRoutineBuilderModal(routineToEdit = null) {
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return;

  const selectedExercises = (routineToEdit?.exercises || []).map((item) => ({
    ...item,
    warmup_sets: Number(item.warmup_sets || 0),
    prep_sets: Number(item.prep_sets || 0),
    exercise_name: item.exercise_name || AppState.exercises.find((exercise) => exercise.id === item.exercise_id)?.name || 'Exercício',
  }));
  const availableExercises = AppState.exercises.length ? AppState.exercises : [];

  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-panel">
        <div class="modal-header">
          <h3>${routineToEdit ? 'Editar ficha' : 'Nova ficha'}</h3>
          <button class="ghost-btn" data-close-modal>Fechar</button>
        </div>
        <div class="field">
          <label>Nome da ficha</label>
          <input id="routine-name-input" type="text" placeholder="Treino A" value="${routineToEdit?.name || ''}" />
        </div>

        <div class="field">
          <label>Exercício</label>
          <select id="routine-exercise-select">
            ${availableExercises.length ? availableExercises.map((exercise) => `<option value="${exercise.id}">${exercise.name} (${exercise.muscle_group})</option>`).join('') : '<option value="">Cadastre um exercício primeiro</option>'}
          </select>
        </div>

        <div class="small-grid">
          <div class="field">
            <label>Aquecimento (A)</label>
            <input id="routine-warmup-input" type="number" min="0" max="10" value="0" />
          </div>
          <div class="field">
            <label>Preparação (P)</label>
            <input id="routine-prep-input" type="number" min="0" max="10" value="0" />
          </div>
          <div class="field">
            <label>Trabalho (T)</label>
            <input id="routine-sets-input" type="number" min="1" value="3" />
          </div>
          <div class="field">
            <label>Reps min</label>
            <input id="routine-reps-min-input" type="number" min="1" value="8" />
          </div>
          <div class="field">
            <label>Reps max</label>
            <input id="routine-reps-max-input" type="number" min="1" value="12" />
          </div>
          <div class="field">
            <label>Descanso</label>
            <input id="routine-rest-input" type="number" min="0" value="90" />
          </div>
        </div>

        <div class="btn-row" style="margin-top:10px; justify-content:flex-start;">
          <button class="secondary-btn" id="add-routine-item-btn">Adicionar exercício</button>
        </div>

        <div id="routine-selected-items" style="margin-top:16px; display:flex; flex-direction:column; gap:8px;"></div>

        <div class="btn-row" style="margin-top:16px; justify-content:flex-end;">
          <button class="secondary-btn" data-close-modal>Cancelar</button>
          <button class="primary-btn" id="save-routine-btn">${routineToEdit ? 'Salvar alterações' : 'Salvar ficha'}</button>
        </div>
      </div>
    </div>
  `;

  const updateSelectedList = () => {
    const container = document.getElementById('routine-selected-items');
    if (!container) return;
    if (!selectedExercises.length) {
      container.innerHTML = '<div class="empty-state">Nenhum exercício adicionado.</div>';
      return;
    }

    container.innerHTML = selectedExercises.map((item, index) => `
      <div class="list-item">
        <span>${item.exercise_name}</span>
        <strong>${item.warmup_sets}A + ${item.prep_sets}P + ${item.target_sets}T • ${item.target_reps_min}-${item.target_reps_max}</strong>
        <button class="icon-btn" data-remove-routine-item="${index}">✕</button>
      </div>
    `).join('');

    container.querySelectorAll('[data-remove-routine-item]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.removeRoutineItem);
        selectedExercises.splice(index, 1);
        updateSelectedList();
      });
    });
  };

  modalRoot.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => {
      modalRoot.innerHTML = '';
    });
  });

  document.getElementById('add-routine-item-btn').addEventListener('click', () => {
    const select = document.getElementById('routine-exercise-select');
    const exerciseId = select.value;
    const exercise = AppState.exercises.find((item) => item.id === exerciseId);

    if (!exercise) {
      showToast('Selecione um exercício válido.');
      return;
    }

    selectedExercises.push({
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      warmup_sets: Number(document.getElementById('routine-warmup-input').value || 0),
      prep_sets: Number(document.getElementById('routine-prep-input').value || 0),
      target_sets: Number(document.getElementById('routine-sets-input').value || 3),
      target_reps_min: Number(document.getElementById('routine-reps-min-input').value || 8),
      target_reps_max: Number(document.getElementById('routine-reps-max-input').value || 12),
      rest_seconds: Number(document.getElementById('routine-rest-input').value || 90),
      order_index: selectedExercises.length,
    });

    updateSelectedList();
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
      const payload = { name, exercises: selectedExercises };
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

  if (selectedExercises[0]) {
    document.getElementById('routine-warmup-input').value = selectedExercises[0].warmup_sets;
    document.getElementById('routine-prep-input').value = selectedExercises[0].prep_sets;
    document.getElementById('routine-sets-input').value = selectedExercises[0].target_sets;
    document.getElementById('routine-reps-min-input').value = selectedExercises[0].target_reps_min;
    document.getElementById('routine-reps-max-input').value = selectedExercises[0].target_reps_max;
    document.getElementById('routine-rest-input').value = selectedExercises[0].rest_seconds;
  }
  updateSelectedList();
}

function renderLoginScreen() {
  const screen = document.getElementById('screen-login');
  if (!screen) return;

  screen.innerHTML = `
    <div class="app-shell">
      <div class="auth-form">
        <h2>Entrar</h2>
        <div class="form-grid">
          <div class="field">
            <label for="login-email">E-mail</label>
            <input id="login-email" type="email" placeholder="seu@email.com" />
          </div>
          <div class="field">
            <label for="login-password">Senha</label>
            <input id="login-password" type="password" placeholder="Senha" />
          </div>
          <button class="primary-btn" id="login-submit">Entrar</button>
        </div>
        <div class="auth-switch">
          <span>Não tem conta?</span>
          <button class="ghost-btn" id="switch-to-register">Criar conta</button>
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
    <div class="app-shell">
      <div class="auth-form">
        <h2>Criar conta</h2>
        <div class="form-grid">
          <div class="field">
            <label for="register-name">Nome</label>
            <input id="register-name" type="text" placeholder="Seu nome" />
          </div>
          <div class="field">
            <label for="register-email">E-mail</label>
            <input id="register-email" type="email" placeholder="seu@email.com" />
          </div>
          <div class="field">
            <label for="register-password">Senha</label>
            <input id="register-password" type="password" placeholder="Mínimo 6 caracteres" />
          </div>
          <button class="primary-btn" id="register-submit">Cadastrar</button>
        </div>
        <div class="auth-switch">
          <span>Já tem conta?</span>
          <button class="ghost-btn" id="switch-to-login">Entrar</button>
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

  screen.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div>
          <div class="brand">Meu Treino</div>
          <small style="color:var(--muted);">Bom treino, ${user?.name || 'atleta'}</small>
        </div>
        <div class="status-pill ${navigator.onLine ? 'online' : 'offline'}">${navigator.onLine ? '● Online' : '● Offline'}</div>
      </header>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3>Treino de hoje</h3>
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
      <div class="card" style="margin-top:16px;">
        <div class="card-header">
          <h3>Próximo treino</h3>
        </div>
        <div class="list-item">
          <span>${activeRoutine?.name || 'Crie sua primeira ficha'}</span>
          <button class="primary-btn" id="dashboard-create-routine">${activeRoutine ? 'Gerenciar' : 'Criar'}</button>
        </div>
      </div>
    </div>
    ${renderNavBar()}
  `;

  document.getElementById('dashboard-start-btn').addEventListener('click', () => startWorkoutFlow());
  document.getElementById('dashboard-create-routine').addEventListener('click', () => renderRoutineBuilderModal());
}

function renderTreinosScreen() {
  const screen = document.getElementById('screen-treinos');
  if (!screen) return;
  screen.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">Meus Treinos</div>
        <button class="primary-btn" id="new-routine-btn">+ Nova ficha</button>
      </header>
      <div class="list" id="routine-list"></div>
    </div>
    ${renderNavBar()}
  `;

  const list = document.getElementById('routine-list');
  if (!AppState.routines.length) {
    list.innerHTML = `
      <div class="empty-state">
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
    list.innerHTML = AppState.routines.map((routine) => `
      <div class="routine-card">
        <div class="card-header">
          <h3>${routine.name}</h3>
          <div class="btn-row">
            <button class="icon-btn" data-action="start" data-id="${routine.id}">▶</button>
            <button class="icon-btn" data-action="edit" data-id="${routine.id}" title="Editar ficha">✎</button>
            <button class="icon-btn" data-action="delete" data-id="${routine.id}">✕</button>
          </div>
        </div>
        <div class="list">
          ${(routine.exercises || []).map((item) => `
            <div class="list-item">
              <span>${item.exercise_name || item.exercise_id}</span>
              <strong>${item.target_sets}x${item.target_reps_min}-${item.target_reps_max}</strong>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

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

      screen.innerHTML = `
        <div class="app-shell">
          <header class="topbar">
            <div>
              <div class="brand">Seu progresso</div>
              <small style="color:var(--muted);">Consistência antes da perfeição</small>
            </div>
          </header>
          <div class="metric-row progress-metrics">
            <div class="metric"><div class="metric-label">Treinos concluídos</div><div class="metric-value">${completedSessions.length}</div></div>
            <div class="metric"><div class="metric-label">Volume total</div><div class="metric-value">${Math.round(totalVolume)} kg</div></div>
            <div class="metric"><div class="metric-label">Média por treino</div><div class="metric-value">${Math.round(averageVolume)} kg</div></div>
            <div class="metric"><div class="metric-label">Melhor fase</div><div class="metric-value">${completedSessions.length ? 'Ativa' : '--'}</div></div>
          </div>
          <div class="card progress-chart-card">
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
            ` : '<div class="empty-state compact-empty">Complete seu primeiro treino para desbloquear seus dados.</div>'}
          </div>
          <div class="list">
            ${AppState.recentSessions.length ? AppState.recentSessions.map((session) => `
              <div class="routine-card history-item">
                <div class="card-header">
                  <div><h3>${session.status === 'completed' ? 'Treino concluído' : 'Treino em andamento'}</h3><small style="color:var(--muted);">${new Date(session.start_time || session.created_at).toLocaleDateString('pt-BR')}</small></div>
                  <div class="history-actions"><span class="history-status ${session.status}">${session.status === 'completed' ? 'Concluído' : 'Em aberto'}</span><button class="icon-btn" data-delete-workout="${session.id}" title="Excluir treino">✕</button></div>
                </div>
                <div class="list-item">
                  <span>${Math.round(Number(session.total_volume || 0))} kg movimentados</span>
                  <strong>${session.duration_minutes || 0} min</strong>
                </div>
              </div>
            `).join('') : `
              <div class="card"><div class="empty-state"><strong>↗</strong>Ainda não há histórico de treinos.</div></div>
            `}
          </div>
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
              <div class="brand">Seu progresso</div>
              <small style="color:var(--muted);">Seus dados aparecem aqui</small>
            </div>
          </header>
          <div class="metric-row progress-metrics">
            <div class="metric"><div class="metric-label">Treinos concluídos</div><div class="metric-value">0</div></div>
            <div class="metric"><div class="metric-label">Volume total</div><div class="metric-value">0 kg</div></div>
            <div class="metric"><div class="metric-label">Média por treino</div><div class="metric-value">0 kg</div></div>
            <div class="metric"><div class="metric-label">Melhor fase</div><div class="metric-value">--</div></div>
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

function renderBibliotecaScreen() {
  const screen = document.getElementById('screen-biblioteca');
  if (!screen) return;
  screen.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">Biblioteca</div>
        <button class="primary-btn" id="new-exercise-btn">+ Novo</button>
      </header>
      <div class="card">
        <div class="field exercise-search">
          <input id="exercise-search-input" type="text" placeholder="Buscar exercício" />
        </div>
        <div class="list">
          ${AppState.exercises.length ? AppState.exercises.map((exercise) => `
            <div class="list-item">
              <span>${exercise.name}</span>
              <small>${exercise.muscle_group} • ${exercise.equipment}</small>
            </div>
          `).join('') : '<div class="empty-state">Nenhum exercício encontrado.</div>'}
        </div>
      </div>
    </div>
    ${renderNavBar()}
  `;

  document.getElementById('new-exercise-btn').addEventListener('click', () => openExerciseModal());

  document.getElementById('exercise-search-input')?.addEventListener('input', (event) => {
    const search = event.target.value.trim().toLowerCase();
    const items = [...document.querySelectorAll('#screen-biblioteca .list-item')];
    items.forEach((item) => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(search) ? 'flex' : 'none';
    });
  });
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
  const setRows = WorkoutLogic.getSetRows(currentExercise);
  const previousOrdinals = { Aquecimento: 0, Preparação: 0, Trabalho: 0 };
  const rowsWithHistory = setRows.map((row) => {
    const ordinal = previousOrdinals[row.apiType];
    previousOrdinals[row.apiType] += 1;
    return { ...row, previous: WorkoutLogic.getPreviousLog(currentExercise?.exercise_id, row.apiType, ordinal) };
  });
  const progress = WorkoutLogic.getExerciseProgress(currentExercise);

  screen.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">Modo treino</div>
        <div class="timer" id="workout-timer">00:00</div>
      </header>

      <div class="workout-area">
        <div class="card">
          <div class="workout-header">
            <div>
              <div style="color:var(--muted);font-size:0.8rem;">Treino em andamento</div>
              <h3>${routine.name}</h3>
            </div>
            <button class="secondary-btn" id="finish-workout-btn">Finalizar</button>
          </div>
          <div class="timer" id="rest-timer">01:30</div>
        </div>

        <div class="card">
          <div class="exercise-board-header">
            <div><span class="eyebrow">Exercício ${WorkoutLogic.state.currentExerciseIndex + 1} de ${routine.exercises.length}</span><h3>${currentExercise?.exercise_name || 'Exercício'}</h3></div>
            <span class="previous-label">Último treino</span>
          </div>
          <div class="progress-coach">
            <div><span class="eyebrow">Próxima meta</span><strong>${progress.suggestion || 'Registre sua primeira série'}</strong><small>${progress.message || 'Seu histórico vai gerar uma sugestão de progressão.'}</small></div>
            <div class="record-chip"><span>PR</span><strong>${progress.bestWeight ? `${progress.bestWeight} kg` : '--'}</strong><small>melhor carga</small></div>
          </div>
          <div class="set-board">
            <div class="set-board-head"><span>Série</span><span>Último</span><span>kg</span><span>Reps</span><span>Desc.</span><span>Feito</span></div>
            ${rowsWithHistory.map((row) => `
              <div class="set-row ${row.type === 'T' ? 'work-row' : ''}" tabindex="0" role="group" data-set-type="${row.apiType}" data-set-weight="${row.previous?.weight_kg ?? ''}" data-set-reps="${row.previous?.reps ?? ''}" data-set-rir="${row.previous?.rir_rpe ?? ''}">
                <span class="set-badge set-${row.type.toLowerCase()}">${row.type}</span>
                <span class="set-last">${row.previous ? `${row.previous.weight_kg}x${row.previous.reps}` : '-'}</span>
                <input class="set-inline-input set-weight-value" type="number" min="0" step="0.5" value="${row.previous?.weight_kg ?? ''}" placeholder="0" aria-label="Carga da série ${row.index + 1}" />
                <input class="set-inline-input set-reps-value" type="number" min="0" max="100" value="${row.previous?.reps ?? ''}" placeholder="${currentExercise?.target_reps_min || 0}-${currentExercise?.target_reps_max || 0}" aria-label="Repetições da série ${row.index + 1}" />
                <span class="set-rest">${currentExercise?.rest_seconds || 90}s</span>
                <input class="set-check-input" type="checkbox" ${row.previous?.is_completed ? 'checked' : ''} aria-label="Série ${row.index + 1} concluída" />
              </div>
            `).join('')}
          </div>
          <div class="set-grid">
            <div class="field">
              <label>Carga</label>
              <input id="set-weight" type="number" inputmode="decimal" step="0.5" placeholder="30" />
            </div>
            <div class="field">
              <label>Repetições</label>
              <input id="set-reps" type="number" inputmode="numeric" placeholder="10" />
            </div>
            <div class="field">
              <label>RIR/RPE</label>
              <input id="set-rir" type="text" placeholder="2" />
            </div>
            <div class="field">
              <label>Tipo</label>
              <select id="set-type">
                <option>Trabalho</option>
                <option>Aquecimento</option>
                <option>Preparação</option>
              </select>
            </div>
          </div>
          <div class="checkbox-row" style="margin-top:12px;">
            <span>Série concluída</span>
            <input id="set-completed" type="checkbox" />
          </div>
          <div class="btn-row" style="margin-top:16px;">
            <button class="primary-btn" id="save-set-btn">✓ Concluída</button>
            <button class="secondary-btn" id="next-exercise-btn">Próximo exercício</button>
          </div>
        </div>
      </div>
    </div>
  `;

  screen.querySelectorAll('.set-row').forEach((row) => {
    const selectRow = () => {
      document.getElementById('set-type').value = row.dataset.setType;
      document.getElementById('set-weight').value = row.querySelector('.set-weight-value').value;
      document.getElementById('set-reps').value = row.querySelector('.set-reps-value').value;
      document.getElementById('set-rir').value = row.dataset.setRir;
      document.getElementById('set-completed').checked = row.querySelector('.set-check-input').checked;
      screen.querySelectorAll('.set-row').forEach((item) => item.classList.remove('selected'));
      row.classList.add('selected');
    };
    row.addEventListener('click', selectRow);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') selectRow();
    });
    row.querySelectorAll('input').forEach((input) => input.addEventListener('click', (event) => {
      event.stopPropagation();
      selectRow();
    }));
  });

  document.getElementById('save-set-btn').addEventListener('click', async () => {
    const currentExercise = routine.exercises[WorkoutLogic.state.currentExerciseIndex];
    if (!currentExercise || !WorkoutLogic.state.currentSession) {
      showToast('Sessão de treino não iniciada.');
      return;
    }

    const selectedRow = screen.querySelector('.set-row.selected') || screen.querySelector('.set-row');
    const payload = {
      session_id: WorkoutLogic.state.currentSession.id,
      exercise_id: currentExercise.exercise_id,
      set_type: selectedRow?.dataset.setType || document.getElementById('set-type').value,
      weight_kg: Number(selectedRow?.querySelector('.set-weight-value').value || document.getElementById('set-weight').value || 0),
      reps: Number(selectedRow?.querySelector('.set-reps-value').value || document.getElementById('set-reps').value || 0),
      rir_rpe: document.getElementById('set-rir').value,
      is_completed: selectedRow?.querySelector('.set-check-input').checked || document.getElementById('set-completed').checked,
      order_index: selectedRow ? Number([...screen.querySelectorAll('.set-row')].indexOf(selectedRow)) : WorkoutLogic.state.currentExerciseIndex,
    };

    try {
      const savedLog = await window.MeuTreinoAPI.createWorkoutLog(WorkoutLogic.state.currentSession.id, payload);
      WorkoutLogic.state.workoutLogs.push(savedLog);
      if (selectedRow) {
        selectedRow.querySelector('.set-check-input').checked = payload.is_completed;
        selectedRow.querySelector('.set-last').textContent = `${payload.weight_kg}x${payload.reps}`;
      }

      const totalVolume = WorkoutLogic.getTotalVolumeFromLogs(WorkoutLogic.state.workoutLogs);
      await window.MeuTreinoAPI.updateWorkout(WorkoutLogic.state.currentSession.id, {
        ...WorkoutLogic.state.currentSession,
        total_volume: totalVolume,
        duration_minutes: WorkoutLogic.getCurrentSessionDuration(),
        status: 'in_progress',
        end_time: null,
      });

      WorkoutLogic.showToast('✓ Série salva');
      if (payload.is_completed) {
        WorkoutLogic.startRestTimer(currentExercise.rest_seconds || 90);
      }
    } catch (error) {
      showToast(error.message || 'Erro ao salvar série.');
    }
  });

  document.getElementById('next-exercise-btn').addEventListener('click', () => {
    if (!routine.exercises.length) {
      return;
    }

    const nextIndex = Math.min(WorkoutLogic.state.currentExerciseIndex + 1, routine.exercises.length - 1);
    WorkoutLogic.state.currentExerciseIndex = nextIndex;
    renderWorkoutScreen();
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
      <div class="navbar-inner">
        <button class="nav-btn ${AppState.view === 'dashboard' ? 'active' : ''}" data-view="dashboard">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11.5L12 4l9 7.5"></path><path d="M5 10.5V20h14v-9.5"></path></svg>
          <span class="nav-label">Visão</span>
        </button>
        <button class="nav-btn ${AppState.view === 'treinos' ? 'active' : ''}" data-view="treinos">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14"></path><path d="M9 8h6M9 12h6M9 16h6"></path></svg>
          <span class="nav-label">Treinos</span>
        </button>
        <button class="nav-btn ${AppState.view === 'historico' ? 'active' : ''}" data-view="historico">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h2l2.5 7 3.5-14 2.5 7H20"></path></svg>
          <span class="nav-label">Histórico</span>
        </button>
        <button class="nav-btn ${AppState.view === 'biblioteca' ? 'active' : ''}" data-view="biblioteca">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v15.5H6.5A2.5 2.5 0 0 0 4 22V6.5z"></path><path d="M8 8h8M8 12h8"></path></svg>
          <span class="nav-label">Biblioteca</span>
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
