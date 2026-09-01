require("dotenv").config();
const express = require("express");
const crypto = require("crypto");

const APP_ID = process.env.APP_ID;
const APP_KEY = process.env.APP_KEY;

if (!APP_ID || !APP_KEY) {
  console.error("Missing APP_ID or APP_KEY in .env");
  process.exit(1);
}

const app = express();
app.use(express.static("."));

app.get("/api/token", async (_req, res) => {
  const transactionId = crypto.randomUUID();

  try {
    const response = await fetch("https://auth.hyperverge.co/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appId: APP_ID,
        appKey: APP_KEY,
        expiry: 300,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.result?.token) {
      return res.status(response.status || 500).json(data);
    }

    res.json({
      token: data.result.token,
      transactionId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Open http://localhost:${PORT}/selfie_test.html`);
});
