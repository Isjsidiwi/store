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

router.post('/8bp', (req, res) => {
  console.log("Body:", JSON.stringify(req.body, null, 2));
  console.log("Headers:", req.headers);

  res.setHeader('Content-Type', 'application/json; charset=UTF-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0, no-cache');

  res.json({
    "data": "59f3a944c19775a22079378019820143eb431254b912e278842367ea6a4c5ce1a9d6f3a569c1e99aef074fd1f588e30f341516a8ca006b110e7002535374a6e136ccc00842a114579c5a7f9c8537d87b7ed84a35b653ee08e5dd3018a4cade669eadce09e3f11de1a0fc1c4270e2e05a9112b331920bda4d3d0de1915f2143f66aee2216ff7d7a9f06eeb971bc41089c09ae8920c7daa4cf",
    "sig": "9273719cfd063b446df735c8cc6913bf0bcf84f9bc037eedd168568dc66d7fdb71ce9f648ed8bf5f9cd868351cda433c44628b4744f97714f16bd81fd834eb7043fb5d60b5c115be37d44afcb697182b02e32fc27614914edbdb61ea9fdfb36d08ded09cdde905f4b34e99bff6f74833e1da3b3734a43159ce514503dd4e515dcfa93c26a379a1f2eeaaec530458fc6ea8735152e68b6528f50a9791a31df50a3cb9a6ee68be8660e3affe56b8f31d4baa9914caa25f7ef917fe4de274c0e9f088e59e879d0de42773d06e8312d2831bf43982e2b79da241ea18e24b1d22c5243684a3230d8479fc9b6608062badff9ad985f54d60af7323c5b251a1d138fc04",
    "tag": "b3724d8710147a18281e739ef22bc7a3"
  });
});

module.exports = router;
