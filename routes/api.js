const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { checkPayment } = require('../services/payment');

// Polling endpoint: cek status pembayaran order
router.get('/order/:id/status', async (req, res) => {
  try {
    const { rows } = await db.execute(
      `SELECT o.*, k.key_value FROM orders o LEFT JOIN keys k ON k.id = o.key_id WHERE o.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.json({ success: false, message: 'Order tidak ditemukan' });

    const order = rows[0];

    // Sudah paid
    if (order.status === 'paid') {
      return res.json({ success: true, status: 'paid', key: order.key_value });
    }

    // Expired
    if (order.status === 'expired' || new Date(order.expired_at) < new Date()) {
      if (order.status !== 'expired') {
        await db.execute(`UPDATE orders SET status = 'expired' WHERE id = ?`, [order.id]);
      }
      return res.json({ success: true, status: 'expired' });
    }

    // Cek via mutasi
    const paid = await checkPayment(order.unique_amount, order.created_at);

    if (paid) {
      // Ambil key tersedia untuk varian ini
      const { rows: keyRows } = await db.execute(
        `SELECT id, key_value FROM keys WHERE variant_id = ? AND is_used = 0 LIMIT 1`,
        [order.variant_id]
      );

      if (!keyRows.length) {
        // Paid tapi kehabisan stok — tandai paid tanpa key, admin harus handle
        await db.execute(
          `UPDATE orders SET status = 'paid', paid_at = datetime('now','localtime') WHERE id = ?`,
          [order.id]
        );
        return res.json({ success: true, status: 'paid_no_stock', message: 'Pembayaran diterima tapi stok habis. Hubungi admin.' });
      }

      const key = keyRows[0];

      // Tandai key sebagai used dan update order
      await db.execute(
        `UPDATE keys SET is_used = 1, order_id = ?, used_at = datetime('now','localtime') WHERE id = ?`,
        [order.id, key.id]
      );
      await db.execute(
        `UPDATE orders SET status = 'paid', paid_at = datetime('now','localtime'), key_id = ? WHERE id = ?`,
        [key.id, order.id]
      );

      return res.json({ success: true, status: 'paid', key: key.key_value });
    }

    return res.json({ success: true, status: 'pending' });
  } catch (err) {
    console.error('Status check error:', err.message);
    res.json({ success: false, message: 'Error cek status' });
  }
});

module.exports = router;
