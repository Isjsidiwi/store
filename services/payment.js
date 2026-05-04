const axios = require('axios');
const qs = require('qs');
require('dotenv').config();

const PROXY_CONFIG = {
  url: 'https://lucky.full.diskon.cloud/proxy.php',
};

const OK_CONFIG = {
  auth_username: process.env.OK_AUTH_USERNAME || 'Shannz',
  auth_token: process.env.OK_AUTH_TOKEN || '2460961:XLEzPCV857MhmBrnQwFjdtkUvi10uslJ',
  phone_uuid: process.env.OK_PHONE_UUID || 'eaAxVAUUR3mL01mAZA6OY-',
  app_reg_id: process.env.OK_APP_REG_ID || 'eaAxVAUUR3mL01mAZA6OY-:APA91bHLfygS2CD8pLwfhR3NGVCS7-HGQJEpRgkohRTyJdzRkszvXSMyigO3Dq4kYRnMdf6p5jVIUyBkcf7XqN2LUMQs-JhGGdvH-ZPvSqEl58ikoD0LjAQ',
  account_id: process.env.OK_ACCOUNT_ID || '2460961',
  phone_model: '2409BRN2CY',
  phone_android_version: '16',
  app_version_code: '260204',
  app_version_name: '26.02.04',
};

// Helper: Buat request melalui proxy
async function makeProxyRequest(targetUrl, method, headers, data) {
  const proxyHeaders = {
    ...headers,
    'x-proxy-target-url': targetUrl,
  };

  try {
    return await axios.request({
      method: method,
      url: PROXY_CONFIG.url,
      headers: proxyHeaders,
      data: data,
    });
  } catch (error) {
    console.error('Proxy request error:', {
      targetUrl,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
      headers: error.config?.headers,
    });
    throw error;
  }
}

// Generate unique amount suffix (001–999) agar tiap order punya jumlah unik
function generateUniqueSuffix() {
  return Math.floor(Math.random() * 999) + 1;
}

function getTimestamp() {
  return Date.now().toString();
}

// Generate fake signature (format sama seperti contoh)
function generateSignature() {
  const chars = '0123456789abcdef';
  let sig = '';
  for (let i = 0; i < 128; i++) sig += chars[Math.floor(Math.random() * chars.length)];
  return sig;
}

async function createQRIS(amount) {
  const timestamp = getTimestamp();
  const data = qs.stringify({
    'requests[qris_ajaib][amount]': amount.toString(),
    'request_time': timestamp,
    'app_reg_id': OK_CONFIG.app_reg_id,
    'phone_android_version': OK_CONFIG.phone_android_version,
    'app_version_code': OK_CONFIG.app_version_code,
    'phone_uuid': OK_CONFIG.phone_uuid,
    'auth_username': OK_CONFIG.auth_username,
    'auth_token': OK_CONFIG.auth_token,
    'app_version_name': OK_CONFIG.app_version_name,
    'ui_mode': 'light',
    'phone_model': OK_CONFIG.phone_model,
  });

  const headers = {
    'User-Agent': 'okhttp/5.3.2',
    'Accept-Encoding': 'gzip',
    'Content-Type': 'application/x-www-form-urlencoded',
    'signature': generateSignature(),
    'timestamp': timestamp,
  };

  const response = await makeProxyRequest(
    'https://app.orderkuota.com/api/v2/get',
    'POST',
    headers,
    data
  );

  return response.data;
}

// Ambil mutasi QRIS (transaksi kredit/masuk)
async function getMutations(page = 1) {
  const timestamp = getTimestamp();
  const data = qs.stringify({
    'app_reg_id': OK_CONFIG.app_reg_id,
    'phone_uuid': OK_CONFIG.phone_uuid,
    'requests[qris_history][jenis]': 'kredit',
    'phone_model': OK_CONFIG.phone_model,
    'requests[qris_history][keterangan]': '',
    'requests[qris_history][jumlah]': '',
    'request_time': timestamp,
    'phone_android_version': OK_CONFIG.phone_android_version,
    'app_version_code': OK_CONFIG.app_version_code,
    'auth_username': OK_CONFIG.auth_username,
    'requests[qris_history][page]': page.toString(),
    'auth_token': OK_CONFIG.auth_token,
    'app_version_name': OK_CONFIG.app_version_name,
    'ui_mode': 'light',
    'requests[qris_history][dari_tanggal]': '',
    'requests[0]': 'account',
    'requests[qris_history][ke_tanggal]': '',
  });

  const headers = {
    'User-Agent': 'okhttp/5.3.2',
    'Accept-Encoding': 'gzip',
    'Content-Type': 'application/x-www-form-urlencoded',
    'signature': generateSignature(),
    'timestamp': timestamp,
  };

  const response = await makeProxyRequest(
    `https://app.orderkuota.com/api/v2/qris/mutasi/${OK_CONFIG.account_id}`,
    'POST',
    headers,
    data
  );

  return response.data;
}

// Parse angka dari format "20.000" → 20000
function parseAmount(str) {
  if (!str) return 0;
  return parseInt(str.toString().replace(/\./g, ''), 10);
}

// Parse tanggal format "19/04/2026 15:02:53" → Date
function parseTanggal(str) {
  const [datePart, timePart] = str.split(' ');
  const [d, m, y] = datePart.split('/');
  return new Date(`${y}-${m}-${d}T${timePart}`);
}

// Cek apakah ada transaksi masuk sesuai unique_amount setelah created_at
async function checkPayment(uniqueAmount, createdAt) {
  try {
    const createdDate = new Date(createdAt);
    const mutRes = await getMutations(1);

    if (!mutRes?.qris_history?.success) return false;

    const results = mutRes.qris_history.results || [];

    for (const trx of results) {
      const trxAmount = parseAmount(trx.kredit);
      const trxDate = parseTanggal(trx.tanggal);

      if (trxAmount === uniqueAmount && trxDate >= createdDate && trx.status === 'IN') {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('checkPayment error:', err.message);
    return false;
  }
}

module.exports = { createQRIS, getMutations, checkPayment, generateUniqueSuffix };
