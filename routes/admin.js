const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { requireAdmin } = require('../middleware/auth');

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ── Login
router.get('/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'Username atau password salah.' });
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ── Dashboard
router.get('/', requireAdmin, async (req, res) => {
  const { rows: stats } = await db.execute(`
    SELECT
      (SELECT COUNT(*) FROM products WHERE is_active=1) as total_products,
      (SELECT COUNT(*) FROM keys WHERE is_used=0) as total_stock,
      (SELECT COUNT(*) FROM orders WHERE status='paid') as total_paid,
      (SELECT COUNT(*) FROM orders WHERE status='pending') as total_pending
  `);
  const { rows: recentOrders } = await db.execute(`
    SELECT o.*, p.name as product_name FROM orders o
    JOIN products p ON p.id = o.product_id
    ORDER BY o.created_at DESC LIMIT 10
  `);
  res.render('admin/dashboard', { stats: stats[0], recentOrders });
});

// ── Products List
router.get('/products', requireAdmin, async (req, res) => {
  const { rows: products } = await db.execute(`
    SELECT p.*, (SELECT COUNT(*) FROM keys k WHERE k.product_id = p.id AND k.is_used = 0) as stock
    FROM products p ORDER BY p.created_at DESC
  `);
  res.render('admin/products', { products, success: req.query.success, error: null });
});

// ── Add Product
router.post('/products/add', requireAdmin, async (req, res) => {
  const { name, logo_url, description, price, category } = req.body;
  if (!name || !price) return res.redirect('/admin/products?error=1');
  const slug = slugify(name) + '-' + Date.now().toString().slice(-4);
  await db.execute(
    `INSERT INTO products (name, slug, logo_url, description, price, category) VALUES (?, ?, ?, ?, ?, ?)`,
    [name, slug, logo_url || null, description || '', parseInt(price), category || 'umum']
  );
  res.redirect('/admin/products?success=Produk+berhasil+ditambahkan');
});

// ── Edit Product Form
router.get('/products/:id/edit', requireAdmin, async (req, res) => {
  const { rows } = await db.execute(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
  if (!rows.length) return res.redirect('/admin/products');
  res.render('admin/product-edit', { product: rows[0], success: null, error: null });
});

// ── Update Product
router.post('/products/:id/edit', requireAdmin, async (req, res) => {
  const { name, logo_url, description, price, category, is_active } = req.body;
  await db.execute(
    `UPDATE products SET name=?, logo_url=?, description=?, price=?, category=?, is_active=? WHERE id=?`,
    [name, logo_url || null, description || '', parseInt(price), category || 'umum', is_active ? 1 : 0, req.params.id]
  );
  const { rows } = await db.execute(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
  res.render('admin/product-edit', { product: rows[0], success: 'Produk berhasil diperbarui!', error: null });
});

// ── Delete Product
router.post('/products/:id/delete', requireAdmin, async (req, res) => {
  await db.execute(`UPDATE products SET is_active = 0 WHERE id = ?`, [req.params.id]);
  res.redirect('/admin/products?success=Produk+dinonaktifkan');
});

// ── Keys Management
router.get('/products/:id/keys', requireAdmin, async (req, res) => {
  const { rows: product } = await db.execute(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
  if (!product.length) return res.redirect('/admin/products');
  const { rows: keys } = await db.execute(
    `SELECT * FROM keys WHERE product_id = ? ORDER BY created_at DESC`,
    [req.params.id]
  );
  res.render('admin/keys', { product: product[0], keys, success: req.query.success });
});

// ── Add Keys (bulk, satu per baris)
router.post('/products/:id/keys/add', requireAdmin, async (req, res) => {
  const { keys_text } = req.body;
  const lines = keys_text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  for (const line of lines) {
    await db.execute(
      `INSERT INTO keys (product_id, key_value) VALUES (?, ?)`,
      [req.params.id, line]
    );
  }
  res.redirect(`/admin/products/${req.params.id}/keys?success=${lines.length}+key+ditambahkan`);
});

// ── Delete Key
router.post('/products/:id/keys/:kid/delete', requireAdmin, async (req, res) => {
  await db.execute(`DELETE FROM keys WHERE id = ? AND is_used = 0`, [req.params.kid]);
  res.redirect(`/admin/products/${req.params.id}/keys?success=Key+dihapus`);
});

// ── Orders
router.get('/orders', requireAdmin, async (req, res) => {
  const status = req.query.status || '';
  let query = `SELECT o.*, p.name as product_name, k.key_value FROM orders o
               JOIN products p ON p.id = o.product_id LEFT JOIN keys k ON k.id = o.key_id`;
  const params = [];
  if (status) { query += ` WHERE o.status = ?`; params.push(status); }
  query += ` ORDER BY o.created_at DESC LIMIT 100`;
  const { rows: orders } = await db.execute(query, params);
  res.render('admin/orders', { orders, status });
});

module.exports = router;
