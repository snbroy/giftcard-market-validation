import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';

dotenv.config();

const app = express();

// -----------------------------
// Middlewares
// -----------------------------
app.use(helmet()); // Security headers
app.use(express.json());

// Shopify App Proxy only calls GET, and Shopify expects query parameters
app.use(cors({
  origin: true, // allow requests from Shopify domain
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// -----------------------------
// Environment checks
// -----------------------------
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';
const STORE_DOMAIN = process.env.STORE_DOMAIN;

if (!SHOPIFY_ADMIN_TOKEN || !STORE_DOMAIN) {
  console.error('ERROR: Missing required environment variables.');
  process.exit(1);
}

// -----------------------------
// App Proxy Endpoint
// -----------------------------
/**
 * GET /apps/validate-gift-card?productId=<PRODUCT_ID>
 * Returns the allowed_market metafield of a product.
 */
app.get('/apps/validate-gift-card', async (req, res) => {
  try {
    const productId = req.body.productId;
    if (!productId) {
      return res.status(400).json({ error: 'Missing productId query parameter' });
    }

    // Ensure GID encoding is safe
    const encodedProductId = encodeURIComponent(productId);

    const url = `${STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${encodedProductId}/metafields.json`;
    console.log('Fetching metafields from URL:', url);

    const metafieldsRes = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!metafieldsRes.ok) {
      const text = await metafieldsRes.text();
      console.error('Shopify Admin API error:', text);
      return res.status(metafieldsRes.status).json({ error: 'Failed to fetch metafields' });
    }

    const metafieldsData = await metafieldsRes.json();

    const allowedMarketField = metafieldsData.metafields?.find(
      (m) => m.namespace === 'custom' && m.key === 'allow_market'
    );

    if (!allowedMarketField) {
      console.warn(`No allow_market metafield found for product ${productId}`);
      return res.json({ allowedMarket: 'US' }); // default fallback
    }

    console.log('Found allow_market metafield:', allowedMarketField.value);
    res.json({ allowedMarket: allowedMarketField.value });

  } catch (err) {
    console.error('Unexpected error in /validate-gift-card:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// -----------------------------
// Start Server
// -----------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`App Proxy running on port ${PORT}`));
