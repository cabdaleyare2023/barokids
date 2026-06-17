/* ═══════════════════════════════════════════════════════════
   BAROKIDS — Core JavaScript v2.0
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ──────────────────────────────────────────
   DATA STORE  (localStorage-backed)
────────────────────────────────────────── */
const DB = {
  KEY: 'barokids_v2',

  get() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || this.defaults();
    } catch { return this.defaults(); }
  },

  set(data) {
    localStorage.setItem(this.KEY, JSON.stringify(data));
  },

  defaults() {
    return {
      accounts: [],          // parent accounts
      currentUser: null,     // { id, email, name, role }
      currentChild: null,    // child profile id
      children: [],          // child profiles
      progress: {},          // { childId: { lessons, quizzes, stars, badges, xp, streak } }
      settings: { sound: true, language: 'so' }
    };
  },

  update(fn) {
    const data = this.get();
    fn(data);
    this.set(data);
  }
};

/* ──────────────────────────────────────────
   AUTH SYSTEM
────────────────────────────────────────── */
const Auth = {
  register(name, email, password) {
    const db = DB.get();
    if (db.accounts.find(a => a.email === email)) {
      return { ok: false, msg: 'Xisaab kula jirta email-kan. Fadlan geli mid kale.' };
    }
    const id = 'u_' + Date.now();
    const account = { id, name, email, password: btoa(password), role: 'parent', createdAt: new Date().toISOString() };
    db.accounts.push(account);
    db.currentUser = { id, email, name, role: 'parent' };
    DB.set(db);
    return { ok: true, user: db.currentUser };
  },

  login(email, password) {
    const db = DB.get();
    const account = db.accounts.find(a => a.email === email && a.password === btoa(password));
    if (!account) return { ok: false, msg: 'Email ama password khalad ah.' };
    db.currentUser = { id: account.id, email: account.email, name: account.name, role: account.role };
    DB.set(db);
    return { ok: true, user: db.currentUser };
  },

  logout() {
    DB.update(db => { db.currentUser = null; db.currentChild = null; });
    UI.updateAuthState();
    Toast.show('Waad ka baxday. Nabad gelyo!', 'info');
  },

  getUser() { return DB.get().currentUser; },
  isLoggedIn() { return !!DB.get().currentUser; },

  addChild(parentId, name, age, avatar) {
    const db = DB.get();
    const id = 'c_' + Date.now();
    const child = { id, parentId, name, age, avatar: avatar || '👦', createdAt: new Date().toISOString() };
    db.children.push(child);
    db.progress[id] = {
      lessons: {},   // { lessonId: { completed, score, completedAt } }
      quizzes: {},   // { quizId: { score, perfect, completedAt } }
      stars: 0,
      xp: 0,
      level: 1,
      streak: 0,
      lastActive: null,
      badges: []
    };
    if (!db.currentChild) db.currentChild = id;
    DB.set(db);
    return child;
  },

  getChildren(parentId) {
    return DB.get().children.filter(c => c.parentId === parentId);
  },

  setActiveChild(childId) {
    DB.update(db => { db.currentChild = childId; });
  },

  getActiveChild() {
    const db = DB.get();
    return db.children.find(c => c.id === db.currentChild) || null;
  }
};

/* ──────────────────────────────────────────
   PROGRESS SYSTEM
────────────────────────────────────────── */
const Progress = {
  get(childId) {
    const db = DB.get();
    childId = childId || db.currentChild;
    return db.progress[childId] || null;
  },

  completeLesson(childId, lessonId, score) {
    DB.update(db => {
      if (!db.progress[childId]) return;
      const p = db.progress[childId];
      const isNew = !p.lessons[lessonId]?.completed;
      p.lessons[lessonId] = { completed: true, score, completedAt: new Date().toISOString() };
      if (isNew) {
        p.xp += 10;
        p.stars += 1;
        Toast.show('🎉 Casharka baad dhamaysay! +10 XP', 'success');
      }
      p.level = this.calcLevel(p.xp);
      this.checkBadges(p);
    });
  },

  completeQuiz(childId, quizId, score, total) {
    DB.update(db => {
      if (!db.progress[childId]) return;
      const p = db.progress[childId];
      const perfect = score === total;
      const prev = p.quizzes[quizId];
      const xpEarned = perfect ? 20 : 5;
      if (!prev || score > (prev.score || 0)) {
        p.quizzes[quizId] = { score, total, perfect, completedAt: new Date().toISOString() };
        p.xp += xpEarned;
        if (perfect) {
          p.stars += 2;
          Confetti.launch(60);
        } else {
          p.stars += 1;
        }
      }
      p.level = this.calcLevel(p.xp);
      this.checkBadges(p);
    });
  },

  calcLevel(xp) {
    if (xp < 50)  return 1;
    if (xp < 150) return 2;
    if (xp < 300) return 3;
    if (xp < 500) return 4;
    return 5;
  },

  checkBadges(p) {
    const BADGES = [
      { id: 'first_lesson',   check: p => Object.keys(p.lessons).length >= 1,  name: 'Bilow', icon: '🌱' },
      { id: 'alpha_hero',     check: p => (p.quizzes['q_alphabet']?.score||0) >= 8, name: 'Alphabet Hero', icon: '🔤' },
      { id: 'num_master',     check: p => (p.quizzes['q_numbers']?.score||0) >= 8,  name: 'Number Master', icon: '🔢' },
      { id: 'color_expert',   check: p => (p.quizzes['q_colors']?.score||0) >= 8,   name: 'Color Expert',  icon: '🎨' },
      { id: 'animal_explorer',check: p => (p.quizzes['q_animals']?.score||0) >= 8,  name: 'Animal Explorer',icon: '🦁' },
      { id: 'young_muslim',   check: p => (p.quizzes['q_islamic']?.score||0) >= 8,  name: 'Young Muslim',  icon: '🌙' },
      { id: 'star_10',        check: p => p.stars >= 10, name: '10 Xiddig', icon: '⭐' },
      { id: 'star_50',        check: p => p.stars >= 50, name: '50 Xiddig', icon: '🌟' },
    ];
    BADGES.forEach(b => {
      if (!p.badges.includes(b.id) && b.check(p)) {
        p.badges.push(b.id);
        Toast.show(`🏅 Badge cusub: ${b.name} ${b.icon}`, 'star');
      }
    });
  },

  getStats(childId) {
    const p = this.get(childId);
    if (!p) return null;
    const lessonsCompleted = Object.keys(p.lessons).length;
    const quizzesCompleted = Object.keys(p.quizzes).length;
    const avgScore = quizzesCompleted > 0
      ? Math.round(Object.values(p.quizzes).reduce((a, q) => a + (q.score / q.total) * 100, 0) / quizzesCompleted)
      : 0;
    return { ...p, lessonsCompleted, quizzesCompleted, avgScore };
  },

  getXpToNext(xp) {
    const thresholds = [50, 150, 300, 500, 999];
    const level = this.calcLevel(xp);
    const prev = [0, 50, 150, 300, 500][level - 1];
    const next = thresholds[level - 1];
    return { current: xp - prev, needed: next - prev, level };
  }
};

/* ──────────────────────────────────────────
   QUIZ ENGINE
────────────────────────────────────────── */
const Quiz = {
  state: {
    questions: [],
    current: 0,
    answers: [],
    score: 0,
    quizId: null,
    childId: null,
    answered: false,
    timer: null
  },

  QUIZZES: {
    q_alphabet: {
      title: 'Xarfaha Soomaaliga',
      titleEn: 'Somali Alphabet',
      icon: '🔤',
      questions: [
        { type: 'mc', q: 'A waxay u taagan tahay?', opts: ['Af', 'Bahal', 'Caano', 'Dab'], ans: 0, audio: null },
        { type: 'mc', q: 'B waxay u taagan tahay?', opts: ['Af', 'Bahal', 'Caano', 'Dab'], ans: 1, audio: null },
        { type: 'mc', q: 'Libaax xarfaha kee ku bilaabmaa?', opts: ['K', 'L', 'M', 'N'], ans: 1, audio: null },
        { type: 'tf', q: 'G waxay u taagan tahay "Guri" (House).', ans: true, audio: null },
        { type: 'tf', q: 'X waxay u taagan tahay "Xiddig" (Star).', ans: true, audio: null },
        { type: 'mc', q: 'Kaluun xarfaha kee?', opts: ['J', 'K', 'L', 'M'], ans: 1, audio: null },
        { type: 'mc', q: '"Roob" macneheedu waa?', opts: ['Sun', 'Rain', 'Wind', 'Cloud'], ans: 1, audio: null },
        { type: 'tf', q: 'Z waxay u taagan tahay "Zool" (Giraffe).', ans: true, audio: null },
        { type: 'mc', q: 'W waxay u taagan tahay?', opts: ['Waxa', 'Waxbarasho', 'Weel', 'Wiil'], ans: 1, audio: null },
        { type: 'mc', q: 'Tirada xarfaha Soomaaliga waa?', opts: ['18', '21', '24', '26'], ans: 1, audio: null }
      ]
    },
    q_numbers: {
      title: 'Tirooyin',
      titleEn: 'Numbers',
      icon: '🔢',
      questions: [
        { type: 'mc', q: 'Kow Ingiriisi waa?', opts: ['Two', 'One', 'Three', 'Four'], ans: 1 },
        { type: 'mc', q: 'Toddoba = ?', opts: ['6', '7', '8', '9'], ans: 1 },
        { type: 'mc', q: 'Shan + Laba = ?', opts: ['Lix', 'Toddoba', 'Siddeed', 'Sagaal'], ans: 1 },
        { type: 'tf', q: 'Toban waa 10.', ans: true },
        { type: 'mc', q: 'Saddex iyo toban = ?', opts: ['11', '12', '13', '14'], ans: 2 },
        { type: 'mc', q: 'Labaatan = ?', opts: ['15', '18', '20', '25'], ans: 2 },
        { type: 'tf', q: 'Afar waa Four.', ans: true },
        { type: 'mc', q: 'Sagaal − Afar = ?', opts: ['Shan', 'Lix', 'Saddex', 'Afar'], ans: 0 },
        { type: 'mc', q: 'Toban + Toban = ?', opts: ['Labaatan', 'Kow iyo toban', 'Shan iyo toban', 'Saddex iyo toban'], ans: 0 },
        { type: 'mc', q: 'Usbuuca maalin imisa?', opts: ['Lix', 'Toddoba', 'Siddeed', 'Shan'], ans: 1 }
      ]
    },
    q_colors: {
      title: 'Midabada',
      titleEn: 'Colors',
      icon: '🎨',
      questions: [
        { type: 'mc', q: 'Samadu waa midab?', opts: ['Cas', 'Cagaar', 'Buluug', 'Huruud'], ans: 2 },
        { type: 'mc', q: 'Red Soomaali waa?', opts: ['Cad', 'Cas', 'Cagaar', 'Madow'], ans: 1 },
        { type: 'tf', q: 'Qorraxdu waa Huruud (Yellow).', ans: true },
        { type: 'mc', q: 'Geedku waa midab?', opts: ['Cas', 'Buluug', 'Cagaar', 'Madow'], ans: 2 },
        { type: 'mc', q: 'White Soomaali waa?', opts: ['Madow', 'Cad', 'Bunni', 'Warqad'], ans: 1 },
        { type: 'tf', q: 'Habeenka waa Cad.', ans: false },
        { type: 'mc', q: 'Orange Soomaali waa?', opts: ['Huruud', 'Oranjo', 'Cas', 'Guduud'], ans: 1 },
        { type: 'mc', q: 'Midabada jimicsiga (primary) waa?', opts: ['Cas, Cagaar, Buluug', 'Madow, Cad, Bunni', 'Huruud, Oranjo, Cas', 'Guduud, Warqad, Dhadeer'], ans: 0 },
        { type: 'mc', q: 'Brown Soomaali waa?', opts: ['Bunni', 'Warqad', 'Cagaaran', 'Dhadeer'], ans: 0 },
        { type: 'tf', q: 'Caanaha waa Cad (White).', ans: true }
      ]
    },
    q_animals: {
      title: 'Xayawaanka',
      titleEn: 'Animals',
      icon: '🦁',
      questions: [
        { type: 'mc', q: 'Boqorka xayawaanka waa?', opts: ['Maroodi', 'Geel', 'Libaax', 'Daayeer'], ans: 2 },
        { type: 'mc', q: 'Geel English waa?', opts: ['Elephant', 'Horse', 'Camel', 'Lion'], ans: 2 },
        { type: 'tf', q: 'Kaluunka wuxuu ku noolaa badda.', ans: true },
        { type: 'mc', q: 'Lo\' waxay bixisaa?', opts: ['Ukun', 'Caano', 'Dhogor', 'Hilib kaliya'], ans: 1 },
        { type: 'mc', q: 'Kan ugu degdegta xayawaanka?', opts: ['Libaax', 'Maroodi', 'Libaax doog', 'Daayeer'], ans: 2 },
        { type: 'tf', q: 'Abeeso waa xayawaanka badda ugu weyn.', ans: true },
        { type: 'mc', q: 'Digaag waxay bixisaa?', opts: ['Caano', 'Ukun', 'Hilib kaliya', 'Dhogor'], ans: 1 },
        { type: 'mc', q: 'Doofin English waa?', opts: ['Shark', 'Whale', 'Dolphin', 'Fish'], ans: 2 },
        { type: 'mc', q: 'Xayawaanka cidlada ku nool?', opts: ['Kaluun', 'Geel', 'Doofin', 'Abeeso'], ans: 1 },
        { type: 'tf', q: 'Daayeertu waxay naagtaa geedaha.', ans: true }
      ]
    },
    q_islamic: {
      title: 'Waxbarashada Islaamka',
      titleEn: 'Islamic Learning',
      icon: '🌙',
      questions: [
        { type: 'mc', q: 'Marka aad cunto bilaabayso maxaad tiraahda?', opts: ['Alxamdulillah', 'Bismillah', 'Inshallah', 'Mashallah'], ans: 1 },
        { type: 'mc', q: 'Salaadda maalin kasta imisa jeer?', opts: ['3', '4', '5', '6'], ans: 2 },
        { type: 'tf', q: 'Alle waa mid.', ans: true },
        { type: 'mc', q: 'Tiimurka Islaamka imisa?', opts: ['3', '4', '5', '6'], ans: 2 },
        { type: 'mc', q: 'Salaadda kowaad waa?', opts: ['Duhr', 'Casr', 'Subax', 'Maqrib'], ans: 2 },
        { type: 'tf', q: 'Zakaddu waa bixinta lacagta miskiinada.', ans: true },
        { type: 'mc', q: 'Subhanallah waxay macnaheedu tahay?', opts: ['Mahad Alle', 'Alle wuu ka weyn yahay', 'Alle waa quduus', 'Hadduu Alle doono'], ans: 2 },
        { type: 'mc', q: 'Nebi Muxamed (SCW) wuxuu ku dhashay?', opts: ['Madiina', 'Makkah', 'Jerusalem', 'Taif'], ans: 1 },
        { type: 'tf', q: 'Xajka waa tiimurka shanaad ee Islaamka.', ans: true },
        { type: 'mc', q: 'Al-Khaliq macneheedu waa?', opts: ['Boqorka', 'Abuuraha', 'Maqle', 'Naxariis'], ans: 1 }
      ]
    }
  },

  start(quizId) {
    const quiz = this.QUIZZES[quizId];
    if (!quiz) return;
    const db = DB.get();
    this.state = {
      questions: [...quiz.questions].sort(() => Math.random() - 0.5).slice(0, 10),
      current: 0,
      answers: [],
      score: 0,
      quizId,
      childId: db.currentChild,
      answered: false
    };
    this.render();
  },

  render() {
    const container = document.getElementById('quiz-container');
    if (!container) return;
    const { questions, current, score } = this.state;
    const q = questions[current];
    const total = questions.length;

    container.innerHTML = `
      <div class="quiz-header mb-6">
        <div class="flex-between mb-4">
          <span class="points-chip">⭐ ${score * 10} pts</span>
          <span class="text-muted" style="font-size:0.88rem;font-weight:700;">${current + 1} / ${total}</span>
        </div>
        <div class="quiz-progress">
          ${questions.map((_, i) => `<div class="q-dot ${i < current ? 'done' : i === current ? 'current' : ''}"></div>`).join('')}
        </div>
        <div class="progress-track mt-4">
          <div class="progress-fill pf-blue" style="width:${((current) / total) * 100}%"></div>
        </div>
      </div>
      <div class="card" style="padding:32px;margin-bottom:24px;">
        <p style="font-size:0.8rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">
          Su'aal ${current + 1}
        </p>
        <h2 style="font-size:1.3rem;font-weight:800;color:var(--text);line-height:1.4;margin-bottom:8px;">${q.q}</h2>
        ${q.audio ? `<button class="audio-btn mt-4" onclick="Quiz.playAudio('${q.audio}')">
          🔊 Dhageyso
        </button>` : ''}
      </div>
      <div id="quiz-options" style="display:flex;flex-direction:column;gap:12px;">
        ${this.renderOptions(q)}
      </div>
      <div id="quiz-feedback" class="hidden" style="margin-top:20px;padding:20px;border-radius:20px;text-align:center;"></div>
      <button id="quiz-next" class="btn btn-blue btn-full mt-6 hidden" onclick="Quiz.next()">
        ${current + 1 < total ? 'Xiga ➜' : 'Dhamee Ciyaarta 🏁'}
      </button>
    `;
    this.state.answered = false;
  },

  renderOptions(q) {
    if (q.type === 'mc') {
      const letters = ['A', 'B', 'C', 'D'];
      return q.opts.map((opt, i) => `
        <button class="quiz-option" onclick="Quiz.answer(${i})" data-idx="${i}">
          <span class="opt-letter">${letters[i]}</span>
          ${opt}
        </button>
      `).join('');
    }
    if (q.type === 'tf') {
      return `
        <button class="quiz-option" onclick="Quiz.answer(true)" data-val="true">
          <span class="opt-letter">✓</span> Haa (True)
        </button>
        <button class="quiz-option" onclick="Quiz.answer(false)" data-val="false">
          <span class="opt-letter">✗</span> Maya (False)
        </button>
      `;
    }
    return '';
  },

  answer(selected) {
    if (this.state.answered) return;
    this.state.answered = true;
    const q = this.state.questions[this.state.current];
    const isCorrect = selected === q.ans;

    document.querySelectorAll('.quiz-option').forEach(btn => {
      btn.disabled = true;
      const idx = btn.dataset.idx !== undefined ? parseInt(btn.dataset.idx) : (btn.dataset.val === 'true');
      if (idx === q.ans) btn.classList.add('correct');
      else if (idx === selected && !isCorrect) btn.classList.add('wrong');
    });

    if (isCorrect) this.state.score++;

    const fb = document.getElementById('quiz-feedback');
    fb.classList.remove('hidden');
    fb.style.background = isCorrect ? 'var(--green-light)' : '#FEF2F2';
    fb.innerHTML = `
      <div style="font-size:2rem;margin-bottom:8px;">${isCorrect ? '✅' : '❌'}</div>
      <div style="font-weight:800;color:${isCorrect ? 'var(--green)' : 'var(--red)'};">
        ${isCorrect ? 'Saxsax! +10 pts 🎉' : 'Isku day mar kale!'}
      </div>
      ${!isCorrect && q.type === 'mc' ? `<div style="font-size:0.85rem;color:var(--text-muted);margin-top:6px;font-weight:600;">Jawaabta saxda: ${q.opts[q.ans]}</div>` : ''}
      ${!isCorrect && q.type === 'tf' ? `<div style="font-size:0.85rem;color:var(--text-muted);margin-top:6px;font-weight:600;">Jawaabta saxda: ${q.ans ? 'Haa' : 'Maya'}</div>` : ''}
    `;

    document.getElementById('quiz-next').classList.remove('hidden');
    this.state.answers.push({ correct: isCorrect, selected });
  },

  next() {
    this.state.current++;
    if (this.state.current >= this.state.questions.length) {
      this.finish();
    } else {
      this.render();
    }
  },

  finish() {
    const { score, questions, quizId, childId } = this.state;
    const total = questions.length;
    const pct = Math.round((score / total) * 100);
    const stars = score >= total ? 3 : score >= Math.ceil(total * 0.7) ? 2 : 1;

    if (childId) Progress.completeQuiz(childId, quizId, score, total);
    if (score === total) Confetti.launch(80);

    const container = document.getElementById('quiz-container');
    container.innerHTML = `
      <div style="text-align:center;padding:20px 0;">
        <div style="font-size:4rem;margin-bottom:16px;">${score === total ? '🏆' : score >= total*0.7 ? '🌟' : '📚'}</div>
        <h2 style="font-family:var(--font-display);font-size:2rem;margin-bottom:8px;">
          ${score === total ? 'Kamil!' : score >= total*0.7 ? 'Aad fiican!' : 'Isku day!'}
        </h2>
        <p style="color:var(--text-muted);font-weight:600;margin-bottom:24px;">
          ${score} / ${total} su'aalood ayaad saxsaxday – ${pct}%
        </p>
        <div class="star-rating mb-8">
          ${[1,2,3].map(i => `<span class="star-display ${i <= stars ? 'active' : ''}">⭐</span>`).join('')}
        </div>
        <div style="background:var(--bg);border-radius:20px;padding:20px;margin-bottom:28px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
          <div><div style="font-family:var(--font-display);font-size:1.6rem;color:var(--blue);">${score}</div><div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);">Saxsax</div></div>
          <div><div style="font-family:var(--font-display);font-size:1.6rem;color:var(--orange);">${total - score}</div><div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);">Khalad</div></div>
          <div><div style="font-family:var(--font-display);font-size:1.6rem;color:var(--green);">${stars}⭐</div><div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);">Xiddig</div></div>
        </div>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-outline" onclick="Quiz.start('${quizId}')">🔄 Dib u Ciyaar</button>
          <a href="index.html" class="btn btn-blue">🏠 Guriga</a>
          <a href="rewards.html" class="btn btn-orange">🏆 Abaalmarinta</a>
        </div>
      </div>
    `;
  },

  playAudio(src) {
    try {
      const audio = new Audio(src);
      audio.play().catch(() => Toast.show('Codku ma shaqaynaayo', 'error'));
    } catch { Toast.show('Audio file ma jirto', 'error'); }
  }
};

/* ──────────────────────────────────────────
   UI HELPERS
────────────────────────────────────────── */
const UI = {
  updateAuthState() {
    const user = Auth.getUser();
    document.querySelectorAll('[data-auth="logged-in"]').forEach(el =>
      el.classList.toggle('hidden', !user));
    document.querySelectorAll('[data-auth="logged-out"]').forEach(el =>
      el.classList.toggle('hidden', !!user));
    document.querySelectorAll('[data-user-name]').forEach(el =>
      el.textContent = user ? user.name : '');
    if (user) {
      const child = Auth.getActiveChild();
      const db = DB.get();
      const stars = child ? (db.progress[child.id]?.stars || 0) : 0;
      document.querySelectorAll('[data-stars]').forEach(el => el.textContent = stars);
    }
  },

  populateChildSelector() {
    const user = Auth.getUser();
    if (!user) return;
    const children = Auth.getChildren(user.id);
    const sel = document.getElementById('child-selector');
    if (!sel) return;
    sel.innerHTML = children.length
      ? children.map(c => `<option value="${c.id}">${c.avatar} ${c.name}</option>`).join('')
      : '<option value="">Ilmo ma jirto – ku dar</option>';
    const db = DB.get();
    if (db.currentChild) sel.value = db.currentChild;
  },

  setActiveNav() {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(a => {
      const href = a.getAttribute('href');
      a.classList.toggle('active', href === path || (path === '' && href === 'index.html'));
    });
  },

  renderProgressBars() {
    const child = Auth.getActiveChild();
    if (!child) return;
    const db = DB.get();
    const p = db.progress[child.id];
    if (!p) return;
    const UNITS = ['alphabet','numbers','colors','animals','islamic'];
    const QUIZ_MAP = { alphabet: 'q_alphabet', numbers: 'q_numbers', colors: 'q_colors', animals: 'q_animals', islamic: 'q_islamic' };
    UNITS.forEach(unit => {
      const qId = QUIZ_MAP[unit];
      const q = p.quizzes[qId];
      const pct = q ? Math.round((q.score / q.total) * 100) : 0;
      document.querySelectorAll(`[data-progress="${unit}"]`).forEach(el => {
        el.style.width = pct + '%';
      });
      document.querySelectorAll(`[data-progress-pct="${unit}"]`).forEach(el => {
        el.textContent = pct + '%';
      });
    });
    // XP bar
    const { current, needed, level } = Progress.getXpToNext(p.xp);
    document.querySelectorAll('[data-xp-bar]').forEach(el => {
      el.style.width = Math.min(100, (current / needed) * 100) + '%';
    });
    document.querySelectorAll('[data-level]').forEach(el => el.textContent = level);
    document.querySelectorAll('[data-xp]').forEach(el => el.textContent = p.xp);
    document.querySelectorAll('[data-stars-count]').forEach(el => el.textContent = p.stars);
  }
};

/* ──────────────────────────────────────────
   TOAST SYSTEM
────────────────────────────────────────── */
const Toast = {
  show(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const icons = { success: '✅', error: '❌', star: '⭐', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }
};

/* ──────────────────────────────────────────
   CONFETTI
────────────────────────────────────────── */
const Confetti = {
  launch(count = 50) {
    const colors = ['#2563EB','#7C3AED','#EA580C','#16A34A','#D97706','#DB2777','#FCD34D'];
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      const size = Math.random() * 10 + 6;
      el.style.cssText = `
        width:${size}px;height:${size * (Math.random() < 0.5 ? 1 : 0.4)}px;
        background:${colors[Math.floor(Math.random() * colors.length)]};
        top:-10px;left:${Math.random() * 100}vw;
        animation:confettiFall ${Math.random() * 2 + 1.5}s linear ${Math.random() * 0.8}s forwards;
        transform:rotate(${Math.random() * 360}deg);
      `;
      document.body.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }
  }
};

/* ──────────────────────────────────────────
   MODAL SYSTEM
────────────────────────────────────────── */
const Modal = {
  open(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
  },
  close(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.remove('open'); document.body.style.overflow = ''; }
  },
  closeAll() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
    document.body.style.overflow = '';
  }
};

/* ──────────────────────────────────────────
   AUTH FORM HANDLERS
────────────────────────────────────────── */
function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email')?.value.trim();
  const password = document.getElementById('login-password')?.value;
  if (!email || !password) { Toast.show('Fadlan buuxi dhammaan goobaha', 'error'); return; }
  const result = Auth.login(email, password);
  if (result.ok) {
    Modal.closeAll();
    UI.updateAuthState();
    UI.populateChildSelector();
    UI.renderProgressBars();
    Toast.show(`Ku soo dhawow, ${result.user.name}! 👋`, 'success');
  } else {
    Toast.show(result.msg, 'error');
  }
}

function handleRegister(e) {
  e.preventDefault();
  const name     = document.getElementById('reg-name')?.value.trim();
  const email    = document.getElementById('reg-email')?.value.trim();
  const password = document.getElementById('reg-password')?.value;
  const confirm  = document.getElementById('reg-confirm')?.value;
  if (!name || !email || !password) { Toast.show('Fadlan buuxi dhammaan goobaha', 'error'); return; }
  if (password !== confirm) { Toast.show('Furaha sirta ah isku mid ma aha', 'error'); return; }
  if (password.length < 6) { Toast.show('Furaha sirta ah waa in uu ka badan yahay 6 xaraf', 'error'); return; }
  const result = Auth.register(name, email, password);
  if (result.ok) {
    Modal.closeAll();
    UI.updateAuthState();
    Toast.show(`Xisaab cusub! Ku soo dhawow ${name}! 🎉`, 'success');
    setTimeout(() => Modal.open('modal-add-child'), 800);
  } else {
    Toast.show(result.msg, 'error');
  }
}

function handleAddChild(e) {
  e.preventDefault();
  const user = Auth.getUser();
  if (!user) { Toast.show('Fadlan gal marka hore', 'error'); return; }
  const name   = document.getElementById('child-name')?.value.trim();
  const age    = document.getElementById('child-age')?.value;
  const avatar = document.getElementById('selected-avatar')?.value || '👦';
  if (!name || !age) { Toast.show('Fadlan buuxi dhammaan goobaha', 'error'); return; }
  Auth.addChild(user.id, name, parseInt(age), avatar);
  Modal.closeAll();
  UI.updateAuthState();
  UI.populateChildSelector();
  UI.renderProgressBars();
  Confetti.launch(30);
  Toast.show(`${avatar} ${name} waad ku dartay! 🎉`, 'success');
}

/* ──────────────────────────────────────────
   SCROLL REVEAL
────────────────────────────────────────── */
function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); } });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => io.observe(el));
}

/* ──────────────────────────────────────────
   NAV HAMBURGER
────────────────────────────────────────── */
function initNav() {
  const hamburger = document.getElementById('nav-hamburger');
  const mobileNav = document.getElementById('nav-mobile');
  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      mobileNav.classList.toggle('open');
    });
    document.addEventListener('click', e => {
      if (!hamburger.contains(e.target) && !mobileNav.contains(e.target)) {
        mobileNav.classList.remove('open');
      }
    });
  }
}

/* ──────────────────────────────────────────
   AVATAR PICKER
────────────────────────────────────────── */
function initAvatarPicker() {
  const avatars = ['👦', '👧', '🧒', '👶', '🦊', '🐻', '🦁', '🐯', '🐸', '🐧', '🦋', '🌟'];
  const container = document.getElementById('avatar-picker');
  const hidden = document.getElementById('selected-avatar');
  if (!container) return;
  container.innerHTML = avatars.map(a => `
    <button type="button" class="avatar-opt" data-avatar="${a}" onclick="selectAvatar('${a}')"
      style="font-size:2rem;padding:10px;border-radius:14px;border:2px solid var(--border);background:var(--bg);cursor:pointer;transition:all 0.15s;">
      ${a}
    </button>
  `).join('');
  if (hidden) hidden.value = avatars[0];
}

function selectAvatar(av) {
  document.querySelectorAll('.avatar-opt').forEach(b => {
    b.style.borderColor = b.dataset.avatar === av ? 'var(--blue)' : 'var(--border)';
    b.style.background = b.dataset.avatar === av ? 'var(--blue-light)' : 'var(--bg)';
  });
  const h = document.getElementById('selected-avatar');
  if (h) h.value = av;
  const preview = document.getElementById('avatar-preview');
  if (preview) preview.textContent = av;
}

/* ──────────────────────────────────────────
   LESSON CARDS DATA
────────────────────────────────────────── */
const LESSONS = [
  { id: 'alphabet', title: 'Xarfaha Soomaaliga', titleEn: 'Somali Alphabet', icon: '🔤', color: 'lc-blue', desc: 'Baro dhammaan 21 xarfaha Soomaaliga', mins: 10, ageGroup: '3–8', quizId: 'q_alphabet' },
  { id: 'numbers',  title: 'Tirooyin 1–20',      titleEn: 'Numbers 1–20',    icon: '🔢', color: 'lc-green',  desc: 'Baro timaaddada 1 ilaa 20', mins: 8, ageGroup: '2–8', quizId: 'q_numbers' },
  { id: 'colors',   title: 'Midabada',           titleEn: 'Colors',          icon: '🎨', color: 'lc-orange', desc: 'Baro midabada kala duwan', mins: 8, ageGroup: '2–7', quizId: 'q_colors' },
  { id: 'animals',  title: 'Xayawaanka',         titleEn: 'Animals',         icon: '🦁', color: 'lc-purple', desc: 'Baro magacyada xayawaanka', mins: 10, ageGroup: '2–8', quizId: 'q_animals' },
  { id: 'islamic',  title: 'Waxbarashada Islaamka', titleEn: 'Islamic Learning', icon: '🌙', color: 'lc-yellow', desc: 'Baro Ducada, Salaadda iyo Quranka', mins: 12, ageGroup: '3–8', quizId: 'q_islamic' }
];

function renderLessonCards(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const child = Auth.getActiveChild();
  const db = DB.get();
  const progress = child ? db.progress[child.id] : null;

  container.innerHTML = LESSONS.map(lesson => {
    const q = progress?.quizzes[lesson.quizId];
    const pct = q ? Math.round((q.score / q.total) * 100) : 0;
    const isDone = pct > 0;
    return `
      <div class="lesson-card reveal" onclick="window.location.href='lessons.html?lesson=${lesson.id}'">
        <span class="lc-badge ${isDone ? 'badge-done' : 'badge-new'}">${isDone ? '✓ Dhamaystay' : 'Cusub'}</span>
        <div class="lc-icon ${lesson.color}">${lesson.icon}</div>
        <h3>${lesson.title}</h3>
        <p>${lesson.desc}</p>
        <div class="lc-meta">
          <span>⏱ ${lesson.mins} daqiiqo</span>
          <span>👶 Da' ${lesson.ageGroup}</span>
        </div>
        ${isDone ? `
          <div class="progress-wrap">
            <div class="progress-label"><span>Horumar</span><span>${pct}%</span></div>
            <div class="progress-track"><div class="progress-fill pf-blue" style="width:${pct}%"></div></div>
          </div>
        ` : ''}
        <button class="btn btn-blue btn-sm" style="margin-top:8px;">
          ${isDone ? '🔄 Ku Noqo' : '▶ Bilaw'} ${lesson.titleEn}
        </button>
      </div>
    `;
  }).join('');
}

/* ──────────────────────────────────────────
   LESSON CONTENT
────────────────────────────────────────── */
const LESSON_CONTENT = {
  alphabet: {
    title: 'Xarfaha Soomaaliga', icon: '🔤',
    sections: [
      { type: 'intro', text: 'Soomaaliga waxay leedahay 21 xaraf. Aan barannno mid mid!' },
      { type: 'grid', label: 'Xarfaha iyo Erayada', items: [
        { letter:'A', word:'Af', emoji:'👄', meaning:'Mouth' }, { letter:'B', word:'Bahal', emoji:'🐾', meaning:'Animal' },
        { letter:'C', word:'Caano', emoji:'🥛', meaning:'Milk' }, { letter:'D', word:'Dab', emoji:'🔥', meaning:'Fire' },
        { letter:'E', word:'Eel', emoji:'🐍', meaning:'Eel' }, { letter:'F', word:'Fool', emoji:'😊', meaning:'Face' },
        { letter:'G', word:'Guri', emoji:'🏠', meaning:'House' }, { letter:'H', word:'Hilib', emoji:'🥩', meaning:'Meat' },
        { letter:'I', word:'Ilmo', emoji:'👧', meaning:'Child' }, { letter:'J', word:'Jilaal', emoji:'🌵', meaning:'Dry Season' },
        { letter:'K', word:'Kaluun', emoji:'🐟', meaning:'Fish' }, { letter:'L', word:'Libaax', emoji:'🦁', meaning:'Lion' },
        { letter:'M', word:'Malab', emoji:'🍯', meaning:'Honey' }, { letter:'N', word:'Naag', emoji:'👩', meaning:'Woman' },
        { letter:'O', word:'Ood', emoji:'🌿', meaning:'Fence' }, { letter:'Q', word:'Qori', emoji:'🪵', meaning:'Stick' },
        { letter:'R', word:'Roob', emoji:'🌧️', meaning:'Rain' }, { letter:'S', word:'Suuq', emoji:'🏪', meaning:'Market' },
        { letter:'T', word:'Timir', emoji:'🌴', meaning:'Date fruit' }, { letter:'U', word:'Ukun', emoji:'🥚', meaning:'Egg' },
        { letter:'W', word:'Waxbarasho', emoji:'📚', meaning:'Education' },
        { letter:'X', word:'Xiddig', emoji:'⭐', meaning:'Star' }, { letter:'Y', word:'Yar', emoji:'🐣', meaning:'Small' },
        { letter:'Z', word:'Zool', emoji:'🦒', meaning:'Giraffe' }
      ]}
    ]
  },
  numbers: {
    title: 'Tirooyin', icon: '🔢',
    sections: [
      { type: 'intro', text: 'Maanta waxaan baranaynaa timaaddada Soomaalida 1 ilaa 20!' },
      { type: 'numgrid', items: [
        {n:1,so:'Kow'},{n:2,so:'Laba'},{n:3,so:'Saddex'},{n:4,so:'Afar'},{n:5,so:'Shan'},
        {n:6,so:'Lix'},{n:7,so:'Toddoba'},{n:8,so:'Siddeed'},{n:9,so:'Sagaal'},{n:10,so:'Toban'},
        {n:11,so:'Kow iyo toban'},{n:12,so:'Laba iyo toban'},{n:13,so:'Saddex iyo toban'},
        {n:14,so:'Afar iyo toban'},{n:15,so:'Shan iyo toban'},{n:16,so:'Lix iyo toban'},
        {n:17,so:'Toddoba iyo toban'},{n:18,so:'Siddeed iyo toban'},{n:19,so:'Sagaal iyo toban'},{n:20,so:'Labaatan'}
      ]}
    ]
  },
  colors: {
    title: 'Midabada', icon: '🎨',
    sections: [
      { type: 'intro', text: 'Dunidu waa midab badan tahay! Aan barannno midabada Soomaaliga.' },
      { type: 'colorgrid', items: [
        {so:'Cas',en:'Red',hex:'#E74C3C'},{so:'Cagaar',en:'Green',hex:'#27AE60'},
        {so:'Buluug',en:'Blue',hex:'#2980B9'},{so:'Huruud',en:'Yellow',hex:'#F1C40F'},
        {so:'Oranjo',en:'Orange',hex:'#E67E22'},{so:'Guduud',en:'Purple',hex:'#8E44AD'},
        {so:'Cad',en:'White',hex:'#BDC3C7'},{so:'Madow',en:'Black',hex:'#2C3E50'},
        {so:'Bunni',en:'Brown',hex:'#795548'},{so:'Warqad',en:'Pink',hex:'#FF69B4'},
        {so:'Cagaaran',en:'Teal',hex:'#1ABC9C'},{so:'Dhadeer',en:'Grey',hex:'#607D8B'}
      ]}
    ]
  },
  animals: {
    title: 'Xayawaanka', icon: '🦁',
    sections: [
      { type: 'intro', text: 'Alle wuxuu abuuray xayawaan badan oo kala duwan. Aan barannno!' },
      { type: 'animalgrid', items: [
        {so:'Libaax',en:'Lion',emoji:'🦁',fact:'Boqorka xayawaanka'},
        {so:'Maroodi',en:'Elephant',emoji:'🐘',fact:'Ka weyn dhammaan'},
        {so:'Geel',en:'Camel',emoji:'🐪',fact:'Xayawaanka Soomaalida'},
        {so:'Kaluun',en:'Fish',emoji:'🐟',fact:'Ku nool badda'},
        {so:'Doofin',en:'Dolphin',emoji:'🐬',fact:'Caqli badan'},
        {so:'Daayeer',en:'Monkey',emoji:'🐒',fact:'Naagtaa geedaha'},
        {so:'Lo\'',en:'Cow',emoji:'🐄',fact:'Bixisa caano'},
        {so:'Digaag',en:'Chicken',emoji:'🐓',fact:'Bixisa ukun'},
        {so:'Ri',en:'Goat',emoji:'🐐',fact:'Cunaa caws'},
        {so:'Libaax doog',en:'Cheetah',emoji:'🐆',fact:'Ugu degdegta'},
        {so:'Abeeso',en:'Whale',emoji:'🐋',fact:'Ugu weyn badda'},
        {so:'Danaas',en:'Shark',emoji:'🦈',fact:'Xoog badan badda'}
      ]}
    ]
  },
  islamic: {
    title: 'Waxbarashada Islaamka', icon: '🌙',
    sections: [
      { type: 'intro', text: 'Bismillah! Waxaan baranaynaa waxyaabaha Islaamka aasaasiga ah.' },
      { type: 'phrases', label: 'Ereyada Islaamiga', items: [
        {ar:'بِسْمِ اللَّهِ',tr:'Bismillah',so:'Magaca Alle',en:'In the name of Allah',when:'Marka bilaabayso'},
        {ar:'الحمد لله',tr:'Alxamdulillah',so:'Mahad waxaa leh Alle',en:'All praise to Allah',when:'Marka mahad naqayso'},
        {ar:'سبحان الله',tr:'Subhanallah',so:'Alle waa quduus',en:'Glory be to Allah',when:'Marka la yaab aragto'},
        {ar:'الله أكبر',tr:'Allahu Akbar',so:'Alle wuu ka weyn yahay',en:'Allah is Greatest',when:'Salaadda iyo ammaanay'},
        {ar:'إن شاء الله',tr:'Inshallah',so:'Hadduu Alle doono',en:'If Allah wills',when:'Marka qorshaynayso'},
        {ar:'ما شاء الله',tr:'Mashallah',so:'Alle wuxuu doonay',en:'As Allah has willed',when:'Marka wax fiican aragto'}
      ]},
      { type: 'pillars', label: 'Tiimurka Islaamka', items: [
        {num:1,name:'Shahaadada',en:'Declaration of Faith',icon:'☝️'},
        {num:2,name:'Salaadda',en:'Five Daily Prayers',icon:'🕌'},
        {num:3,name:'Zakadda',en:'Obligatory Charity',icon:'💚'},
        {num:4,name:'Sooma',en:'Fasting in Ramadan',icon:'🌙'},
        {num:5,name:'Xajka',en:'Pilgrimage to Makkah',icon:'🕋'}
      ]}
    ]
  }
};

function renderLesson(lessonId) {
  const container = document.getElementById('lesson-content');
  if (!container) return;
  const content = LESSON_CONTENT[lessonId];
  if (!content) { container.innerHTML = '<p>Casharka ma la helin.</p>'; return; }

  let html = `<div style="margin-bottom:32px;"><h2 style="font-family:var(--font-display);font-size:1.8rem;">${content.icon} ${content.title}</h2></div>`;

  content.sections.forEach(sec => {
    if (sec.type === 'intro') {
      html += `<div style="background:var(--blue-light);border-radius:20px;padding:24px;margin-bottom:28px;font-size:1.05rem;font-weight:600;color:var(--blue);">📖 ${sec.text}</div>`;
    }
    if (sec.type === 'grid') {
      html += `<h3 style="font-weight:800;margin-bottom:16px;">${sec.label}</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:14px;margin-bottom:32px;">
          ${sec.items.map(item => `
            <div style="background:var(--surface);border:2px solid var(--border);border-radius:16px;padding:16px;text-align:center;cursor:pointer;transition:all 0.2s;"
              onclick="Quiz.playAudio('audio/${item.letter.toLowerCase()}.mp3')"
              onmouseenter="this.style.borderColor='var(--blue)'" onmouseleave="this.style.borderColor='var(--border)'">
              <div style="font-size:2.4rem;margin-bottom:6px;">${item.emoji}</div>
              <div style="font-family:var(--font-display);font-size:1.4rem;color:var(--blue);">${item.letter}</div>
              <div style="font-size:0.88rem;font-weight:800;">${item.word}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;">${item.meaning}</div>
            </div>
          `).join('')}
        </div>`;
    }
    if (sec.type === 'numgrid') {
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:12px;margin-bottom:32px;">
        ${sec.items.map(item => `
          <div style="background:var(--surface);border:2px solid var(--border);border-radius:16px;padding:16px;text-align:center;cursor:pointer;transition:all 0.2s;"
            onmouseenter="this.style.borderColor='var(--green)'" onmouseleave="this.style.borderColor='var(--border)'">
            <div style="font-family:var(--font-display);font-size:2rem;color:var(--green);">${item.n}</div>
            <div style="font-size:0.85rem;font-weight:800;">${item.so}</div>
          </div>
        `).join('')}
      </div>`;
    }
    if (sec.type === 'colorgrid') {
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:14px;margin-bottom:32px;">
        ${sec.items.map(item => `
          <div style="background:var(--surface);border:2px solid var(--border);border-radius:16px;overflow:hidden;cursor:pointer;transition:all 0.2s;"
            onmouseenter="this.style.transform='scale(1.03)'" onmouseleave="this.style.transform='scale(1)'">
            <div style="height:70px;background:${item.hex};"></div>
            <div style="padding:12px;text-align:center;">
              <div style="font-size:0.95rem;font-weight:800;">${item.so}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);font-weight:600;">${item.en}</div>
            </div>
          </div>
        `).join('')}
      </div>`;
    }
    if (sec.type === 'animalgrid') {
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;margin-bottom:32px;">
        ${sec.items.map(item => `
          <div style="background:var(--surface);border:2px solid var(--border);border-radius:16px;padding:20px;text-align:center;cursor:pointer;transition:all 0.2s;"
            onmouseenter="this.style.borderColor='var(--orange)'" onmouseleave="this.style.borderColor='var(--border)'">
            <div style="font-size:3rem;margin-bottom:8px;">${item.emoji}</div>
            <div style="font-size:0.95rem;font-weight:800;">${item.so}</div>
            <div style="font-size:0.78rem;color:var(--text-muted);font-weight:600;">${item.en}</div>
            <div style="font-size:0.75rem;color:var(--blue);font-weight:700;margin-top:6px;">${item.fact}</div>
          </div>
        `).join('')}
      </div>`;
    }
    if (sec.type === 'phrases') {
      html += `<h3 style="font-weight:800;margin-bottom:16px;">${sec.label}</h3>
        <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:32px;">
          ${sec.items.map(item => `
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:18px;display:flex;align-items:flex-start;gap:14px;">
              <div style="background:var(--purple-light);border-radius:12px;padding:10px;font-size:1.4rem;flex-shrink:0;">🕌</div>
              <div style="flex:1;">
                <div style="font-family:'Arial',sans-serif;font-size:1.3rem;text-align:right;color:var(--purple);margin-bottom:4px;">${item.ar}</div>
                <div style="font-weight:800;margin-bottom:2px;">${item.tr}</div>
                <div style="font-size:0.88rem;color:var(--text-muted);font-weight:600;">${item.en}</div>
                <div style="font-size:0.8rem;color:var(--blue);font-weight:700;margin-top:6px;">📍 ${item.when}</div>
              </div>
            </div>
          `).join('')}
        </div>`;
    }
    if (sec.type === 'pillars') {
      html += `<h3 style="font-weight:800;margin-bottom:16px;">${sec.label}</h3>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:32px;">
          ${sec.items.map(item => `
            <div style="background:var(--surface);border:2px solid var(--border);border-radius:14px;padding:16px;display:flex;align-items:center;gap:14px;">
              <div style="background:var(--purple-light);border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">${item.icon}</div>
              <div>
                <div style="font-weight:800;">${item.num}. ${item.name}</div>
                <div style="font-size:0.82rem;color:var(--text-muted);font-weight:600;">${item.en}</div>
              </div>
            </div>
          `).join('')}
        </div>`;
    }
  });

  container.innerHTML = html;
}

/* ──────────────────────────────────────────
   URL PARAMS
────────────────────────────────────────── */
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/* ──────────────────────────────────────────
   PARENT DASHBOARD
────────────────────────────────────────── */
function renderParentDashboard() {
  const user = Auth.getUser();
  if (!user) return;
  const children = Auth.getChildren(user.id);
  const childList = document.getElementById('parent-child-list');
  if (childList) {
    childList.innerHTML = children.length ? children.map(c => {
      const stats = Progress.getStats(c.id);
      return `
        <div class="child-card" onclick="selectDashboardChild('${c.id}')">
          <div class="child-avatar" style="font-size:2.2rem;">${c.avatar}</div>
          <div>
            <h4>${c.name}</h4>
            <p>Da' ${c.age} • ⭐ ${stats?.stars || 0} xiddig</p>
          </div>
        </div>
      `;
    }).join('') : '<p style="color:var(--text-muted);font-size:0.9rem;text-align:center;padding:20px;">Ilmo ma jirto. Ku dar ilmaha koowaad!</p>';
  }

  if (children.length > 0) {
    const db = DB.get();
    const child = children.find(c => c.id === db.currentChild) || children[0];
    renderChildStats(child);
  }
}

function selectDashboardChild(childId) {
  Auth.setActiveChild(childId);
  const db = DB.get();
  const child = db.children.find(c => c.id === childId);
  if (child) renderChildStats(child);
  document.querySelectorAll('.child-card').forEach(card => {
    card.classList.toggle('active', card.onclick?.toString().includes(childId));
  });
}

function renderChildStats(child) {
  const stats = Progress.getStats(child.id);
  if (!stats) return;
  const panel = document.getElementById('child-stats-panel');
  if (!panel) return;
  const { current, needed, level } = Progress.getXpToNext(stats.xp);
  const BADGE_DEFS = [
    { id: 'first_lesson', name: 'Bilow', icon: '🌱' },
    { id: 'alpha_hero', name: 'Alphabet Hero', icon: '🔤' },
    { id: 'num_master', name: 'Number Master', icon: '🔢' },
    { id: 'color_expert', name: 'Color Expert', icon: '🎨' },
    { id: 'animal_explorer', name: 'Animal Explorer', icon: '🦁' },
    { id: 'young_muslim', name: 'Young Muslim', icon: '🌙' },
    { id: 'star_10', name: '10 Xiddig', icon: '⭐' },
    { id: 'star_50', name: '50 Xiddig', icon: '🌟' }
  ];
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:28px;">
      <div style="width:72px;height:72px;border-radius:50%;background:var(--blue-light);display:flex;align-items:center;justify-content:center;font-size:2.4rem;">${child.avatar}</div>
      <div>
        <h2 style="font-family:var(--font-display);font-size:1.4rem;">${child.name}</h2>
        <div class="level-badge">🏆 Heer ${level}</div>
        <div class="streak-badge ml-6">🔥 ${stats.streak} maalin</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px;">
      ${[
        {label:'XP', val:stats.xp, icon:'⚡', color:'var(--blue)'},
        {label:'Xiddig', val:stats.stars, icon:'⭐', color:'var(--yellow)'},
        {label:'Casharo', val:stats.lessonsCompleted, icon:'📚', color:'var(--green)'},
        {label:'Imtixaan', val:stats.quizzesCompleted, icon:'📝', color:'var(--purple)'}
      ].map(s => `
        <div style="background:var(--bg);border-radius:16px;padding:16px;text-align:center;">
          <div style="font-size:1.4rem;">${s.icon}</div>
          <div style="font-family:var(--font-display);font-size:1.6rem;color:${s.color};">${s.val}</div>
          <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);">${s.label}</div>
        </div>
      `).join('')}
    </div>
    <div style="margin-bottom:28px;">
      <div class="flex-between mb-4"><span style="font-weight:800;">XP Horumar</span><span style="font-size:0.85rem;color:var(--text-muted);">${current}/${needed} XP ➜ Heer ${level+1}</span></div>
      <div class="xp-bar-container"><div class="xp-bar-fill" style="width:${Math.min(100,(current/needed)*100)}%"></div></div>
    </div>
    <div>
      <h3 style="font-weight:800;margin-bottom:16px;">🏅 Biliyaasha</h3>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
        ${BADGE_DEFS.map(b => `
          <div class="achievement-badge ${stats.badges.includes(b.id) ? 'unlocked' : 'locked'}">
            <span class="badge-icon">${b.icon}</span>
            <h4>${b.name}</h4>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* ──────────────────────────────────────────
   INIT
────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initReveal();
  UI.setActiveNav();
  UI.updateAuthState();
  UI.populateChildSelector();
  UI.renderProgressBars();
  initAvatarPicker();

  // Page-specific init
  const page = window.location.pathname.split('/').pop();

  if (page === 'index.html' || page === '') {
    renderLessonCards('home-lessons');
  }

  if (page === 'lessons.html') {
    const lessonId = getParam('lesson');
    if (lessonId) {
      renderLesson(lessonId);
      document.getElementById('lesson-quiz-btn')?.addEventListener('click', () => {
        const lesson = LESSONS.find(l => l.id === lessonId);
        if (lesson) window.location.href = `quiz.html?quiz=${lesson.quizId}`;
      });
    } else {
      renderLessonCards('lessons-grid');
    }
  }

  if (page === 'quiz.html') {
    const quizId = getParam('quiz');
    if (quizId) Quiz.start(quizId);
    else {
      // Show quiz picker
      const container = document.getElementById('quiz-container');
      if (container) {
        container.innerHTML = `
          <h2 style="font-family:var(--font-display);font-size:1.6rem;margin-bottom:24px;">Dooro Imtixaan</h2>
          <div style="display:grid;gap:14px;">
            ${Object.entries(Quiz.QUIZZES).map(([id,q]) => `
              <button class="quiz-option" onclick="Quiz.start('${id}')">
                <span style="font-size:1.6rem;">${q.icon}</span>
                <div style="text-align:left;">
                  <div style="font-weight:800;">${q.title}</div>
                  <div style="font-size:0.8rem;color:var(--text-muted);">${q.questions.length} su'aalood</div>
                </div>
              </button>
            `).join('')}
          </div>
        `;
      }
    }
  }

  if (page === 'rewards.html') {
    renderRewardsPage();
  }

  if (page === 'parents.html') {
    renderParentDashboard();
  }

  if (page === 'curriculum.html') {
    renderLessonCards('curriculum-lessons');
  }

  // Form event listeners
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('register-form')?.addEventListener('submit', handleRegister);
  document.getElementById('add-child-form')?.addEventListener('submit', handleAddChild);

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) Modal.closeAll();
    });
  });
});

/* ──────────────────────────────────────────
   REWARDS PAGE
────────────────────────────────────────── */
function renderRewardsPage() {
  const child = Auth.getActiveChild();
  const container = document.getElementById('rewards-content');
  if (!container) return;

  if (!child) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;">
        <div style="font-size:4rem;margin-bottom:16px;">🌟</div>
        <h2 style="font-family:var(--font-display);font-size:1.6rem;margin-bottom:12px;">Gal si aad abaalmarinta aragto</h2>
        <button class="btn btn-blue" onclick="Modal.open('modal-auth')">Gal Xisaabkaaga</button>
      </div>
    `;
    return;
  }

  const stats = Progress.getStats(child.id);
  const { current, needed, level } = Progress.getXpToNext(stats.xp);
  const LEVELS = ['Bilow', 'Ardayga', 'Xariifka', 'Garaadka', 'BaroKids Boqor'];
  const BADGE_DEFS = [
    { id: 'first_lesson', name: 'Bilow', nameEn: 'First Steps', icon: '🌱', desc: 'Casharka koowaad dhamayso' },
    { id: 'alpha_hero', name: 'Alphabet Hero', nameEn: 'Alphabet Hero', icon: '🔤', desc: '8+ saxda xarfaha' },
    { id: 'num_master', name: 'Number Master', nameEn: 'Number Master', icon: '🔢', desc: '8+ saxda tirooyin' },
    { id: 'color_expert', name: 'Color Expert', nameEn: 'Color Expert', icon: '🎨', desc: '8+ saxda midabada' },
    { id: 'animal_explorer', name: 'Animal Explorer', nameEn: 'Animal Explorer', icon: '🦁', desc: '8+ saxda xayawaanka' },
    { id: 'young_muslim', name: 'Young Muslim', nameEn: 'Young Muslim', icon: '🌙', desc: '8+ saxda Islaamka' },
    { id: 'star_10', name: '10 Xiddig', nameEn: '10 Stars', icon: '⭐', desc: 'Hel 10 xiddig' },
    { id: 'star_50', name: '50 Xiddig', nameEn: '50 Stars', icon: '🌟', desc: 'Hel 50 xiddig' }
  ];

  container.innerHTML = `
    <!-- Hero Stats -->
    <div style="background:var(--grad-hero);border-radius:32px;padding:40px;color:#fff;text-align:center;margin-bottom:32px;">
      <div style="font-size:4rem;margin-bottom:8px;">${child.avatar}</div>
      <h2 style="font-family:var(--font-display);font-size:1.8rem;margin-bottom:4px;">${child.name}</h2>
      <div class="level-badge" style="margin:0 auto 16px;">🏆 ${LEVELS[level-1] || 'Bilow'} – Heer ${level}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:400px;margin:0 auto;">
        ${[{v:stats.stars,l:'Xiddig',i:'⭐'},{v:stats.xp,l:'XP',i:'⚡'},{v:stats.lessonsCompleted,l:'Casharo',i:'📚'}]
          .map(s => `<div><div style="font-family:var(--font-display);font-size:2rem;color:#FCD34D;">${s.v}</div><div style="font-size:0.8rem;opacity:0.8;">${s.i} ${s.l}</div></div>`).join('')}
      </div>
    </div>

    <!-- XP Level Bar -->
    <div class="panel mb-8">
      <div class="panel-header"><h3>⚡ XP Horumar</h3><span class="level-badge">Heer ${level}</span></div>
      <div class="panel-body">
        <div class="flex-between mb-4">
          <span style="font-size:0.88rem;font-weight:700;">${LEVELS[level-1]}</span>
          <span style="font-size:0.88rem;font-weight:700;">${LEVELS[level] || 'Max Level'}</span>
        </div>
        <div class="xp-bar-container"><div class="xp-bar-fill" style="width:${Math.min(100,(current/needed)*100)}%"></div><span class="xp-label">${current}/${needed}</span></div>
      </div>
    </div>

    <!-- Star Types -->
    <div class="panel mb-8">
      <div class="panel-header"><h3>🌟 Noocooda Xiddigaha</h3></div>
      <div class="panel-body">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
          ${[
            {type:'Xiddig Joogsi',icon:'🥉',color:'#CD7F32',min:0,desc:'1–9 xiddig'},
            {type:'Xiddig Lacag',icon:'🥈',color:'#C0C0C0',min:10,desc:'10–49 xiddig'},
            {type:'Xiddig Dahab',icon:'🥇',color:'#FFD700',min:50,desc:'50+ xiddig'}
          ].map(s => `
            <div style="text-align:center;padding:20px;background:var(--bg);border-radius:16px;border:2px solid ${stats.stars >= s.min ? s.color : 'var(--border)'};">
              <div style="font-size:2.6rem;filter:${stats.stars >= s.min ? 'none' : 'grayscale(1)'};">${s.icon}</div>
              <div style="font-weight:800;font-size:0.88rem;margin-top:8px;">${s.type}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${s.desc}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- Badges -->
    <div class="panel mb-8">
      <div class="panel-header"><h3>🏅 Biliyaasha</h3><span style="font-size:0.85rem;font-weight:700;color:var(--text-muted);">${stats.badges.length}/${BADGE_DEFS.length} xaqiisay</span></div>
      <div class="panel-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;">
          ${BADGE_DEFS.map(b => {
            const earned = stats.badges.includes(b.id);
            return `
              <div class="achievement-badge ${earned ? 'unlocked' : 'locked'}">
                <span class="badge-icon" style="font-size:2.4rem;">${b.icon}</span>
                <h4 style="font-size:0.85rem;">${b.name}</h4>
                <p>${b.desc}</p>
                ${earned ? '<div style="font-size:0.72rem;color:var(--green);font-weight:800;margin-top:6px;">✓ Xaqiisay</div>' : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Unit Progress -->
    <div class="panel">
      <div class="panel-header"><h3>📊 Horumar Cutubkasta</h3></div>
      <div class="panel-body">
        ${[
          {id:'q_alphabet', label:'🔤 Xarfaha', colorClass:'pf-blue'},
          {id:'q_numbers',  label:'🔢 Tirooyin', colorClass:'pf-green'},
          {id:'q_colors',   label:'🎨 Midabada',  colorClass:'pf-orange'},
          {id:'q_animals',  label:'🦁 Xayawaanka',colorClass:'pf-purple'},
          {id:'q_islamic',  label:'🌙 Islaamka',  colorClass:'pf-blue'}
        ].map(u => {
          const q = stats.quizzes[u.id];
          const pct = q ? Math.round((q.score/q.total)*100) : 0;
          return `
            <div style="margin-bottom:18px;">
              <div class="progress-label"><span>${u.label}</span><span>${pct}%</span></div>
              <div class="progress-track"><div class="progress-fill ${u.colorClass}" style="width:${pct}%"></div></div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

/* Expose globals needed by inline event handlers */
window.Modal = Modal;
window.Auth = Auth;
window.Quiz = Quiz;
window.Toast = Toast;
window.selectAvatar = selectAvatar;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleAddChild = handleAddChild;
window.renderParentDashboard = renderParentDashboard;
window.selectDashboardChild = selectDashboardChild;
