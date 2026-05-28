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
  cargas: [], // Historico de cargas
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

// ===== PERSISTENCE COM SUPABASE (USANDO UPDATE SEGURO) =====
async function save() {
  if (!currentUserId) return;
  
  const { error } = await supaClient
    .from('user_state')
    .update({ app_state: state })
    .eq('user_id', currentUserId);
  
  if (error) {
    console.error("Erro ao salvar dados: ", error);
    alert("Houve um bloqueio ao salvar os dados no Supabase: " + error.message);
  }
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
    .maybeSingle();

  if (error) console.error("Erro no load: ", error);

  if (data && data.app_state) {
    Object.assign(state, data.app_state);
    if (!state.cargas) state.cargas = []; // Prevenção para usuários antigos
  } else {
    const { error: insErr } = await supaClient.from('user_state').insert([{ user_id: currentUserId, app_state: state }]);
    if (insErr) console.error("Erro ao criar linha base: ", insErr);
  }
}

// ===== ID GENERATOR =====
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ===== NAVIGATION =====
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!btn.dataset.tab) return; 

    document.querySelectorAll('.nav-btn').forEach(b => {
      if (b.dataset.tab) b.classList.remove('active');
    });
    
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    
    if(btn.dataset.tab === 'dashboard') {
      updateDashboard();
    } else if(btn.dataset.tab === 'cardapios') {
      renderCardapios();
    } else if (btn.dataset.tab === 'progresso') {
      renderPesoChart();
      renderCargas();
    }
  });
});

// ===== MODAL HELPERS =====
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    closeModal(btn.dataset.close);
    if(btn.dataset.close === 'modal-executar' && workoutTimerInterval && !isWorkoutRunning) {
      clearInterval(workoutTimerInterval);
    }
  });
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay && overlay.id !== 'modal-onboarding') {
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

  const primeiroNome = state.perfil.nome ? state.perfil.nome.split(' ')[0] : 'Atleta';
  document.getElementById('dashboard-welcome').textContent = `Bem-vindo(a), ${primeiroNome}!`;
  
  if (state.perfil.foto) {
    document.getElementById('dashboard-user-foto').src = state.perfil.foto;
  } else {
    document.getElementById('dashboard-user-foto').src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%239090a0'><circle cx='12' cy='8' r='4'/><path d='M4 20c0-4 4-7 8-7s8 3 8 7'/></svg>";
  }

  const calendarContainer = document.getElementById('weekly-calendar');
  if (calendarContainer) {
    const getLocalYYYYMMDD = (d) => `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
    const currentDayOfWeek = hoje.getDay(); 
    const startOfWeek = new Date(hoje);
    startOfWeek.setDate(hoje.getDate() - currentDayOfWeek); 
    
    const diasAbrev = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    let calendarHTML = '';
    const hojeStr = getLocalYYYYMMDD(hoje);
    
    for(let i = 0; i < 7; i++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setDate(startOfWeek.getDate() + i);
        const dateStr = getLocalYYYYMMDD(dayDate);
        
        const trained = state.historico.some(h => h.data === dateStr);
        const isToday = dateStr === hojeStr;
        
        let bg = 'var(--bg3)';
        let border = '1px solid var(--border)';
        let color = 'var(--text2)';
        let content = diasAbrev[i];
        
        if(trained) {
            bg = 'var(--accent)'; border = '1px solid var(--accent)'; color = '#0d0d0f'; content = '✓';
        } else if (isToday) {
            border = '1px solid var(--accent)'; color = 'var(--text)';
        }

        calendarHTML += `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1;">
            <div style="width: 46px; height: 46px; border-radius: 50%; background: ${bg}; border: ${border}; color: ${color}; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; transition: all 0.2s;">
              ${content}
            </div>
            <span style="font-size: 12px; color: var(--text3); font-weight: 500;">${dayDate.getDate().toString().padStart(2,'0')}/${(dayDate.getMonth()+1).toString().padStart(2,'0')}</span>
          </div>
        `;
    }
    calendarContainer.innerHTML = calendarHTML;
  }

  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();
  const treinosMes = state.historico.filter(h => {
    const d = new Date(h.data + 'T12:00:00');
    return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  }).length;

  document.getElementById('stat-treinos').textContent = treinosMes;

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
          <strong style="color:var(--text);">${p.protocolo ? escHtml(p.protocolo) + ' - ' : ''}${p.nome}</strong>
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

// ===== MÓDULO: PROGRESSO DE PESO E CARGAS =====
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

// ===== MÓDULO: CARGAS =====
function renderCargas() {
  const lista = document.getElementById('lista-cargas');
  if(!state.cargas) state.cargas = [];
  if(state.cargas.length === 0) {
    lista.innerHTML = '<li class="empty-msg">Nenhuma carga registrada.</li>';
    return;
  }
  const sorted = [...state.cargas].sort((a,b) => b.data.localeCompare(a.data));
  lista.innerHTML = sorted.map(c => `
    <li>
      <span><strong>${escHtml(c.exercicio)}</strong> <span style="color:var(--text2);font-size:12px;margin-left:8px">${formatDate(c.data)}</span></span>
      <span style="color:var(--accent);font-weight:bold">${c.peso} kg</span>
    </li>
  `).join('');
}

function abrirModalCarga() {
  document.getElementById('input-data-carga').value = new Date().toISOString().split('T')[0];
  document.getElementById('input-carga-exercicio').value = '';
  document.getElementById('input-carga-peso').value = '';
  openModal('modal-carga');
}

document.getElementById('btn-salvar-carga').addEventListener('click', () => {
  const ex = document.getElementById('input-carga-exercicio').value.trim();
  const p = parseFloat(document.getElementById('input-carga-peso').value);
  const d = document.getElementById('input-data-carga').value;

  if(!ex || !p || !d) { alert('Preencha exercício, carga e data.'); return; }
  if(!state.cargas) state.cargas = [];

  state.cargas.push({ id: uid(), exercicio: ex, peso: p, data: d });
  save();
  closeModal('modal-carga');
  renderCargas();
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
  document.getElementById('plano-protocolo').value = '';
  document.getElementById('plano-nome').value = '';
  document.getElementById('modal-plano-title').textContent = 'Novo Plano de Treino';
  document.querySelectorAll('.dia-btn:not(.c-dia-btn)').forEach(b => b.classList.remove('selected'));
  renderExerciciosEdit();
  openModal('modal-plano');
});

document.getElementById('btn-salvar-plano').addEventListener('click', () => {
  const protocolo = document.getElementById('plano-protocolo').value.trim();
  const nome = document.getElementById('plano-nome').value.trim();
  if (!nome) { alert('Digite um nome para o plano.'); return; }
  const dias = [...document.querySelectorAll('#dias-selector .dia-btn.selected')].map(b => b.dataset.dia);

  if (state.editingPlanoId) {
    const idx = state.planos.findIndex(p => p.id === state.editingPlanoId);
    if (idx !== -1) {
      state.planos[idx].protocolo = protocolo;
      state.planos[idx].nome = nome;
      state.planos[idx].dias = dias;
      state.planos[idx].exercicios = [...state.tempExercicios];
    }
  } else {
    state.planos.push({ id: uid(), protocolo, nome, dias, exercicios: [...state.tempExercicios] });
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

// ===== GERADOR INTELIGENTE DE ROTINAS (IA LOCAL) =====
document.getElementById('btn-gerar-ia').addEventListener('click', async () => {
  const objetivo = state.perfil.objetivo || 'hipertrofia';
  let planosGerados = [];

  // Montagem da estrutura de Segunda a Sexta focada em grupos musculares isolados
  if (objetivo === 'hipertrofia') {
    planosGerados = [
      { nome: 'Treino A - Peito', dias: ['Seg'], exercicios: [
        { nome: 'Supino Reto com Barra', grupo: 'Peito', series: 4, reps: '8-10', carga: '', isPiramide: false, descanso: 90, obs: 'Controlar a descida em 3 segundos.' },
        { nome: 'Supino Inclinado c/ Halteres', grupo: 'Peito', series: 4, reps: '8-12', carga: '', isPiramide: false, descanso: 90, obs: 'Focar em encostar os bíceps no topo.' },
        { nome: 'Crossover Polia Média', grupo: 'Peito', series: 3, reps: '10-12', carga: '', isPiramide: false, descanso: 60, obs: 'Cruzar levemente as mãos.' },
        { nome: 'Voador (Peck Deck)', grupo: 'Peito', series: 3, reps: '12-15', carga: '', isPiramide: false, descanso: 60, obs: 'Apertar o peitoral por 1s no pico.' }
      ]},
      { nome: 'Treino B - Costas', dias: ['Ter'], exercicios: [
        { nome: 'Puxada Frontal Aberta', grupo: 'Costas', series: 4, reps: '8-12', carga: '', isPiramide: false, descanso: 90, obs: 'Estufar o peito e puxar até o queixo.' },
        { nome: 'Remada Curvada com Barra', grupo: 'Costas', series: 4, reps: '8-10', carga: '', isPiramide: false, descanso: 90, obs: 'Coluna reta e abdômen muito contraído.' },
        { nome: 'Remada Serrote Unilateral', grupo: 'Costas', series: 3, reps: '10-12', carga: '', isPiramide: false, descanso: 60, obs: 'Puxar liderando pelo cotovelo.' },
        { nome: 'Pulldown com Corda', grupo: 'Costas', series: 3, reps: '12-15', carga: '', isPiramide: false, descanso: 60, obs: 'Braços semi-esticados focando na grande dorsal.' }
      ]},
      { nome: 'Treino C - Pernas Completas', dias: ['Qua'], exercicios: [
        { nome: 'Agachamento Livre', grupo: 'Pernas', series: 4, reps: '8-10', carga: '', isPiramide: false, descanso: 120, obs: 'Descer até quebrar a linha paralela.' },
        { nome: 'Leg Press 45º', grupo: 'Pernas', series: 4, reps: '10-12', carga: '', isPiramide: false, descanso: 90, obs: 'Amplitude máxima sem descolar a lombar.' },
        { nome: 'Cadeira Extensora', grupo: 'Pernas', series: 3, reps: '12-15', carga: '', isPiramide: false, descanso: 60, obs: 'Segurar 1 segundo em cima.' },
        { nome: 'Mesa Flexora', grupo: 'Pernas', series: 4, reps: '10-12', carga: '', isPiramide: false, descanso: 60, obs: 'Contração forte focando nos isquiotibiais.' }
      ]},
      { nome: 'Treino D - Ombros', dias: ['Qui'], exercicios: [
        { nome: 'Desenvolvimento c/ Halteres', grupo: 'Ombros', series: 4, reps: '8-12', carga: '', isPiramide: false, descanso: 90, obs: 'Não bater os halteres no topo do movimento.' },
        { nome: 'Elevação Lateral', grupo: 'Ombros', series: 4, reps: '12-15', carga: '', isPiramide: false, descanso: 60, obs: 'Cotovelos levemente flexionados, subir até o ombro.' },
        { nome: 'Elevação Frontal com Corda', grupo: 'Ombros', series: 3, reps: '12', carga: '', isPiramide: false, descanso: 60, obs: 'Movimento controlado para não usar impulso.' },
        { nome: 'Crucifixo Inverso no Voador', grupo: 'Ombros', series: 3, reps: '12-15', carga: '', isPiramide: false, descanso: 60, obs: 'Foco total na parte de trás do ombro.' }
      ]},
      { nome: 'Treino E - Bíceps e Tríceps', dias: ['Sex'], exercicios: [
        { nome: 'Rosca Direta na Barra W', grupo: 'Bíceps', series: 4, reps: '10-12', carga: '', isPiramide: false, descanso: 60, obs: 'Cotovelos travados ao lado do corpo.' },
        { nome: 'Rosca Martelo c/ Halteres', grupo: 'Bíceps', series: 3, reps: '12', carga: '', isPiramide: false, descanso: 60, obs: 'Subida neutra focando no músculo braquial.' },
        { nome: 'Tríceps Testa na Polia', grupo: 'Tríceps', series: 4, reps: '10-12', carga: '', isPiramide: false, descanso: 60, obs: 'Levar a barra até a linha do cabelo.' },
        { nome: 'Tríceps Corda', grupo: 'Tríceps', series: 3, reps: '12-15', carga: '', isPiramide: false, descanso: 60, obs: 'Abrir totalmente a corda na contração final.' }
      ]}
    ];
  } else if (objetivo === 'emagrecimento') {
    planosGerados = [
      { nome: 'Treino A - Peito e Cardio', dias: ['Seg'], exercicios: [
        { nome: 'Supino Reto na Máquina', grupo: 'Peito', series: 4, reps: '15', carga: '', isPiramide: false, descanso: 45, obs: 'Cadência rápida mas controlada.' },
        { nome: 'Flexão de Braços', grupo: 'Peito', series: 3, reps: 'Máx', carga: '', isPiramide: false, descanso: 45, obs: 'Se necessário, fazer com joelhos no chão.' },
        { nome: 'Voador (Peck Deck)', grupo: 'Peito', series: 4, reps: '15-20', carga: '', isPiramide: false, descanso: 45, obs: 'Alta repetição para gerar queima local.' },
        { nome: 'Burpees (HIIT)', grupo: 'Cardio', series: 4, reps: '12', carga: '', isPiramide: false, descanso: 60, obs: 'Salto explosivo no final, acelerar batimentos.' }
      ]},
      { nome: 'Treino B - Costas e Core', dias: ['Ter'], exercicios: [
        { nome: 'Puxada Frontal Aberta', grupo: 'Costas', series: 4, reps: '15', carga: '', isPiramide: false, descanso: 45, obs: 'Sem paradas, manter tensão contínua.' },
        { nome: 'Remada Baixa Triângulo', grupo: 'Costas', series: 4, reps: '15', carga: '', isPiramide: false, descanso: 45, obs: 'Aperta bem as escápulas atrás.' },
        { nome: 'Face Pull na Corda', grupo: 'Costas', series: 3, reps: '15-20', carga: '', isPiramide: false, descanso: 45, obs: 'Puxar em direção ao rosto.' },
        { nome: 'Prancha Abdominal', grupo: 'Abdômen', series: 4, reps: '45s', carga: '', isPiramide: false, descanso: 45, obs: 'Travar o abdômen e glúteos fortemente.' }
      ]},
      { nome: 'Treino C - Pernas Queima Alta', dias: ['Qua'], exercicios: [
        { nome: 'Agachamento com Salto', grupo: 'Pernas', series: 4, reps: '15', carga: '', isPiramide: false, descanso: 60, obs: 'Amortecer a queda suavemente.' },
        { nome: 'Afundo Alternado', grupo: 'Pernas', series: 4, reps: '12 cada', carga: '', isPiramide: false, descanso: 60, obs: 'Costas retas, descer afundando o quadril.' },
        { nome: 'Cadeira Abdutora', grupo: 'Pernas', series: 3, reps: '20', carga: '', isPiramide: false, descanso: 45, obs: 'Movimento rápido para queima do glúteo lateral.' },
        { nome: 'Polichinelos (HIIT)', grupo: 'Cardio', series: 4, reps: '45s', carga: '', isPiramide: false, descanso: 45, obs: 'Velocidade máxima possível.' }
      ]},
      { nome: 'Treino D - Ombros e Core', dias: ['Qui'], exercicios: [
        { nome: 'Desenvolvimento Máquina', grupo: 'Ombros', series: 4, reps: '15', carga: '', isPiramide: false, descanso: 45, obs: 'Focar na resistência do ombro.' },
        { nome: 'Elevação Lateral Halteres', grupo: 'Ombros', series: 4, reps: '15-20', carga: '', isPiramide: false, descanso: 45, obs: 'Peso leve, foco na ardência.' },
        { nome: 'Corda Naval (ou Kettlebell Swing)', grupo: 'Cardio', series: 4, reps: '30s', carga: '', isPiramide: false, descanso: 60, obs: 'Força total e velocidade.' },
        { nome: 'Abdominal Infra Solo', grupo: 'Abdômen', series: 4, reps: '20', carga: '', isPiramide: false, descanso: 45, obs: 'Elevar as pernas sem descolar a lombar.' }
      ]},
      { nome: 'Treino E - Braços e HIIT', dias: ['Sex'], exercicios: [
        { nome: 'Rosca na Polia Baixa', grupo: 'Bíceps', series: 4, reps: '15', carga: '', isPiramide: false, descanso: 45, obs: 'Pump muscular máximo.' },
        { nome: 'Tríceps Polia Barra', grupo: 'Tríceps', series: 4, reps: '15', carga: '', isPiramide: false, descanso: 45, obs: 'Cotovelos não se movem para frente.' },
        { nome: 'Mountain Climbers', grupo: 'Cardio', series: 4, reps: '40s', carga: '', isPiramide: false, descanso: 60, obs: 'Acelerar os joelhos no peito.' },
        { nome: 'Abdominal Supra Curto', grupo: 'Abdômen', series: 3, reps: '25', carga: '', isPiramide: false, descanso: 45, obs: 'Apertar bem o core a cada subida.' }
      ]}
    ];
  } else {
    // Manutenção / Qualidade de Vida
    planosGerados = [
      { nome: 'Treino A - Peito', dias: ['Seg'], exercicios: [
        { nome: 'Supino Reto c/ Halteres', grupo: 'Peito', series: 3, reps: '10-12', carga: '', isPiramide: false, descanso: 60, obs: 'Amplitude segura para articular.' },
        { nome: 'Crucifixo Máquina', grupo: 'Peito', series: 3, reps: '12', carga: '', isPiramide: false, descanso: 60, obs: 'Alongar e contrair suavemente.' },
        { nome: 'Flexão de Braços Inclinada', grupo: 'Peito', series: 3, reps: '10', carga: '', isPiramide: false, descanso: 60, obs: 'Apoiar mãos em um banco.' },
        { nome: 'Prancha Isométrica', grupo: 'Abdômen', series: 3, reps: '30s', carga: '', isPiramide: false, descanso: 45, obs: 'Respiração cadenciada.' }
      ]},
      { nome: 'Treino B - Costas', dias: ['Ter'], exercicios: [
        { nome: 'Puxada Frontal Triângulo', grupo: 'Costas', series: 3, reps: '10-12', carga: '', isPiramide: false, descanso: 60, obs: 'Puxar focado no meio das costas.' },
        { nome: 'Remada Máquina Sentada', grupo: 'Costas', series: 3, reps: '12', carga: '', isPiramide: false, descanso: 60, obs: 'Postura confortável e ereta.' },
        { nome: 'Hiperextensão Lombar Banco', grupo: 'Costas', series: 3, reps: '12', carga: '', isPiramide: false, descanso: 60, obs: 'Subir até o corpo ficar reto, não arquear mais.' },
        { nome: 'Abdominal Supra Normal', grupo: 'Abdômen', series: 3, reps: '15-20', carga: '', isPiramide: false, descanso: 45, obs: 'Sem puxar o pescoço.' }
      ]},
      { nome: 'Treino C - Pernas', dias: ['Qua'], exercicios: [
        { nome: 'Leg Press Horizontal', grupo: 'Pernas', series: 3, reps: '12', carga: '', isPiramide: false, descanso: 60, obs: 'Pés na largura do quadril.' },
        { nome: 'Cadeira Extensora', grupo: 'Pernas', series: 3, reps: '12', carga: '', isPiramide: false, descanso: 60, obs: 'Foco na articulação saudável do joelho.' },
        { nome: 'Cadeira Flexora', grupo: 'Pernas', series: 3, reps: '12', carga: '', isPiramide: false, descanso: 60, obs: 'Trabalho focado na parte de trás da coxa.' },
        { nome: 'Panturrilha Sentado', grupo: 'Pernas', series: 3, reps: '15', carga: '', isPiramide: false, descanso: 45, obs: 'Subir esticando bem as panturrilhas.' }
      ]},
      { nome: 'Treino D - Ombros', dias: ['Qui'], exercicios: [
        { nome: 'Desenvolvimento Máquina Articulada', grupo: 'Ombros', series: 3, reps: '10-12', carga: '', isPiramide: false, descanso: 60, obs: 'Proteger as articulações dos ombros.' },
        { nome: 'Elevação Lateral Halteres Leves', grupo: 'Ombros', series: 3, reps: '12-15', carga: '', isPiramide: false, descanso: 60, obs: 'Amplitude até a altura dos ombros.' },
        { nome: 'Encolhimento Halteres', grupo: 'Ombros', series: 3, reps: '15', carga: '', isPiramide: false, descanso: 60, obs: 'Elevar os ombros na direção das orelhas.' },
        { nome: 'Prancha Lateral', grupo: 'Abdômen', series: 3, reps: '30s cada', carga: '', isPiramide: false, descanso: 45, obs: 'Manter quadril alinhado.' }
      ]},
      { nome: 'Treino E - Braços', dias: ['Sex'], exercicios: [
        { nome: 'Rosca Alternada com Halteres', grupo: 'Bíceps', series: 3, reps: '12 cada', carga: '', isPiramide: false, descanso: 60, obs: 'Girando o pulso na subida.' },
        { nome: 'Rosca Inversa Polia', grupo: 'Bíceps', series: 3, reps: '12', carga: '', isPiramide: false, descanso: 60, obs: 'Foco no antebraço e articulação do pulso.' },
        { nome: 'Tríceps Polia com Barra', grupo: 'Tríceps', series: 3, reps: '12', carga: '', isPiramide: false, descanso: 60, obs: 'Movimento contínuo e macio.' },
        { nome: 'Tríceps Banco (Mergulho)', grupo: 'Tríceps', series: 3, reps: '10-12', carga: '', isPiramide: false, descanso: 60, obs: 'Descer até o cotovelo formar 90 graus.' }
      ]}
    ];
  }

  const btnGerar = document.getElementById('btn-gerar-ia');
  btnGerar.textContent = 'Gerando Treinos...';
  btnGerar.disabled = true;

  // Processa e joga direto para os Planos Salvos do aplicativo
  planosGerados.forEach(plano => {
    plano.id = uid();
    plano.protocolo = 'Protocolo IA'; // Adiciona a tag de protocolo na IA automaticamente
    // Atribui IDs de execução para os exercícios funcionarem no modo de treino
    plano.exercicios.forEach(ex => ex.id = uid()); 
    state.planos.push(plano);
  });

  await save();
  
  closeModal('modal-plano');
  renderPlanos();
  renderExecutar();
  updateDashboard();
  
  // Reseta o botão no modal caso ele abra de novo
  btnGerar.textContent = '✨ Gerar com IA';
  btnGerar.disabled = false;
  
  alert(`Divisão de Segunda a Sexta gerada com sucesso para: ${objetivo.toUpperCase()}! 🔥 Pode conferir os seus 5 treinos novos.`);
});


function renderPlanos() {
  const grid = document.getElementById('planos-grid');
  if (state.planos.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">💪</div><p>Nenhum plano criado ainda.<br>Clique em <b>+ Novo Plano</b> para começar.</p></div>`;
    return;
  }
  grid.innerHTML = state.planos.map(p => `
    <div class="plano-card">
      ${p.protocolo ? `<div style="color:var(--accent); font-size:11px; text-transform:uppercase; font-weight:bold; letter-spacing:1px; margin-bottom: -8px;">${escHtml(p.protocolo)}</div>` : ''}
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
  document.getElementById('plano-protocolo').value = plano.protocolo || '';
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
      ${p.protocolo ? `<div style="color:var(--accent); font-size:11px; text-transform:uppercase; font-weight:bold; letter-spacing:1px; margin-bottom: 4px;">${escHtml(p.protocolo)}</div>` : ''}
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
    document.getElementById('exec-plano-nome').textContent = plano.protocolo ? `${plano.protocolo} - ${plano.nome}` : plano.nome;
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
    
    document.getElementById('exec-plano-nome').textContent = plano.protocolo ? `${plano.protocolo} - ${plano.nome}` : plano.nome;
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
  const dataHoje = new Date().toISOString().split('T')[0];
  
  // 1. Salvar Treino no Histórico
  const registro = {
    id: uid(),
    planoId: plano.id,
    planoNome: plano.nome,
    data: dataHoje,
    duracao: minutos,
    obs: 'Treino finalizado com sucesso.',
  };
  state.historico.push(registro);
  
  // 2. AUTOMAÇÃO DE CARGAS: Salvar exercícios concluídos no Progresso
  if (!state.cargas) state.cargas = [];
  
  checkedExerciciosIds.forEach(exId => {
    const ex = plano.exercicios.find(e => e.id === exId);
    // Verifica se achou o exercício e se a carga foi preenchida (diferente de vazio)
    if (ex && ex.carga && ex.carga.trim() !== '' && ex.carga !== '0') {
      state.cargas.push({
        id: uid(),
        exercicio: ex.nome, // Pega o nome exato do exercício
        peso: ex.carga,     // Pega a carga que estava configurada nele
        data: dataHoje
      });
    }
  });

  save();
  
  checkedExerciciosIds = [];
  workoutElapsedSeconds = 0;
  currentExecPlanoId = null;
  
  closeModal('modal-executar');
  renderHistorico();
  if (typeof renderCargas === 'function') renderCargas(); // Atualiza a tela de cargas por trás
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

// ===== SALVAR ONBOARDING INICIAL =====
document.getElementById('btn-salvar-onboarding').addEventListener('click', async () => {
  const nomeVal = document.getElementById('onb-nome').value.trim();
  const idadeVal = document.getElementById('onb-idade').value;
  const pesoVal = document.getElementById('onb-peso').value;
  const objVal = document.getElementById('onb-objetivo').value;
  
  if(!nomeVal || !idadeVal || !pesoVal) {
    alert('Preencha seu nome, idade e peso para continuar.');
    return;
  }
  
  const btn = document.getElementById('btn-salvar-onboarding');
  btn.textContent = 'Salvando...';
  btn.disabled = true;

  // Atualiza o state com os dados da primeira vez
  state.perfil.nome = nomeVal;
  state.perfil.idade = idadeVal;
  state.perfil.peso = pesoVal;
  state.perfil.objetivo = objVal;
  
  // Já insere o peso como o primeiro registro da evolução de peso
  if(state.pesos.length === 0) {
      state.pesos.push({ 
        data: new Date().toISOString().split('T')[0], 
        peso: parseFloat(pesoVal) 
      });
      renderPesoChart();
  }

  await save(); 
  
  if (typeof renderPerfil === 'function') {
    renderPerfil(); // Atualiza a tela de perfil por trás
  }
  
  // Atualiza instantaneamente a tela inicial para mostrar o nome da pessoa
  updateDashboard();
  
  closeModal('modal-onboarding');
  
  btn.textContent = 'Começar Minha Jornada';
  btn.disabled = false;
});

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
  if (typeof renderCargas === 'function') renderCargas();
  renderPesoChart();
  
  if (typeof renderPerfil === 'function') renderPerfil(); 
  
  // LÓGICA DO ONBOARDING: Se o perfil não tiver nome, idade OU peso, mostra o quiz.
  if (!state.perfil.nome || !state.perfil.idade || !state.perfil.peso) {
     document.getElementById('onb-nome').value = state.perfil.nome || '';
     openModal('modal-onboarding');
  }
}

initApp();