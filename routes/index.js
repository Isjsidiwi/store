const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { createQRIS, checkPayment, generateUniqueSuffix } = require('../services/payment');
const { v4: uuidv4 } = require('uuid');

// ── Beranda
router.get('/', async (req, res) => {
  try {
    const { rows: products } = await db.execute(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM keys k WHERE k.product_id = p.id AND k.is_used = 0) as stock,
        (SELECT MIN(price) FROM product_variants pv WHERE pv.product_id = p.id) as min_price,
        (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id) as variant_count
      FROM products p WHERE p.is_active = 1 ORDER BY p.created_at DESC
    `);

    const { rows: categories } = await db.execute(
      `SELECT DISTINCT category FROM products WHERE is_active = 1`
    );

    res.render('index', { products, categories });
  } catch (err) {
    console.error(err);
    res.render('index', { products: [], categories: [] });
  }
});

// ── Detail Produk
router.get('/produk/:slug', async (req, res) => {
  try {
    const { rows } = await db.execute(
      `SELECT p.* FROM products p WHERE p.slug = ? AND p.is_active = 1`,
      [req.params.slug]
    );
    if (!rows.length) return res.redirect('/');
    const product = rows[0];

    const { rows: variants } = await db.execute(
      `SELECT v.*, (SELECT COUNT(*) FROM keys k WHERE k.variant_id = v.id AND k.is_used = 0) as stock
       FROM product_variants v WHERE v.product_id = ?`,
      [product.id]
    );

    // Hitung total stok dari semua varian
    product.stock = variants.reduce((sum, v) => sum + v.stock, 0);

    res.render('product', { product, variants });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// ── Checkout: Form
router.get('/checkout/:slug/:variantId', async (req, res) => {
  try {
    const { rows: pRows } = await db.execute(
      `SELECT p.* FROM products p WHERE p.slug = ? AND p.is_active = 1`,
      [req.params.slug]
    );
    if (!pRows.length) return res.redirect('/');
    const product = pRows[0];

    const { rows: vRows } = await db.execute(
      `SELECT v.*, (SELECT COUNT(*) FROM keys k WHERE k.variant_id = v.id AND k.is_used = 0) as stock
       FROM product_variants v WHERE v.id = ? AND v.product_id = ?`,
      [req.params.variantId, product.id]
    );
    if (!vRows.length) return res.redirect('/produk/' + req.params.slug);
    const variant = vRows[0];

    if (variant.stock < 1) return res.redirect('/produk/' + req.params.slug);
    res.render('checkout', { product, variant, error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// ── Checkout: Submit → Buat Order + QRIS
router.post('/checkout/:slug/:variantId', async (req, res) => {
  try {
    const { customer_name, customer_email } = req.body;
    
    const { rows: pRows } = await db.execute(
      `SELECT p.* FROM products p WHERE p.slug = ? AND p.is_active = 1`,
      [req.params.slug]
    );
    if (!pRows.length) return res.redirect('/');
    const product = pRows[0];

    const { rows: vRows } = await db.execute(
      `SELECT v.*, (SELECT COUNT(*) FROM keys k WHERE k.variant_id = v.id AND k.is_used = 0) as stock
       FROM product_variants v WHERE v.id = ? AND v.product_id = ?`,
      [req.params.variantId, product.id]
    );
    if (!vRows.length) return res.redirect('/produk/' + req.params.slug);
    const variant = vRows[0];

    if (!customer_name || !customer_email) {
      return res.render('checkout', { product, variant, error: 'Nama dan email wajib diisi.' });
    }

    if (variant.stock < 1) return res.redirect('/produk/' + req.params.slug);

    // Unique amount untuk verifikasi pembayaran
    const suffix = generateUniqueSuffix();
    const uniqueAmount = variant.price + suffix;
    const orderId = uuidv4();

    // Buat QRIS
    let qrisId = null, qrisUrl = null;
    try {
      const qrisRes = await createQRIS(uniqueAmount);
      if (qrisRes?.qris_ajaib?.success) {
        qrisId = qrisRes.qris_ajaib.results.id;
        qrisUrl = qrisRes.qris_ajaib.results.qrcode_url;
      }
    } catch (e) {
      console.error('QRIS create error:', e.message);
    }

    // Expired 30 menit dari sekarang
    const expiredAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await db.execute(
      `INSERT INTO orders (id, product_id, variant_id, customer_name, customer_email, amount, unique_amount, unique_suffix, qris_id, qris_url, status, expired_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [orderId, product.id, variant.id, customer_name, customer_email, variant.price, uniqueAmount, suffix, qrisId, qrisUrl, expiredAt]
    );

    res.redirect('/order/' + orderId);
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// ── Halaman Status Order
router.get('/order/:id', async (req, res) => {
  try {
    const { rows } = await db.execute(
      `SELECT o.*, p.name as product_name, p.logo_url, p.slug,
              pv.name as variant_name,
              k.key_value
       FROM orders o
       JOIN products p ON p.id = o.product_id
       JOIN product_variants pv ON pv.id = o.variant_id
       LEFT JOIN keys k ON k.id = o.key_id
       WHERE o.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.redirect('/');
    const order = rows[0];
    res.render('order', { order });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

module.exports = router;
