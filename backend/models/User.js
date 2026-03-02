const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  discordId:     { type: String, required: true, unique: true },
  username:      { type: String, required: true },
  discriminator: { type: String, default: '0' },
  nickname:      { type: String },
  avatar:        { type: String },
  email:         { type: String },
  coins:         { type: Number, default: 0 },
  coinsDaily:    { type: Number, default: 0 },
  coinsWeekly:   { type: Number, default: 0 },
  coinsMonthly:  { type: Number, default: 0 },
  xp:            { type: Number, default: 0 },
  level:         { type: Number, default: 1 },
  role:          { type: String, enum: ['user', 'admin'], default: 'user' },
  badges:        [{ type: String }],
  createdAt:     { type: Date, default: Date.now }
});

// ─── Método para calcular level ──────────────────────────────────
userSchema.methods.calculateLevel = function () {
  let level = 1;
  let xpRequired = 100;
  let totalXP = this.xp;

  while (totalXP >= xpRequired) {
    totalXP -= xpRequired;
    level++;
    xpRequired = 100 * level;
  }

  this.level = level;
  return level;
};

// ─── Método para adicionar XP e moedas ──────────────────────────
userSchema.methods.addReward = async function (coins, xp = 0) {
  this.coins += coins;
  this.coinsDaily += coins;
  this.coinsWeekly += coins;
  this.coinsMonthly += coins;
  this.xp += xp;
  this.calculateLevel();
  await this.save();

  // Verifica conquistas
  await this.checkAchievements();
};

// ─── Verificar badges/conquistas ────────────────────────────────
userSchema.methods.checkAchievements = async function () {
  const UserQuest = mongoose.model('UserQuest');
  const completedCount = await UserQuest.countDocuments({
    userId: this._id,
    status: 'completed'
  });

  const badgeMap = [
    { count: 1,   badge: 'first_quest' },
    { count: 10,  badge: 'bronze' },
    { count: 50,  badge: 'silver' },
    { count: 100, badge: 'gold' },
    { count: 250, badge: 'diamond' }
  ];

  let updated = false;
  for (const { count, badge } of badgeMap) {
    if (completedCount >= count && !this.badges.includes(badge)) {
      this.badges.push(badge);
      updated = true;
    }
  }

  if (updated) await this.save();
};

module.exports = mongoose.model('User', userSchema);
