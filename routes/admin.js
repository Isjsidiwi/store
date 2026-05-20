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
  try {
    const { name, logo_url, description, price, category } = req.body;
    if (!name || !price) return res.redirect('/admin/products?error=1');
    const slug = slugify(name) + '-' + Date.now().toString().slice(-4);
    await db.execute(
      `INSERT INTO products (name, slug, logo_url, description, price, category) VALUES (?, ?, ?, ?, ?, ?)`,
      [name, slug, logo_url || null, description || '', parseInt(price), category || 'umum']
    );
    res.redirect('/admin/products?success=Produk+berhasil+ditambahkan');
  } catch (err) {
    console.error('Add product error:', err.message);
    res.redirect('/admin/products?error=Gagal+menambah+produk');
  }
});

// ── Edit Product Form
router.get('/products/:id/edit', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.execute(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.redirect('/admin/products');
    
    const { rows: variants } = await db.execute(
      `SELECT v.*, (SELECT COUNT(*) FROM keys k WHERE k.variant_id = v.id AND k.is_used = 0) as stock
       FROM product_variants v WHERE v.product_id = ?`,
      [req.params.id]
    );
    
    res.render('admin/product-edit', { product: rows[0], variants, success: req.query.success, error: null });
  } catch (err) {
    console.error('Get edit form error:', err.message);
    res.redirect('/admin/products');
  }
});

// ── Update Product
router.post('/products/:id/edit', requireAdmin, async (req, res) => {
  try {
    const { name, logo_url, description, price, category, is_active } = req.body;
    await db.execute(
      `UPDATE products SET name=?, logo_url=?, description=?, price=?, category=?, is_active=? WHERE id=?`,
      [name, logo_url || null, description || '', parseInt(price), category || 'umum', is_active ? 1 : 0, req.params.id]
    );
    res.redirect(`/admin/products/${req.params.id}/edit?success=Produk+berhasil+diperbarui!`);
  } catch (err) {
    console.error('Update product error:', err.message);
    res.redirect(`/admin/products/${req.params.id}/edit?error=Gagal+memperbarui+produk`);
  }
});

// ── Delete Product
router.post('/products/:id/delete', requireAdmin, async (req, res) => {
  try {
    await db.execute(`UPDATE products SET is_active = 0 WHERE id = ?`, [req.params.id]);
    res.redirect('/admin/products?success=Produk+dinonaktifkan');
  } catch (err) {
    console.error('Delete product error:', err.message);
    res.redirect('/admin/products');
  }
});

// ── Variants Management
router.post('/products/:id/variants/add', requireAdmin, async (req, res) => {
  try {
    const { name, price, original_price } = req.body;
    await db.execute(
      `INSERT INTO product_variants (product_id, name, price, original_price) VALUES (?, ?, ?, ?)`,
      [req.params.id, name, parseInt(price), original_price ? parseInt(original_price) : null]
    );
    res.redirect(`/admin/products/${req.params.id}/edit?success=Varian+ditambahkan`);
  } catch (err) {
    console.error('Add variant error:', err.message);
    res.redirect(`/admin/products/${req.params.id}/edit?error=Gagal+menambah+varian`);
  }
});

router.post('/products/:id/variants/:vid/delete', requireAdmin, async (req, res) => {
  try {
    // Hanya hapus jika tidak ada key yang terikat atau order
    await db.execute(`DELETE FROM product_variants WHERE id = ?`, [req.params.vid]);
    res.redirect(`/admin/products/${req.params.id}/edit?success=Varian+dihapus`);
  } catch (err) {
    console.error('Delete variant error:', err.message);
    res.redirect(`/admin/products/${req.params.id}/edit?error=Gagal+menghapus+varian`);
  }
});

// ── Keys Management
router.get('/products/:id/keys', requireAdmin, async (req, res) => {
  try {
    const { rows: product } = await db.execute(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
    if (!product.length) return res.redirect('/admin/products');
    
    const { rows: variants } = await db.execute(`SELECT * FROM product_variants WHERE product_id = ?`, [req.params.id]);
    
    const { rows: keys } = await db.execute(
      `SELECT k.*, v.name as variant_name FROM keys k 
       LEFT JOIN product_variants v ON v.id = k.variant_id
       WHERE k.product_id = ? ORDER BY k.created_at DESC`,
      [req.params.id]
    );
    res.render('admin/keys', { product: product[0], variants, keys, success: req.query.success });
  } catch (err) {
    console.error('Get keys error:', err.message);
    res.redirect('/admin/products');
  }
});

// ── Add Keys (bulk, satu per baris)
router.post('/products/:id/keys/add', requireAdmin, async (req, res) => {
  try {
    const { keys_text, variant_id } = req.body;
    const lines = keys_text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    for (const line of lines) {
      await db.execute(
        `INSERT INTO keys (product_id, variant_id, key_value) VALUES (?, ?, ?)`,
        [req.params.id, variant_id || null, line]
      );
    }
    res.redirect(`/admin/products/${req.params.id}/keys?success=${lines.length}+key+ditambahkan`);
  } catch (err) {
    console.error('Add keys error:', err.message);
    res.redirect(`/admin/products/${req.params.id}/keys?error=Gagal+menambah+key`);
  }
});

// ── Bulk Delete Keys
router.post('/products/:id/keys/bulk-delete', requireAdmin, async (req, res) => {
  try {
    let { key_ids } = req.body;
    if (!key_ids) return res.redirect(`/admin/products/${req.params.id}/keys`);
    if (!Array.isArray(key_ids)) key_ids = [key_ids];

    const placeholders = key_ids.map(() => '?').join(',');
    // Unlink from orders first
    await db.execute(`UPDATE orders SET key_id = NULL WHERE key_id IN (${placeholders})`, key_ids);
    // Delete keys
    await db.execute(`DELETE FROM keys WHERE id IN (${placeholders})`, key_ids);
    
    res.redirect(`/admin/products/${req.params.id}/keys?success=${key_ids.length}+key+berhasil+dihapus`);
  } catch (err) {
    console.error('Bulk delete keys error:', err.message);
    res.redirect(`/admin/products/${req.params.id}/keys?error=Gagal+menghapus+banyak+key`);
  }
});

// ── Delete Key
router.post('/products/:id/keys/:kid/delete', requireAdmin, async (req, res) => {
  try {
    // Putuskan hubungan key dari order (jika sudah terpakai) agar tidak error foreign key
    await db.execute(`UPDATE orders SET key_id = NULL WHERE key_id = ?`, [req.params.kid]);
    // Hapus key
    await db.execute(`DELETE FROM keys WHERE id = ?`, [req.params.kid]);
    res.redirect(`/admin/products/${req.params.id}/keys?success=Key+berhasil+dihapus`);
  } catch (err) {
    console.error('Delete key error:', err.message);
    res.redirect(`/admin/products/${req.params.id}/keys?error=Gagal+menghapus+key`);
  }
});

// ── Orders
router.get('/orders', requireAdmin, async (req, res) => {
  try {
    const status = req.query.status || '';
    let query = `SELECT o.*, p.name as product_name, k.key_value FROM orders o
                 JOIN products p ON p.id = o.product_id LEFT JOIN keys k ON k.id = o.key_id`;
    const params = [];
    if (status) { query += ` WHERE o.status = ?`; params.push(status); }
    query += ` ORDER BY o.created_at DESC LIMIT 100`;
    const { rows: orders } = await db.execute(query, params);
    res.render('admin/orders', { orders, status, success: req.query.success });
  } catch (err) {
    console.error('Get orders error:', err.message);
    res.redirect('/admin');
  }
});

// ── Bulk Delete Orders
router.post('/orders/bulk-delete', requireAdmin, async (req, res) => {
  try {
    let { order_ids } = req.body;
    if (!order_ids) return res.redirect('/admin/orders');
    if (!Array.isArray(order_ids)) order_ids = [order_ids];

    const placeholders = order_ids.map(() => '?').join(',');
    await db.execute(`DELETE FROM orders WHERE id IN (${placeholders})`, order_ids);
    
    res.redirect(`/admin/orders?success=${order_ids.length}+pesanan+berhasil+dihapus`);
  } catch (err) {
    console.error('Bulk delete orders error:', err.message);
    res.redirect('/admin/orders?error=Gagal+menghapus+banyak+pesanan');
  }
});

// ── Prune Orders (Simpan 50 terbaru)
router.post('/orders/prune', requireAdmin, async (req, res) => {
  try {
    await db.execute(`
      DELETE FROM orders 
      WHERE id NOT IN (
        SELECT id FROM orders ORDER BY created_at DESC LIMIT 50
      )
    `);
    res.redirect('/admin/orders?success=Riwayat+lama+berhasil+dibersihkan');
  } catch (err) {
    console.error('Prune orders error:', err.message);
    res.redirect('/admin/orders?error=Gagal+membersihkan+riwayat');
  }
});

module.exports = router;
