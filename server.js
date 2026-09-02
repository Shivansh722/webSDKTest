require("dotenv").config();
const express = require("express");
const crypto = require("crypto");

const APP_ID = process.env.APP_ID;
const APP_KEY = process.env.APP_KEY;
const WORKFLOW_ID = "selfie";

if (!APP_ID || !APP_KEY) {
  console.error("Missing APP_ID or APP_KEY in .env");
  process.exit(1);
}

function decodeJwt(token) {
  try {
    const raw = token.replace(/^Bearer\s+/, "");
    return JSON.parse(Buffer.from(raw.split(".")[1], "base64url").toString());
  } catch {
    return null;
  }
}

async function generateV2Token(transactionId) {
  const response = await fetch("https://ind-state.idv.hyperverge.co/v2/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appId: APP_ID,
      appKey: APP_KEY,
      expiry: 300,
      transactionId,
      workflowId: WORKFLOW_ID,
      authenticateOnResume: "no",
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.result?.authToken) throw new Error(JSON.stringify(data));
  return { token: data.result.authToken, transactionId, workflowId: WORKFLOW_ID };
}

async function generateAccessToken() {
  const response = await fetch("https://auth.hyperverge.co/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId: APP_ID, appKey: APP_KEY, expiry: 300 }),
  });
  const data = await response.json();
  if (!response.ok || !data.result?.token) throw new Error(JSON.stringify(data));
  const transactionId = crypto.randomUUID();
  return { token: data.result.token, transactionId, workflowId: WORKFLOW_ID, type: "access" };
}

const app = express();
app.use(express.static("."));

app.get("/api/token", async (_req, res) => {
  try {
    const transactionId = `test-hv-${Date.now().toString().slice(-2)}`;
    const result = await generateV2Token(transactionId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Returns pre-built test scenarios for debug page
app.get("/api/debug/scenarios", async (_req, res) => {
  try {
    const txnMatch = `test-hv-${Date.now().toString().slice(-2)}`;
    const txnMismatch = `${txnMatch}-WRONG`;
    const v2Match = await generateV2Token(txnMatch);
    const v2Mismatch = await generateV2Token(txnMatch); // token for txnMatch, we'll pass wrong id
    const access = await generateAccessToken();

    const v2Payload = decodeJwt(v2Match.token);
    const accessPayload = decodeJwt(access.token);

    res.json({
      scenarios: [
        {
          id: "A",
          name: "Backend v2 + matching txn (WORKING baseline)",
          sdkVersion: "11.4.0",
          init: "option1",
          token: v2Match.token,
          workflowId: WORKFLOW_ID,
          transactionId: txnMatch,
          expected: "should work",
          checks: {
            tokenType: v2Payload?.workflowId ? "v2" : "unknown",
            jwtTxn: v2Payload?.transactionId,
            passedTxn: txnMatch,
            txnMatch: v2Payload?.transactionId === txnMatch,
          },
        },
        {
          id: "B",
          name: "Backend v2 + MISMATCH txn (should fail: invalid token)",
          sdkVersion: "11.4.0",
          init: "option1",
          token: v2Mismatch.token,
          workflowId: WORKFLOW_ID,
          transactionId: txnMismatch,
          expected: "invalid token",
          checks: {
            tokenType: "v2",
            jwtTxn: decodeJwt(v2Mismatch.token)?.transactionId,
            passedTxn: txnMismatch,
            txnMatch: false,
          },
        },
        {
          id: "C",
          name: "Access token + Option 1 (old backend method)",
          sdkVersion: "11.4.0",
          init: "option1",
          token: access.token,
          workflowId: WORKFLOW_ID,
          transactionId: access.transactionId,
          expected: "may work or fail — no txn in JWT",
          checks: {
            tokenType: "access",
            jwtKeys: Object.keys(accessPayload || {}),
            hasWorkflowInJwt: !!accessPayload?.workflowId,
          },
        },
        {
          id: "D",
          name: "v2 token + Option 2 (token only, like sample)",
          sdkVersion: "11.4.0",
          init: "option2",
          token: v2Match.token,
          workflowId: WORKFLOW_ID,
          transactionId: txnMatch,
          expected: "should work",
          checks: {
            tokenType: "v2",
            jwtTxn: v2Payload?.transactionId,
          },
        },
        {
          id: "E",
          name: "Backend v2 + SDK 9.5.0 (version test)",
          sdkVersion: "9.5.0",
          init: "option1",
          token: v2Match.token,
          workflowId: WORKFLOW_ID,
          transactionId: txnMatch,
          expected: "test SDK version difference",
          checks: { tokenType: "v2", txnMatch: true },
        },
      ],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Test:  http://localhost:${PORT}/selfie_test.html`);
  console.log(`Debug: http://localhost:${PORT}/debug.html`);
});
