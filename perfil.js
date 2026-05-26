// ===== MÓDULO: PERFIL =====

function renderPerfil() {
  document.getElementById('perfil-nome').value = state.perfil.nome || '';
  document.getElementById('perfil-idade').value = state.perfil.idade || '';
  document.getElementById('perfil-peso').value = state.perfil.peso || '';
  document.getElementById('perfil-altura').value = state.perfil.altura || '';
  document.getElementById('perfil-objetivo').value = state.perfil.objetivo || 'hipertrofia';
  
  if (state.perfil.foto) {
    document.getElementById('perfil-foto-preview').src = state.perfil.foto;
  }
}

// Converter imagem para Base64 para salvar no LocalStorage
document.getElementById('perfil-foto-input').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    const base64 = event.target.result;
    document.getElementById('perfil-foto-preview').src = base64;
    state.perfil.foto = base64;
  };
  reader.readAsDataURL(file);
});

// Salvar Perfil
document.getElementById('btn-salvar-perfil').addEventListener('click', () => {
  state.perfil.nome = document.getElementById('perfil-nome').value.trim();
  state.perfil.idade = document.getElementById('perfil-idade').value;
  state.perfil.peso = document.getElementById('perfil-peso').value;
  state.perfil.altura = document.getElementById('perfil-altura').value;
  state.perfil.objetivo = document.getElementById('perfil-objetivo').value;
  
  save(); // Chama o salvamento centralizado do app.js
  alert('Perfil atualizado com sucesso! 💪');
});

// Inicializa a renderização dos dados do perfil
renderPerfil();