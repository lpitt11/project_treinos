// ===== MÓDULO: TEMAS =====

const themeMenu = document.getElementById('theme-menu');
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const themeOptions = document.querySelectorAll('.theme-option');

// Abre/Fecha o menu flutuante
btnThemeToggle.addEventListener('click', (e) => {
  e.stopPropagation(); // Evita que o clique feche o menu na mesma hora
  themeMenu.classList.toggle('open');
});

// Fecha o menu se clicar em qualquer lugar fora dele
document.addEventListener('click', (e) => {
  if (!themeMenu.contains(e.target) && e.target !== btnThemeToggle) {
    themeMenu.classList.remove('open');
  }
});

// Função principal que aplica as cores
function aplicarTema(tema) {
  const htmlTag = document.documentElement;
  htmlTag.setAttribute('data-theme', tema);
  
  // Corrige o bug do flash branco/preto atualizando a cor de fundo nativa
  if(tema === 'light') {
    htmlTag.style.backgroundColor = '#f4f4f5';
  } else {
    htmlTag.style.backgroundColor = '#0d0d0f';
  }

  // Atualiza qual botão está "marcado" no menu
  themeOptions.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeVal === tema);
  });

  // Se o gráfico de peso estiver na tela, ele precisa ser redesenhado com as novas cores
  if(typeof renderPesoChart === 'function') {
    renderPesoChart();
  }
}

// Escuta os cliques nos botões de Claro/Escuro
themeOptions.forEach(btn => {
  btn.addEventListener('click', () => {
    const selectedTheme = btn.dataset.themeVal;
    state.tema = selectedTheme;
    save(); // Salva a preferência no LocalStorage
    aplicarTema(selectedTheme);
    themeMenu.classList.remove('open'); // Fecha o menu
  });
});

// Inicia o tema correto ao abrir o app
aplicarTema(state.tema);