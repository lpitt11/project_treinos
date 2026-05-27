// ===== STATE =====
const state = {
  tema: 'dark',
  perfil: { nome: '', foto: '', idade: '', peso: '', altura: '', objetivo: 'hipertrofia' },
  planos: [],
  cardapios: [],
  historico: [],
  dieta: { meta: { cal: 0, prot: 0, carb: 0, gord: 0 }, refeicoes: [] },
  agua: { data: '', ml: 0, meta: 3000 },
  pesos: [], // Historico de pesos
  editingPlanoId: null,
  editingCardapioId: null,
  editingRefeicaoId: null,
  tempExercicios: [],   
  tempRefeicoesCardapio: [],
  tempAlimentos: [],    
  editingExercicioIdx: null,
  editingRefeicaoCardapioIdx: null,
  confirmCallback: null,
};

let currentUserId = null;

// ===== AUTENTICAÇÃO / LOGOUT =====
document.getElementById('btn-logout').addEventListener('click', async () => {
  await supaClient.auth.signOut();
  window.location.href = 'landing.html';
});

// ===== PERSISTENCE =====
async function save() {
  if (!currentUserId) return;
  const { error } = await supaClient
    .from('user_state')
    .update({ app_state: state })
    .eq('user_id', currentUserId);
  
  if (error) console.error("Erro ao salvar dados: ", error);
}

async function load() {
  const { data: { session }, error: authError } = await supaClient.auth.getSession();
  
  if (authError || !session) {
    window.location.href = 'landing.html';
    return;
  }
  
  currentUserId = session.user.id;
  
  const { data, error } = await supaClient
    .from('user_state')
    .select('app_state')
    .eq('user_id', currentUserId)
    .single();

  if (data && data.app_state) {
    Object.assign(state, data.app_state);
  } else if (!data) {
    await supaClient.from('user_state').insert([{ user_id: currentUserId, app_state: state }]);
  }
}

// ===== ID GENERATOR =====
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ===== NAVIGATION =====
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Ignora botões que não são de abas (ex: trocar tema, logout)
    if (!btn.dataset.tab) return; 

    document.querySelectorAll('.nav-btn').forEach(b => {
      if (b.dataset.tab) b.classList.remove('active');
    });
    
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    
    if(btn.dataset.tab === 'dashboard') {
      updateDashboard();
      renderPesoChart();
    } else if(btn.dataset.tab === 'cardapios') {
      renderCardapios();
    }
  });
});

// ===== MODAL HELPERS =====
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    closeModal(btn.dataset.close);
    // Limpar o cronômetro do treino APENAS se o treino NÃO estiver rodando ativamente
    if(btn.dataset.close === 'modal-executar' && workoutTimerInterval && !isWorkoutRunning) {
      clearInterval(workoutTimerInterval);
    }
  });
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      closeModal(overlay.id);
      if(overlay.id === 'modal-executar' && workoutTimerInterval && !isWorkoutRunning) {
        clearInterval(workoutTimerInterval);
      }
    }
  });
});

// ===== CONFIRM DIALOG =====
function showConfirm(msg, cb) {
  document.getElementById('confirm-msg').textContent = msg;
  state.confirmCallback = cb;
  openModal('modal-confirm');
}
document.getElementById('btn-confirm-delete').addEventListener('click', () => {
  if (state.confirmCallback) state.confirmCallback();
  state.confirmCallback = null;
  closeModal('modal-confirm');
});

// ===== DASHBOARD =====
function updateDashboard() {
  const hoje = new Date();
  document.getElementById('dashboard-date').textContent =
    hoje.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();
  const treinosMes = state.historico.filter(h => {
    const d = new Date(h.data + 'T12:00:00');
    return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  }).length;

  document.getElementById('stat-treinos').textContent = treinosMes;
  document.getElementById('stat-exercicios').textContent = state.planos.reduce((acc, p) => acc + p.exercicios.length, 0);
  document.getElementById('stat-planos').textContent = state.planos.length;
  document.getElementById('stat-refeicoes').textContent = state.dieta.refeicoes.length;

  const diasSemana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const diaHoje = diasSemana[hoje.getDay()];
  const ul = document.getElementById('proximos-treinos');
  const planosHoje = state.planos.filter(p => p.dias.includes(diaHoje));
  
  if (planosHoje.length === 0 || state.planos.length === 0) {
    ul.innerHTML = '<li class="empty-msg">Nenhum treino para hoje.</li>';
  } else {
    ul.innerHTML = planosHoje.map(p => `
      <li class="hover-card" onclick="abrirExecucao('${p.id}')" title="Clique para iniciar o treino">
        <span style="display:flex; align-items:center; gap:8px;">
          <span style="color:var(--accent);">▶</span> 
          <strong style="color:var(--text);">${p.nome}</strong>
        </span>
        <span class="dia-tag">${diaHoje}</span>
      </li>
    `).join('');
  }

  const ulH = document.getElementById('historico-recente');
  const recentes = [...state.historico].reverse().slice(0, 4);
  if (recentes.length === 0) {
    ulH.innerHTML = '<li class="empty-msg">Nenhum treino registrado.</li>';
  } else {
    ulH.innerHTML = recentes.map(h => `<li><span>${h.planoNome}</span><span style="color:var(--text2);font-size:12px">${formatDate(h.data)}</span></li>`).join('');
  }

  updateWaterUI();
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ===== MÓDULO: ÁGUA =====
function checkWaterDay() {
  const hojeStr = new Date().toISOString().split('T')[0];
  if(state.agua.data !== hojeStr) {
    state.agua.data = hojeStr;
    state.agua.ml = 0; 
    save();
  }
}

function updateWaterUI() {
  checkWaterDay();
  document.getElementById('water-current').textContent = state.agua.ml;
  document.getElementById('water-goal').textContent = state.agua.meta;
  const pct = Math.min((state.agua.ml / state.agua.meta) * 100, 100);
  document.getElementById('water-fill').style.width = pct + '%';
  
  const successMsg = document.getElementById('water-success-msg');
  
  if (state.agua.ml >= state.agua.meta && state.agua.meta > 0) {
    document.getElementById('water-current').style.color = 'var(--accent)';
    if (successMsg) successMsg.style.display = 'block';
  } else {
    document.getElementById('water-current').style.color = 'var(--text)';
    if (successMsg) successMsg.style.display = 'none';
  }
}

function addWater(ml) {
  state.agua.ml += ml;
  save();
  updateWaterUI();
}

document.getElementById('btn-salvar-meta-agua').addEventListener('click', () => {
  const v = parseInt(document.getElementById('input-meta-agua').value);
  if(v > 0) { state.agua.meta = v; save(); updateWaterUI(); }
  closeModal('modal-meta-agua');
});

// ===== MÓDULO: GRÁFICO DE PESO =====
let pesoChartInst = null;
function renderPesoChart() {
  const ctx = document.getElementById('pesoChart').getContext('2d');
  const data = [...state.pesos].sort((a,b) => a.data.localeCompare(b.data)).slice(-10); 
  
  if(pesoChartInst) pesoChartInst.destroy();
  
  const isLight = state.tema === 'light';
  const gridColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
  const tickColor = isLight ? '#52525b' : '#9090a0';
  
  pesoChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => formatDate(d.data)),
      datasets: [{ 
        label: 'Peso (kg)', 
        data: data.map(d => d.peso), 
        borderColor: '#c8f135', 
        backgroundColor: 'rgba(200,241,53,0.1)', 
        fill: true, 
        tension: 0.3,
        pointBackgroundColor: '#0d0d0f',
        pointBorderColor: '#c8f135'
      }]
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false,
      scales: { 
        y: { grid: { color: gridColor }, ticks: { color: tickColor } },
        x: { grid: { display: false }, ticks: { color: tickColor } }
      }, 
      plugins: { legend: { display: false } } 
    }
  });
}

document.getElementById('btn-salvar-peso').addEventListener('click', () => {
  const p = parseFloat(document.getElementById('input-peso-hoje').value);
  const d = document.getElementById('input-data-peso').value;
  if(!p || !d) { alert('Preencha peso e data.'); return; }
  
  const idx = state.pesos.findIndex(x => x.data === d);
  if(idx > -1) state.pesos[idx].peso = p;
  else state.pesos.push({ data: d, peso: p });
  
  save();
  closeModal('modal-peso');
  renderPesoChart();
});

// ===== MÓDULO: CRONÔMETRO DE DESCANSO (SEGUNDO PLANO) =====
let timerInterval;
let timerEndTime = 0;
let timerRemaining = 0;
let isTimerPaused = false;

function startTimer(seconds) {
  timerRemaining = seconds;
  isTimerPaused = false;
  timerEndTime = Date.now() + (timerRemaining * 1000);
  
  document.getElementById('floating-timer').style.display = 'flex';
  document.getElementById('timer-action-btn').textContent = 'Pausar';
  
  updateTimerUI(timerRemaining);
  clearInterval(timerInterval);
  
  timerInterval = setInterval(() => {
    if(!isTimerPaused) {
      const now = Date.now();
      timerRemaining = Math.max(0, Math.ceil((timerEndTime - now) / 1000));
      updateTimerUI(timerRemaining);
      
      if(timerRemaining <= 0) { 
        clearInterval(timerInterval); 
        playBeep();
      }
    }
  }, 200);
}

function updateTimerUI(secs) {
  const m = Math.floor(Math.max(secs, 0) / 60).toString().padStart(2, '0');
  const s = (Math.max(secs, 0) % 60).toString().padStart(2, '0');
  document.getElementById('timer-display').textContent = `${m}:${s}`;
}

function toggleTimer() {
  isTimerPaused = !isTimerPaused;
  if (!isTimerPaused) {
    timerEndTime = Date.now() + (timerRemaining * 1000);
  }
  document.getElementById('timer-action-btn').textContent = isTimerPaused ? 'Retomar' : 'Pausar';
}

function addTimerTime(secs) {
  timerRemaining += secs;
  if (!isTimerPaused) {
    timerEndTime += (secs * 1000);
  }
  updateTimerUI(timerRemaining);
}

function closeTimer() {
  clearInterval(timerInterval);
  document.getElementById('floating-timer').style.display = 'none';
}

function playBeep() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  function beepAt(time) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.00001, time + 0.4);
    osc.start(time);
    osc.stop(time + 0.4);
  }
  const now = ctx.currentTime;
  beepAt(now);
  beepAt(now + 0.6);
  beepAt(now + 1.2);
}

// ===== PLANOS DE TREINO (GERENCIAMENTO) =====
document.getElementById('btn-novo-plano').addEventListener('click', () => {
  state.editingPlanoId = null;
  state.tempExercicios = [];
  document.getElementById('plano-nome').value = '';
  document.getElementById('modal-plano-title').textContent = 'Novo Plano de Treino';
  document.querySelectorAll('.dia-btn:not(.c-dia-btn)').forEach(b => b.classList.remove('selected'));
  renderExerciciosEdit();
  openModal('modal-plano');
});

document.getElementById('btn-salvar-plano').addEventListener('click', () => {
  const nome = document.getElementById('plano-nome').value.trim();
  if (!nome) { alert('Digite um nome para o plano.'); return; }
  const dias = [...document.querySelectorAll('#dias-selector .dia-btn.selected')].map(b => b.dataset.dia);

  if (state.editingPlanoId) {
    const idx = state.planos.findIndex(p => p.id === state.editingPlanoId);
    if (idx !== -1) {
      state.planos[idx].nome = nome;
      state.planos[idx].dias = dias;
      state.planos[idx].exercicios = [...state.tempExercicios];
    }
  } else {
    state.planos.push({ id: uid(), nome, dias, exercicios: [...state.tempExercicios] });
  }
  save();
  closeModal('modal-plano');
  renderPlanos();
  renderExecutar();
  updateDashboard();
});

document.querySelectorAll('.dia-btn:not(.c-dia-btn)').forEach(btn => {
  btn.addEventListener('click', () => btn.classList.toggle('selected'));
});

function renderPlanos() {
  const grid = document.getElementById('planos-grid');
  if (state.planos.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">💪</div><p>Nenhum plano criado ainda.<br>Clique em <b>+ Novo Plano</b> para começar.</p></div>`;
    return;
  }
  grid.innerHTML = state.planos.map(p => `
    <div class="plano-card">
      <div class="plano-nome">${escHtml(p.nome)}</div>
      <div class="plano-dias">${p.dias.map(d => `<span class="dia-tag">${d}</span>`).join('') || '<span style="color:var(--text3);font-size:12px">Nenhum dia definido</span>'}</div>
      <div class="plano-exercicios-count">${p.exercicios.length} exercício${p.exercicios.length !== 1 ? 's' : ''}</div>
      ${p.exercicios.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:6px">
          ${p.exercicios.slice(0,3).map(ex => `
            <div class="exercicio-item">
              <div>
                <div class="exercicio-nome">${escHtml(ex.nome)}</div>
                <div class="exercicio-info">${ex.series}x${ex.reps} ${ex.carga ? '— ' + ex.carga + 'kg' : ''}</div>
              </div>
            </div>
          `).join('')}
          ${p.exercicios.length > 3 ? `<div style="color:var(--text3);font-size:12px;text-align:center">+${p.exercicios.length - 3} mais</div>` : ''}
        </div>
      ` : ''}
      <div class="plano-actions">
        <button class="btn-ghost" onclick="editarPlano('${p.id}')">✏️ Editar</button>
        <button class="btn-ghost" onclick="excluirPlano('${p.id}')">🗑️ Excluir</button>
      </div>
    </div>
  `).join('');
}

function editarPlano(id) {
  const plano = state.planos.find(p => p.id === id);
  if (!plano) return;
  state.editingPlanoId = id;
  state.tempExercicios = [...plano.exercicios.map(e => ({...e}))];
  document.getElementById('plano-nome').value = plano.nome;
  document.getElementById('modal-plano-title').textContent = 'Editar Plano';
  document.querySelectorAll('#dias-selector .dia-btn').forEach(b => {
    b.classList.toggle('selected', plano.dias.includes(b.dataset.dia));
  });
  renderExerciciosEdit();
  openModal('modal-plano');
}

function excluirPlano(id) {
  showConfirm('Excluir este plano de treino?', () => {
    state.planos = state.planos.filter(p => p.id !== id);
    save();
    renderPlanos();
    renderExecutar();
    updateDashboard();
  });
}

// ===== MÓDULO: MODO EXECUÇÃO DE TREINO =====
let currentExecPlanoId = null;
let workoutTimerInterval = null;
let workoutElapsedSeconds = 0;
let isWorkoutRunning = false;
let checkedExerciciosIds = [];

function renderExecutar() {
  const grid = document.getElementById('executar-grid');
  if (state.planos.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🤷</div><p>Nenhum plano disponível.<br>Crie um plano na aba de Gerenciar Treinos primeiro.</p></div>`;
    return;
  }
  grid.innerHTML = state.planos.map(p => `
    <div class="plano-card hover-card" onclick="abrirExecucao('${p.id}')" style="cursor: pointer; border-color: var(--accent); background: rgba(200,241,53,0.02);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div class="plano-nome" style="font-size: 28px;">${escHtml(p.nome)}</div>
        <div style="background: var(--accent); color: var(--bg); border-radius: 50%; width: 36px; height: 36px; display:flex; align-items:center; justify-content:center; font-size: 18px;">▶</div>
      </div>
      <div class="plano-dias" style="margin-top: 8px;">${p.dias.map(d => `<span class="dia-tag">${d}</span>`).join('') || '<span style="color:var(--text3);font-size:12px">Nenhum dia definido</span>'}</div>
      <div class="plano-exercicios-count" style="margin-top: 12px;">${p.exercicios.length} exercício${p.exercicios.length !== 1 ? 's' : ''}</div>
    </div>
  `).join('');
}

function abrirExecucao(id) {
  const plano = state.planos.find(p => p.id === id);
  if (!plano) return;
  
  if (currentExecPlanoId === id && isWorkoutRunning) {
    document.getElementById('exec-plano-nome').textContent = plano.nome;
    document.getElementById('exec-plano-dias').textContent = plano.dias.length > 0 ? plano.dias.join(', ') : 'Dias não definidos';
    document.getElementById('btn-iniciar-treino').style.display = 'none';
    document.getElementById('btn-concluir-treino').style.display = 'inline-block';
    document.getElementById('exec-timer-display').style.display = 'block';
    
    const m = Math.floor(workoutElapsedSeconds / 60).toString().padStart(2, '0');
    const s = (workoutElapsedSeconds % 60).toString().padStart(2, '0');
    document.getElementById('exec-timer-display').textContent = `${m}:${s}`;
  } else {
    clearInterval(workoutTimerInterval);
    workoutElapsedSeconds = 0;
    isWorkoutRunning = false;
    currentExecPlanoId = id;
    checkedExerciciosIds = [];

    document.getElementById('exec-timer-display').textContent = '00:00';
    document.getElementById('exec-timer-display').style.display = 'none';
    document.getElementById('btn-iniciar-treino').style.display = 'inline-block';
    document.getElementById('btn-concluir-treino').style.display = 'none';
    
    document.getElementById('exec-plano-nome').textContent = plano.nome;
    document.getElementById('exec-plano-dias').textContent = plano.dias.length > 0 ? plano.dias.join(', ') : 'Dias não definidos';
  }

  const list = document.getElementById('exec-exercicios-list');
  if (plano.exercicios.length === 0) {
    list.innerHTML = '<p class="empty-msg">Nenhum exercício cadastrado neste plano.</p>';
  } else {
    list.innerHTML = plano.exercicios.map((ex, i) => {
      const isChecked = checkedExerciciosIds.includes(ex.id);
      return `
        <div class="card" id="ex-card-${ex.id}" style="padding: 24px; border-left: 4px solid ${isChecked ? 'var(--accent2)' : 'var(--accent)'}; background: var(--bg3); transition: all 0.2s;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
            <div>
              <h3 id="ex-title-${ex.id}" style="font-family:var(--font-display); font-size:28px; color:var(--text); line-height: 1.1; ${isChecked ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${escHtml(ex.nome)}</h3>
              <span class="dia-tag" style="background:var(--bg); color:var(--text2); margin-top:4px; display:inline-block;">${ex.grupo || 'Geral'}</span>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <button class="btn-check" onclick="toggleCheckExercicio('${ex.id}')" style="background:${isChecked ? 'var(--accent2)' : 'transparent'}; color:${isChecked ? '#0d0d0f' : 'var(--text3)'}; border:1px solid ${isChecked ? 'var(--accent2)' : 'var(--border)'}; border-radius:var(--radius-sm); width:36px; height:36px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; font-weight:bold; transition:all 0.15s;" title="Concluir exercício">
                ${isChecked ? '✓' : ''}
              </button>
              <button class="btn-primary" style="display:flex; align-items:center; gap:8px; font-size:16px;" onclick="startTimer(${ex.descanso})">
                ⏱️ ${ex.descanso}s
              </button>
            </div>
          </div>
          
          <div id="ex-stats-${ex.id}" style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: var(--bg2); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--border); transition: opacity 0.2s; ${isChecked ? 'opacity: 0.4;' : ''}">
            <div><div style="color:var(--text2); font-size:12px; text-transform:uppercase;">Séries</div><strong style="color:var(--text); font-size:18px;">${ex.series}</strong></div>
            <div><div style="color:var(--text2); font-size:12px; text-transform:uppercase;">Repetições</div><strong style="color:var(--text); font-size:18px;">${ex.reps || '--'}</strong></div>
            <div><div style="color:var(--text2); font-size:12px; text-transform:uppercase;">Carga</div><strong style="color:var(--accent); font-size:18px;">${ex.carga ? ex.carga + ' kg' : '--'}</strong></div>
          </div>
          
          ${ex.obs ? `<div id="ex-obs-${ex.id}" style="margin-top:16px; font-size:14px; color:var(--text2); padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; transition: opacity 0.2s; ${isChecked ? 'opacity: 0.4;' : ''}">ℹ️ <i>${escHtml(ex.obs)}</i></div>` : ''}
        </div>
      `;
    }).join('');
  }
  openModal('modal-executar');
}

function toggleCheckExercicio(id) {
  const idx = checkedExerciciosIds.indexOf(id);
  const card = document.getElementById(`ex-card-${id}`);
  const title = document.getElementById(`ex-title-${id}`);
  const stats = document.getElementById(`ex-stats-${id}`);
  const obs = document.getElementById(`ex-obs-${id}`);
  const btn = card ? card.querySelector('.btn-check') : null;

  if (idx > -1) {
    checkedExerciciosIds.splice(idx, 1);
    if (card) card.style.borderLeftColor = 'var(--accent)';
    if (title) { title.style.textDecoration = 'none'; title.style.opacity = '1'; }
    if (stats) stats.style.opacity = '1';
    if (obs) obs.style.opacity = '1';
    if (btn) { btn.style.background = 'transparent'; btn.style.color = 'var(--text3)'; btn.style.borderColor = 'var(--border)'; btn.innerHTML = ''; }
  } else {
    checkedExerciciosIds.push(id);
    if (card) card.style.borderLeftColor = 'var(--accent2)';
    if (title) { title.style.textDecoration = 'line-through'; title.style.opacity = '0.5'; }
    if (stats) stats.style.opacity = '0.4';
    if (obs) obs.style.opacity = '0.4';
    if (btn) { btn.style.background = 'var(--accent2)'; btn.style.color = '#0d0d0f'; btn.style.borderColor = 'var(--accent2)'; btn.innerHTML = '✓'; }
  }
}

function iniciarTreino() {
  document.getElementById('btn-iniciar-treino').style.display = 'none';
  document.getElementById('btn-concluir-treino').style.display = 'inline-block';
  document.getElementById('exec-timer-display').style.display = 'block';
  
  isWorkoutRunning = true;
  clearInterval(workoutTimerInterval);
  
  workoutTimerInterval = setInterval(() => {
    workoutElapsedSeconds++;
    const m = Math.floor(workoutElapsedSeconds / 60).toString().padStart(2, '0');
    const s = (workoutElapsedSeconds % 60).toString().padStart(2, '0');
    document.getElementById('exec-timer-display').textContent = `${m}:${s}`;
  }, 1000);
}

function concluirTreino() {
  clearInterval(workoutTimerInterval);
  isWorkoutRunning = false;
  
  const plano = state.planos.find(p => p.id === currentExecPlanoId);
  if(!plano) return;
  
  const minutos = Math.max(1, Math.ceil(workoutElapsedSeconds / 60));
  
  const registro = {
    id: uid(),
    planoId: plano.id,
    planoNome: plano.nome,
    data: new Date().toISOString().split('T')[0],
    duracao: minutos,
    obs: 'Treino finalizado com sucesso.',
  };
  
  state.historico.push(registro);
  save();
  
  checkedExerciciosIds = [];
  workoutElapsedSeconds = 0;
  currentExecPlanoId = null;
  
  closeModal('modal-executar');
  renderHistorico();
  updateDashboard();
}

// ===== EXERCÍCIOS =====
document.getElementById('ex-is-piramide').addEventListener('change', renderCargasMultiplas);
document.getElementById('ex-series').addEventListener('input', renderCargasMultiplas);

function renderCargasMultiplas() {
  const isPiramide = document.getElementById('ex-is-piramide').checked;
  const containerUnica = document.getElementById('container-carga-unica');
  const containerMultipla = document.getElementById('container-carga-multipla');
  
  if (isPiramide) {
    containerUnica.style.display = 'none';
    containerMultipla.style.display = 'flex';
    
    const series = parseInt(document.getElementById('ex-series').value) || 1;
    const currentInputs = Array.from(containerMultipla.querySelectorAll('input')).map(inp => inp.value);
    
    containerMultipla.innerHTML = '';
    for (let i = 0; i < series; i++) {
      const val = currentInputs[i] !== undefined ? currentInputs[i] : '';
      containerMultipla.innerHTML += `
        <div style="flex: 1; min-width: 60px;">
          <label style="font-size:10px; color:var(--accent);">Série ${i+1}</label>
          <input type="number" class="ex-carga-multi" step="0.5" min="0" placeholder="kg" value="${val}"/>
        </div>
      `;
    }
  } else {
    containerUnica.style.display = 'block';
    containerMultipla.style.display = 'none';
  }
}

document.getElementById('btn-add-exercicio').addEventListener('click', () => {
  state.editingExercicioIdx = null;
  clearExForm();
  document.getElementById('modal-ex-title').textContent = 'Adicionar Exercício';
  document.getElementById('btn-salvar-exercicio').textContent = 'Adicionar';
  openModal('modal-exercicio');
});

function clearExForm() {
  document.getElementById('ex-nome').value = '';
  document.getElementById('ex-grupo').value = '';
  document.getElementById('ex-series').value = 3;
  document.getElementById('ex-reps').value = '';
  document.getElementById('ex-carga').value = '';
  document.getElementById('ex-descanso').value = 60;
  document.getElementById('ex-obs').value = '';
  
  document.getElementById('ex-is-piramide').checked = false;
  renderCargasMultiplas();
}

document.getElementById('btn-salvar-exercicio').addEventListener('click', () => {
  const nome = document.getElementById('ex-nome').value.trim();
  if (!nome) { alert('Digite o nome do exercício.'); return; }
  
  const isPiramide = document.getElementById('ex-is-piramide').checked;
  let cargaFinal = '';
  
  if (isPiramide) {
    const inputs = document.querySelectorAll('.ex-carga-multi');
    cargaFinal = Array.from(inputs).map(inp => inp.value || '0').join('/');
  } else {
    cargaFinal = document.getElementById('ex-carga').value;
  }

  const ex = {
    id: uid(),
    nome,
    grupo: document.getElementById('ex-grupo').value,
    series: document.getElementById('ex-series').value,
    reps: document.getElementById('ex-reps').value,
    carga: cargaFinal,
    isPiramide: isPiramide,
    descanso: document.getElementById('ex-descanso').value,
    obs: document.getElementById('ex-obs').value,
  };
  
  if (state.editingExercicioIdx !== null) {
    state.tempExercicios[state.editingExercicioIdx] = ex;
  } else {
    state.tempExercicios.push(ex);
  }
  closeModal('modal-exercicio');
  renderExerciciosEdit();
});

function renderExerciciosEdit() {
  const list = document.getElementById('exercicios-list-edit');
  if (state.tempExercicios.length === 0) {
    list.innerHTML = '<div style="color:var(--text3);font-size:13px">Nenhum exercício adicionado.</div>';
    return;
  }
  list.innerHTML = state.tempExercicios.map((ex, i) => `
    <div class="ex-edit-item">
      <div class="ex-name">${escHtml(ex.nome)}</div>
      <div class="ex-meta">${ex.series}x${ex.reps} ${ex.carga ? '· ' + ex.carga + 'kg' : ''} ${ex.grupo ? '· ' + ex.grupo : ''}</div>
      <button class="ex-edit-btn" title="Editar" onclick="editarExercicio(${i})">✏️</button>
      <button class="ex-edit-btn" title="Remover" onclick="removerExercicio(${i})">✕</button>
    </div>
  `).join('');
}

function editarExercicio(idx) {
  const ex = state.tempExercicios[idx];
  state.editingExercicioIdx = idx;
  document.getElementById('ex-nome').value = ex.nome;
  document.getElementById('ex-grupo').value = ex.grupo;
  document.getElementById('ex-series').value = ex.series;
  document.getElementById('ex-reps').value = ex.reps;
  document.getElementById('ex-descanso').value = ex.descanso;
  document.getElementById('ex-obs').value = ex.obs;
  
  document.getElementById('ex-is-piramide').checked = ex.isPiramide || false;
  renderCargasMultiplas();

  if (ex.isPiramide) {
    const inputs = document.querySelectorAll('.ex-carga-multi');
    const valores = (ex.carga || '').split('/');
    inputs.forEach((inp, i) => {
      inp.value = valores[i] !== undefined ? valores[i] : '';
    });
  } else {
    document.getElementById('ex-carga').value = ex.carga;
  }
  
  document.getElementById('modal-ex-title').textContent = 'Editar Exercício';
  document.getElementById('btn-salvar-exercicio').textContent = 'Salvar';
  openModal('modal-exercicio');
}

function removerExercicio(idx) {
  state.tempExercicios.splice(idx, 1);
  renderExerciciosEdit();
}

// ===== DIETA =====
document.getElementById('btn-nova-refeicao').addEventListener('click', () => {
  state.editingRefeicaoId = null;
  state.tempAlimentos = [];
  document.getElementById('ref-nome').value = '';
  document.getElementById('ref-horario').value = '08:00';
  document.getElementById('modal-ref-title').textContent = 'Nova Refeição';
  renderAlimentosEdit();
  openModal('modal-refeicao');
});

document.getElementById('btn-salvar-refeicao').addEventListener('click', () => {
  const nome = document.getElementById('ref-nome').value.trim();
  if (!nome) { alert('Digite um nome para a refeição.'); return; }
  const ref = {
    id: state.editingRefeicaoId || uid(),
    nome,
    horario: document.getElementById('ref-horario').value,
    alimentos: [...state.tempAlimentos],
  };
  if (state.editingRefeicaoId) {
    const idx = state.dieta.refeicoes.findIndex(r => r.id === state.editingRefeicaoId);
    if (idx !== -1) state.dieta.refeicoes[idx] = ref;
  } else {
    state.dieta.refeicoes.push(ref);
  }
  save();
  closeModal('modal-refeicao');
  renderDieta();
  updateDashboard();
});

document.getElementById('btn-add-alimento').addEventListener('click', () => {
  state.tempAlimentos.push({ id: uid(), nome: '', qtd: '', cal: '', prot: '', carb: '' });
  renderAlimentosEdit();
});

function renderAlimentosEdit() {
  const list = document.getElementById('alimentos-list');
  if (state.tempAlimentos.length === 0) {
    list.innerHTML = '<div style="color:var(--text3);font-size:13px">Nenhum alimento adicionado.</div>';
    return;
  }
  list.innerHTML = state.tempAlimentos.map((al, i) => `
    <div class="alimento-edit-item">
      <input type="text" placeholder="Alimento" value="${escHtml(al.nome)}" oninput="updateAlimento(${i},'nome',this.value)"/>
      <input type="text" placeholder="Qtd (g/ml)" value="${al.qtd}" oninput="updateAlimento(${i},'qtd',this.value)"/>
      <input type="number" placeholder="kcal" value="${al.cal}" oninput="updateAlimento(${i},'cal',this.value)" min="0"/>
      <input type="number" placeholder="Prot(g)" value="${al.prot}" oninput="updateAlimento(${i},'prot',this.value)" min="0"/>
      <input type="number" placeholder="Carb(g)" value="${al.carb}" oninput="updateAlimento(${i},'carb',this.value)" min="0"/>
      <button class="al-remove" onclick="removerAlimento(${i})">✕</button>
    </div>
  `).join('');
}

function updateAlimento(idx, field, value) {
  state.tempAlimentos[idx][field] = value;
}
function removerAlimento(idx) {
  state.tempAlimentos.splice(idx, 1);
  renderAlimentosEdit();
}

function editarRefeicao(id) {
  const ref = state.dieta.refeicoes.find(r => r.id === id);
  if (!ref) return;
  state.editingRefeicaoId = id;
  state.tempAlimentos = ref.alimentos.map(a => ({...a}));
  document.getElementById('ref-nome').value = ref.nome;
  document.getElementById('ref-horario').value = ref.horario;
  document.getElementById('modal-ref-title').textContent = 'Editar Refeição';
  renderAlimentosEdit();
  openModal('modal-refeicao');
}
function excluirRefeicao(id) {
  showConfirm('Excluir esta refeição?', () => {
    state.dieta.refeicoes = state.dieta.refeicoes.filter(r => r.id !== id);
    save();
    renderDieta();
    updateDashboard();
  });
}

function renderDieta() {
  const meta = state.dieta.meta;
  document.getElementById('meta-cal-display').textContent = meta.cal ? `${meta.cal} kcal` : '— kcal';
  const lista = document.getElementById('refeicoes-lista');
  if (state.dieta.refeicoes.length === 0) {
    lista.innerHTML = `<div class="empty-state"><div class="empty-icon">🥗</div><p>Nenhuma refeição cadastrada.<br>Clique em <b>+ Nova Refeição</b> para começar.</p></div>`;
    return;
    if (typeof renderCardapios === 'function') {
    renderCardapios(); 
}
  }
  const sorted = [...state.dieta.refeicoes].sort((a, b) => a.horario.localeCompare(b.horario));
  lista.innerHTML = sorted.map(ref => {
    const totalCal = ref.alimentos.reduce((s, a) => s + (parseFloat(a.cal) || 0), 0);
    const totalProt = ref.alimentos.reduce((s, a) => s + (parseFloat(a.prot) || 0), 0);
    const totalCarb = ref.alimentos.reduce((s, a) => s + (parseFloat(a.carb) || 0), 0);
    return `
      <div class="refeicao-card">
        <div class="refeicao-header" onclick="toggleRefeicao('${ref.id}')">
          <div style="display:flex;align-items:center;gap:14px">
            <span class="refeicao-horario">${ref.horario}</span>
            <span class="refeicao-nome">${escHtml(ref.nome)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:16px">
            ${totalCal > 0 ? `<span class="refeicao-cals">${totalCal.toFixed(0)} kcal</span>` : ''}
            <span style="color:var(--text3)">▾</span>
          </div>
        </div>
        <div class="refeicao-body" id="rb-${ref.id}" style="display:none">
          ${ref.alimentos.length > 0 ? `
            <div class="alimento-row" style="margin-bottom:4px">
              <span class="label">Alimento</span>
              <span class="label">Qtd</span>
              <span class="label">kcal</span>
              <span class="label">Prot</span>
              <span></span>
            </div>
            ${ref.alimentos.map(al => `
              <div class="alimento-row">
                <span>${escHtml(al.nome) || '—'}</span>
                <span style="color:var(--text2)">${al.qtd || '—'}</span>
                <span style="color:var(--accent)">${al.cal || '0'}</span>
                <span style="color:var(--text2)">${al.prot || '0'}g</span>
                <span></span>
              </div>
            `).join('')}
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:flex;gap:20px;font-size:13px;color:var(--text2)">
              <span>Total: <b style="color:var(--accent)">${totalCal.toFixed(0)} kcal</b></span>
              <span>Prot: <b>${totalProt.toFixed(1)}g</b></span>
              <span>Carb: <b>${totalCarb.toFixed(1)}g</b></span>
            </div>
          ` : '<div style="color:var(--text3);font-size:13px">Nenhum alimento cadastrado.</div>'}
        </div>
        <div class="refeicao-actions">
          <button class="btn-ghost" onclick="editarRefeicao('${ref.id}')">✏️ Editar</button>
          <button class="btn-ghost" onclick="excluirRefeicao('${ref.id}')">🗑️ Excluir</button>
        </div>
      </div>
    `;
  }).join('');
}

function toggleRefeicao(id) {
  const body = document.getElementById('rb-' + id);
  if (body) body.style.display = body.style.display === 'none' ? 'flex' : 'none';
}

document.getElementById('btn-editar-meta').addEventListener('click', () => {
  const m = state.dieta.meta;
  document.getElementById('meta-cal-input').value = m.cal || '';
  document.getElementById('meta-prot-input').value = m.prot || '';
  document.getElementById('meta-carb-input').value = m.carb || '';
  document.getElementById('meta-gord-input').value = m.gord || '';
  openModal('modal-meta');
});

document.getElementById('btn-salvar-meta').addEventListener('click', () => {
  state.dieta.meta = {
    cal: parseFloat(document.getElementById('meta-cal-input').value) || 0,
    prot: parseFloat(document.getElementById('meta-prot-input').value) || 0,
    carb: parseFloat(document.getElementById('meta-carb-input').value) || 0,
    gord: parseFloat(document.getElementById('meta-gord-input').value) || 0,
  };
  save();
  closeModal('modal-meta');
  renderDieta();
});

document.getElementById('btn-calcular-salvar-macros').addEventListener('click', () => {
  const gen = document.getElementById('calc-gen').value;
  const peso = parseFloat(document.getElementById('calc-peso').value);
  const altura = parseFloat(document.getElementById('calc-altura').value);
  const idade = parseFloat(document.getElementById('calc-idade').value);
  const ativ = parseFloat(document.getElementById('calc-ativ').value);
  const obj = parseFloat(document.getElementById('calc-obj').value);
  if(!peso || !altura || !idade) { alert("Preencha peso, altura e idade."); return; }
  let tmb = (10 * peso) + (6.25 * altura) - (5 * idade);
  tmb = gen === 'M' ? tmb + 5 : tmb - 161;
  let cals = (tmb * ativ) + obj;
  let prot = peso * 2;
  let gord = peso * 1;
  let carb = (cals - ((prot*4) + (gord*9))) / 4;
  if(carb < 0) carb = 0; 
  state.dieta.meta = { cal: Math.round(cals), prot: Math.round(prot), gord: Math.round(gord), carb: Math.round(carb) };
  save();
  closeModal('modal-calc-macros');
  renderDieta();
  alert("Sua meta foi calculada e salva com sucesso!");
});

// ===== MÓDULO: VISUALIZADOR DE CARDÁPIO =====
function renderCardapios() {
  const container = document.getElementById('cardapio-view-container');
  if (!container) return;

  // Se não houver refeições criadas na aba Dieta
  if (state.dieta.refeicoes.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🍽️</div><p>O seu cardápio está vazio.<br>Adicione refeições na aba <b>Dieta</b> para que elas apareçam aqui.</p></div>`;
    return;
  }

  // Ordena as refeições por horário (do mais cedo pro mais tarde)
  const sorted = [...state.dieta.refeicoes].sort((a, b) => a.horario.localeCompare(b.horario));

  // Calcula os totais do dia inteiro
  let totalDiaCal = 0, totalDiaProt = 0, totalDiaCarb = 0;

  sorted.forEach(ref => {
    ref.alimentos.forEach(al => {
      totalDiaCal += parseFloat(al.cal) || 0;
      totalDiaProt += parseFloat(al.prot) || 0;
      totalDiaCarb += parseFloat(al.carb) || 0;
    });
  });

  // Constrói o HTML: Resumo Diário + Linha do Tempo das Refeições
  let html = `
    <div style="background: var(--bg2); border: 1px solid var(--accent); border-radius: var(--radius); padding: 24px; margin-bottom: 24px; box-shadow: 0 8px 32px rgba(200, 241, 53, 0.05);">
      <h3 style="color: var(--accent); margin-bottom: 16px; font-family: var(--font-display); font-size: 24px; letter-spacing: 1px;">Resumo Nutricional do Dia</h3>
      <div style="display: flex; gap: 32px; flex-wrap: wrap;">
        <div><span style="color:var(--text2); font-size:12px; text-transform:uppercase; font-weight:bold;">Calorias</span><br><strong style="font-size:24px; color:var(--text);">${totalDiaCal.toFixed(0)} kcal</strong></div>
        <div><span style="color:var(--text2); font-size:12px; text-transform:uppercase; font-weight:bold;">Proteínas</span><br><strong style="font-size:24px; color:var(--text);">${totalDiaProt.toFixed(1)}g</strong></div>
        <div><span style="color:var(--text2); font-size:12px; text-transform:uppercase; font-weight:bold;">Carboidratos</span><br><strong style="font-size:24px; color:var(--text);">${totalDiaCarb.toFixed(1)}g</strong></div>
      </div>
    </div>
    
    <div style="display: flex; flex-direction: column; gap: 16px;">
  `;

  html += sorted.map(ref => {
    const totalCalRef = ref.alimentos.reduce((s, a) => s + (parseFloat(a.cal) || 0), 0);
    return `
      <div class="card hover-card" style="border-left: 4px solid var(--accent); padding: 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3 style="font-size: 20px; margin: 0; font-family: var(--font-display); letter-spacing: 1px;">${escHtml(ref.nome)}</h3>
          <span style="background: rgba(200, 241, 53, 0.1); padding: 6px 12px; border-radius: 8px; font-weight: bold; color: var(--accent); font-size: 14px; display:flex; align-items:center; gap:6px;">
            ⏱️ ${ref.horario}
          </span>
        </div>
        ${ref.alimentos.length > 0 ? `
          <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px;">
            ${ref.alimentos.map(al => `
              <li style="display:flex; justify-content:space-between; font-size: 15px; border-bottom: 1px dashed var(--border); padding-bottom: 8px;">
                <span>${escHtml(al.nome)} <span style="color:var(--text2); font-size: 13px;">(${al.qtd})</span></span>
                <span style="color:var(--text2); font-weight: 500;">${al.cal || 0} kcal</span>
              </li>
            `).join('')}
          </ul>
          <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 14px; color: var(--text); text-align: right;">
            Total desta refeição: <strong style="color: var(--accent);">${totalCalRef.toFixed(0)} kcal</strong>
          </div>
        ` : `<div style="color:var(--text3);font-size:14px; font-style:italic;">Nenhum alimento cadastrado nesta refeição.</div>`}
      </div>
    `;
  }).join('');

  html += `</div>`;
  container.innerHTML = html;
}

// ===== HISTÓRICO =====
function renderHistorico() {
  const lista = document.getElementById('historico-lista');
  if (state.historico.length === 0) {
    lista.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>Nenhum treino registrado ainda.</p></div>`;
    return;
  }
  const sorted = [...state.historico].reverse();
  lista.innerHTML = sorted.map(h => `
    <div class="historico-item">
      <div class="hist-info">
        <div class="hist-plano">${escHtml(h.planoNome)}</div>
        <div class="hist-data">${formatFullDate(h.data)}</div>
        ${h.obs ? `<div class="hist-obs">"${escHtml(h.obs)}"</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="hist-dur">⏱ ${h.duracao} min</div>
        <button class="hist-del" onclick="excluirHistorico('${h.id}')" title="Excluir">✕</button>
      </div>
    </div>
  `).join('');
}

function excluirHistorico(id) {
  showConfirm('Remover este registro do histórico?', () => {
    state.historico = state.historico.filter(h => h.id !== id);
    save();
    renderHistorico();
    updateDashboard();
  });
}

function formatFullDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== INIT ASSÍNCRONO COM SUPABASE =====
async function initApp() {
  await load();
  document.getElementById('input-data-peso').value = new Date().toISOString().split('T')[0];
  
  updateDashboard();
  renderPlanos();
  renderExecutar();
  renderCardapios();
  renderDieta();
  renderHistorico();
  renderPesoChart();
  
  if (typeof renderPerfil === 'function') renderPerfil(); 
}

initApp();