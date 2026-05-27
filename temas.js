// ===== MÓDULO: TEMAS (POP-UP ESQUERDO) =====

// 1. Cria a estrutura do menu flutuante diretamente no JS (assim não precisa mexer no index.html global)
const themePopUp = document.createElement('div');
themePopUp.id = 'theme-menu-popup';
themePopUp.style.cssText = `
  position: fixed;
  left: 80px; 
  bottom: 20px;
  background: #151518; /* var(--bg2) */
  border: 1px solid #2a2a35; /* var(--border) */
  border-radius: 8px; /* var(--radius-sm) */
  padding: 8px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4); /* var(--shadow) */
  display: none; /* Inicialmente escondido */
  flex-direction: column;
  gap: 4px;
  z-index: 101;
`;

themePopUp.innerHTML = `
  <button class="theme-option active" data-theme-val="dark" style="background:transparent; border:none; color:#9090a0; padding:8px 16px; text-align:left; border-radius:4px; cursor:pointer; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:500; transition:all 0.2s; display:flex; align-items:center; gap:8px;">
    🌙 Modo Escuro
  </button>
  <button class="theme-option" data-theme-val="light" style="background:transparent; border:none; color:#9090a0; padding:8px 16px; text-align:left; border-radius:4px; cursor:pointer; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:500; transition:all 0.2s; display:flex; align-items:center; gap:8px;">
    ☀️ Modo Claro
  </button>
`;

document.body.appendChild(themePopUp);

// 2. Lógica de Interação
const btnThemeToggle = document.getElementById('btn-theme-toggle'); // Assume que o botão com este ID existe na sidebar
const themeOptions = themePopUp.querySelectorAll('.theme-option');

// Abre/Fecha o Pop-up
if(btnThemeToggle) {
  btnThemeToggle.addEventListener('click', (e) => {
    e.stopPropagation(); // Evita que o clique feche o menu na mesma hora pelo evento do document
    themePopUp.style.display = themePopUp.style.display === 'flex' ? 'none' : 'flex';
  });
}

// Fecha o Pop-up se clicar em qualquer lugar fora dele
document.addEventListener('click', (e) => {
  if (!themePopUp.contains(e.target) && e.target !== btnThemeToggle) {
    themePopUp.style.display = 'none';
  }
});

// 3. Função que Aplica o Tema e Salva Preferência
function aplicarTema(tema) {
  const htmlTag = document.documentElement;
  htmlTag.setAttribute('data-theme', tema);
  
  // Salva no LocalStorage do navegador
  localStorage.setItem('fitcore_tema', tema);

  // Atualiza qual botão está "marcado" no Pop-up
  themeOptions.forEach(btn => {
    const isChosen = btn.dataset.themeVal === tema;
    btn.classList.toggle('active', isChosen);
    
    // Estilo visual do botão ativo (Verde FitCore)
    if(isChosen) {
        btn.style.background = 'rgba(200,241,53,0.15)';
        btn.style.color = '#c8f135'; // var(--accent)
    } else {
        btn.style.background = 'transparent';
        btn.style.color = '#9090a0'; // var(--text2)
    }
  });

  // Corrige o bug do flash branco atualizando a cor de fundo nativa do navegador instantaneamente
  if(tema === 'light') {
    htmlTag.style.backgroundColor = '#f4f4f5'; // Cor de fundo Clara
  } else {
    htmlTag.style.backgroundColor = '#0d0d0f'; // Cor de fundo Escura
  }
  
  // Atualiza o gráfico se ele estiver renderizado
  if(typeof renderPesoChart === 'function') {
    renderPesoChart();
  }
}

// 4. Inicialização
themeOptions.forEach(btn => {
  btn.addEventListener('click', () => {
    aplicarTema(btn.dataset.themeVal);
    themePopUp.style.display = 'none'; // Fecha o menu
  });
});

// Carrega o tema salvo ou padrão escuro ao abrir o app
const temaSalvo = localStorage.getItem('fitcore_tema') || 'dark';
aplicarTema(temaSalvo);