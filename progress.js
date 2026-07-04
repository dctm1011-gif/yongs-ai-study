class UserProgress {
  constructor() {
    this.storageKey = 'userProgress';
    this.loadProgress();
  }

  loadProgress() {
    const stored = localStorage.getItem(this.storageKey);
    this.data = stored ? JSON.parse(stored) : this.getDefaultData();
  }

  getDefaultData() {
    return {
      total_exp: 0,
      level: 1,
      current_exp: 0,
      exp_to_next_level: 200,
      badges: [],
      streak: 0,
      last_active_date: new Date().toISOString().slice(0, 10),
      weekly_exp: 0,
      completed: {
        english_words: [],
        toefl_sections: [],
        papers_read: []
      }
    };
  }

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.data));
  }

  addExp(type, amount = 1) {
    let exp = 0;
    switch(type) {
      case 'english_word': exp = 5 * amount; break;
      case 'toefl_section': exp = 10 * amount; break;
      case 'paper': exp = 15 * amount; break;
      default: exp = amount;
    }

    this.data.total_exp += exp;
    this.data.current_exp += exp;
    this.data.weekly_exp += exp;

    this.checkLevelUp();
    this.checkBadges();
    this.checkStreak();
    this.save();

    return { exp, level: this.data.level, badges_earned: [] };
  }

  checkLevelUp() {
    const levels = [
      { min: 0, max: 200 },
      { min: 200, max: 500 },
      { min: 500, max: 900 },
      { min: 900, max: 1400 },
      { min: 1400, max: 2000 },
      { min: 2000, max: 2700 },
      { min: 2700, max: 3500 },
      { min: 3500, max: 4400 },
      { min: 4400, max: 5500 },
      { min: 5500, max: 99999 }
    ];

    for (let i = 0; i < levels.length; i++) {
      if (this.data.total_exp >= levels[i].min && this.data.total_exp < levels[i].max) {
        this.data.level = i + 1;
        this.data.current_exp = this.data.total_exp - levels[i].min;
        this.data.exp_to_next_level = levels[i].max - levels[i].min;
        break;
      }
    }
  }

  checkBadges() {
    const newBadges = [];

    if (this.data.total_exp >= 10 && !this.hasBadge('starter'))
      newBadges.push({ id: 'starter', name: '초보자', emoji: '🌱', exp: 10 });

    if (this.data.completed.english_words.length >= 30 && !this.hasBadge('english_master'))
      newBadges.push({ id: 'english_master', name: '영어 전문가', emoji: '🌐', exp: 150 });

    if (this.data.completed.toefl_sections.length >= 20 && !this.hasBadge('toefl_master'))
      newBadges.push({ id: 'toefl_master', name: 'TOEFL 전사', emoji: '🎓', exp: 200 });

    if (this.data.total_exp >= 1000 && !this.hasBadge('learner_angel'))
      newBadges.push({ id: 'learner_angel', name: '학습 천사', emoji: '📈', exp: 500 });

    if (this.data.streak >= 7 && !this.hasBadge('week_champion'))
      newBadges.push({ id: 'week_champion', name: '7일 챔피언', emoji: '🔥', exp: 100 });

    if (this.data.streak >= 30 && !this.hasBadge('month_warrior'))
      newBadges.push({ id: 'month_warrior', name: '한 달 전사', emoji: '⚔️', exp: 300 });

    newBadges.forEach(badge => {
      this.data.badges.push(badge);
      this.data.total_exp += badge.exp;
    });

    this.checkLevelUp();
  }

  checkStreak() {
    const today = new Date().toISOString().slice(0, 10);
    const lastDate = this.data.last_active_date;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    if (lastDate === today) return;

    if (lastDate === yesterdayStr) {
      this.data.streak++;
    } else {
      this.data.streak = 1;
    }

    this.data.last_active_date = today;
  }

  hasBadge(badgeId) {
    return this.data.badges.some(b => b.id === badgeId);
  }

  markCompleted(type, id) {
    if (type === 'english_word') {
      if (!this.data.completed.english_words.includes(id)) {
        this.data.completed.english_words.push(id);
        this.addExp('english_word');
      }
    } else if (type === 'toefl_section') {
      if (!this.data.completed.toefl_sections.includes(id)) {
        this.data.completed.toefl_sections.push(id);
        this.addExp('toefl_section');
      }
    } else if (type === 'paper') {
      if (!this.data.completed.papers_read.includes(id)) {
        this.data.completed.papers_read.push(id);
        this.addExp('paper');
      }
    }
  }

  getProgress() {
    const percentage = Math.round((this.data.current_exp / this.data.exp_to_next_level) * 100);
    return {
      level: this.data.level,
      current_exp: this.data.current_exp,
      total_exp: this.data.total_exp,
      exp_to_next_level: this.data.exp_to_next_level,
      percentage,
      badges: this.data.badges,
      streak: this.data.streak
    };
  }
}

// Initialize globally
window.userProgress = new UserProgress();
