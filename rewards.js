/* =====================================================
   BaroKids – Reward System (rewards.js)
   Shared across all game pages
   ===================================================== */

function getStars() {
  return parseInt(localStorage.getItem('barokids_stars') || '0');
}

function addStars(n) {
  const current = getStars();
  const newTotal = current + n;
  localStorage.setItem('barokids_stars', newTotal);
  updateNavStars();
  return newTotal;
}

function updateNavStars() {
  const el = document.getElementById('nav-star-count');
  if (el) el.textContent = getStars();
}

function launchConfetti(count = 60) {
  const colors = ['#FFD700','#FF6B6B','#1E90FF','#2ECC71','#6C63FF','#FF69B4','#FFA500'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const size = Math.random() * 10 + 6;
    piece.style.cssText = `
      width: ${size}px;
      height: ${size * (Math.random() < 0.5 ? 1 : 0.4)}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      left: ${Math.random() * 100}vw;
      animation-duration: ${Math.random() * 2 + 1.5}s;
      animation-delay: ${Math.random() * 0.6}s;
    `;
    document.body.appendChild(piece);
    piece.addEventListener('animationend', () => piece.remove());
  }
}

function showToast(message, type) {
  let toast = document.getElementById('feedback-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'feedback-toast';
    toast.className = 'feedback-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `feedback-toast ${type === 'correct' ? 'correct-toast' : 'wrong-toast'} show`;
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 1800);
}

function buildNav(activePage) {
  const nav = document.createElement('nav');
  nav.className = 'nav-bar';
  nav.innerHTML = `
    <a href="index.html" class="nav-logo">Baro<span>Kids</span></a>
    <a href="rewards.html" class="nav-stars">⭐ <span id="nav-star-count">${getStars()}</span></a>
    <a href="index.html" class="nav-back">🏠 Guriga</a>
  `;
  document.body.prepend(nav);
}
