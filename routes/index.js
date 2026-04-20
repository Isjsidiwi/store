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
        (SELECT COUNT(*) FROM keys k WHERE k.product_id = p.id AND k.is_used = 0) as stock
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
      `SELECT p.*, (SELECT COUNT(*) FROM keys k WHERE k.product_id = p.id AND k.is_used = 0) as stock
       FROM products p WHERE p.slug = ? AND p.is_active = 1`,
      [req.params.slug]
    );
    if (!rows.length) return res.redirect('/');
    const product = rows[0];
    res.render('product', { product });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// ── Checkout: Form
router.get('/checkout/:slug', async (req, res) => {
  try {
    const { rows } = await db.execute(
      `SELECT p.*, (SELECT COUNT(*) FROM keys k WHERE k.product_id = p.id AND k.is_used = 0) as stock
       FROM products p WHERE p.slug = ? AND p.is_active = 1`,
      [req.params.slug]
    );
    if (!rows.length) return res.redirect('/');
    const product = rows[0];
    if (product.stock < 1) return res.redirect('/produk/' + req.params.slug);
    res.render('checkout', { product, error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// ── Checkout: Submit → Buat Order + QRIS
router.post('/checkout/:slug', async (req, res) => {
  try {
    const { customer_name, customer_email } = req.body;
    if (!customer_name || !customer_email) {
      const { rows } = await db.execute(
        `SELECT p.*, (SELECT COUNT(*) FROM keys k WHERE k.product_id = p.id AND k.is_used = 0) as stock
         FROM products p WHERE p.slug = ?`, [req.params.slug]
      );
      return res.render('checkout', { product: rows[0], error: 'Nama dan email wajib diisi.' });
    }

    const { rows: pRows } = await db.execute(
      `SELECT p.*, (SELECT COUNT(*) FROM keys k WHERE k.product_id = p.id AND k.is_used = 0) as stock
       FROM products p WHERE p.slug = ? AND p.is_active = 1`,
      [req.params.slug]
    );
    if (!pRows.length || pRows[0].stock < 1) return res.redirect('/');
    const product = pRows[0];

    // Unique amount untuk verifikasi pembayaran
    const suffix = generateUniqueSuffix();
    const uniqueAmount = product.price + suffix;
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
      `INSERT INTO orders (id, product_id, customer_name, customer_email, amount, unique_amount, unique_suffix, qris_id, qris_url, status, expired_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [orderId, product.id, customer_name, customer_email, product.price, uniqueAmount, suffix, qrisId, qrisUrl, expiredAt]
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
      `SELECT o.*, p.name as product_name, p.price, p.logo_url, p.slug,
              k.key_value
       FROM orders o
       JOIN products p ON p.id = o.product_id
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
