const DiscordStrategy = require('passport-discord').Strategy;
const User = require('../models/User');

module.exports = (passport) => {
  passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL || 'http://localhost:3000/auth/discord/callback',
    scope: ['identify', 'email']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ discordId: profile.id });

      if (!user) {
        user = await User.create({
          discordId: profile.id,
          username: profile.username,
          discriminator: profile.discriminator || '0',
          avatar: profile.avatar
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(profile.discriminator || 0) % 5}.png`,
          email: profile.email || null,
          nickname: profile.username,
          coins: 0,
          xp: 0,
          level: 1,
          role: 'user'
        });
        console.log(`✨ New user created: ${user.username}`);
      } else {
        // Atualiza avatar e username se mudou
        user.username = profile.username;
        user.avatar = profile.avatar
          ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
          : user.avatar;
        await user.save();
      }

      return done(null, user);
    } catch (err) {
      console.error('Passport Discord error:', err);
      return done(err, null);
    }
  }));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};
