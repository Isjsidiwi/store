require('dotenv').config();
const express = require('express');
const session = require('cookie-session');
const path = require('path');
const { initDB } = require('./db');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  name: 'suki_session',
  keys: [process.env.SESSION_SECRET || 'rajasuki-secret-key-123'],
  maxAge: 24 * 60 * 60 * 1000 // 24 jam
}));

// Inject store info ke semua views
app.use((req, res, next) => {
  res.locals.storeName = process.env.STORE_NAME || 'DigiStore';
  res.locals.storeTagline = process.env.STORE_TAGLINE || 'Toko Digital Terpercaya';
  res.locals.isAdmin = req.session.isAdmin || false;
  next();
});

app.use('/', require('./routes/index'));
app.use('/admin', require('./routes/admin'));
app.use('/api', require('./routes/api'));

const PORT = process.env.PORT || 3000;

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to init DB:', err);
  process.exit(1);
});
