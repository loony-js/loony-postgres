// src/scramAuth.js
import crypto from "crypto";
import { parseSCRAMParams } from "./messageParser.mjs";

/**
 * Generates the client first message and stores necessary SCRAM state.
 * @param {object} scramState - The SCRAM state object.
 * @param {string} user - The username.
 * @returns {object} The updated SCRAM state.
 */
export function startSCRAMSHA256(scramState, user) {
  // Generate client nonce (at least 18 bytes recommended)
  scramState.clientNonce = crypto.randomBytes(18).toString("base64");

  // GS2 header: "n,," = no channel binding, no authorization identity
  const gs2Header = "n,,";

  // Client first message bare: "n=username,r=client-nonce"
  const clientFirstMessageBare = `n=${saslName(user)},r=${
    scramState.clientNonce
  }`;
  scramState.clientFirstMessageBare = clientFirstMessageBare;

  // Full client first message
  scramState.clientFirstMessage = gs2Header + clientFirstMessageBare;

  return scramState;
}

/**
 * Processes the server first message and calculates SCRAM proofs.
 * @param {object} scramState - The SCRAM state object.
 * @param {Buffer} message - The server first message buffer.
 * @param {string} password - The user's password.
 * @returns {{state: object, error: Error|null}} The updated state or an error.
 */
export function processSASLContinue(scramState, message, password) {
  const serverFirstMessage = message.toString("utf8");
  scramState.serverFirstMessage = serverFirstMessage;

  const params = parseSCRAMParams(serverFirstMessage);

  // Verification and parameter storage
  if (!params.r || !params.r.startsWith(scramState.clientNonce)) {
    return {
      state: scramState,
      error: new Error("Server nonce does not start with client nonce"),
    };
  }
  if (!params.s || !params.i) {
    return {
      state: scramState,
      error: new Error("Server first message missing salt or iteration count"),
    };
  }

  scramState.serverNonce = params.r;
  scramState.salt = Buffer.from(params.s, "base64");
  scramState.iterations = parseInt(params.i, 10);

  // --- Proof Calculation ---
  const normalizedPassword = normalizePassword(password);

  // 1. SaltedPassword
  scramState.saltedPassword = crypto.pbkdf2Sync(
    normalizedPassword,
    scramState.salt,
    scramState.iterations,
    32, // 32 bytes = 256 bits
    "sha256"
  );

  // 2. ClientKey and StoredKey
  const clientKey = crypto
    .createHmac("sha256", scramState.saltedPassword)
    .update("Client Key")
    .digest();
  const storedKey = crypto.createHash("sha256").update(clientKey).digest();

  // 3. Client Final Message Without Proof
  // c=biws is the base64 of the GS2 header ("n,,")
  const clientFinalMessageWithoutProof = `c=biws,r=${scramState.serverNonce}`;
  scramState.clientFinalMessageWithoutProof = clientFinalMessageWithoutProof;

  // 4. Auth Message
  scramState.authMessage = [
    scramState.clientFirstMessageBare,
    scramState.serverFirstMessage,
    clientFinalMessageWithoutProof,
  ].join(",");

  // 5. ClientSignature and ClientProof
  const clientSignature = crypto
    .createHmac("sha256", storedKey)
    .update(scramState.authMessage)
    .digest();

  const clientProof = Buffer.alloc(clientKey.length);
  for (let i = 0; i < clientKey.length; i++) {
    clientProof[i] = clientKey[i] ^ clientSignature[i];
  }

  // 6. Full Client Final Message
  scramState.clientFinalMessage = `${clientFinalMessageWithoutProof},p=${clientProof.toString(
    "base64"
  )}`;

  return { state: scramState, error: null };
}

/**
 * Processes the server final message and verifies the server signature.
 * @param {object} scramState - The SCRAM state object.
 * @param {Buffer} message - The server final message buffer.
 * @returns {Error|null} An error if verification fails, otherwise null.
 */
export function processSASLFinal(scramState, message) {
  const serverFinalMessage = message.toString("utf8");
  scramState.serverFinalMessage = serverFinalMessage;

  if (serverFinalMessage.startsWith("e=")) {
    return new Error(`SCRAM authentication failed: ${serverFinalMessage}`);
  }

  const params = parseSCRAMParams(serverFinalMessage);
  if (!params.v) {
    return new Error("Server final message missing signature (v)");
  }
  const serverSignature = Buffer.from(params.v, "base64");

  // 1. ServerKey
  const serverKey = crypto
    .createHmac("sha256", scramState.saltedPassword)
    .update("Server Key")
    .digest();

  // 2. Expected Server Signature
  const expectedServerSignature = crypto
    .createHmac("sha256", serverKey)
    .update(scramState.authMessage)
    .digest();

  if (!serverSignature.equals(expectedServerSignature)) {
    return new Error("Server signature verification failed");
  }

  return null; // Success
}

/**
 * Simple SASL name escaping.
 * @param {string} name - The username.
 * @returns {string} The escaped name.
 */
function saslName(name) {
  // Simple SASL name escaping (replace = with =3D and , with =2C)
  return name.replace(/=/g, "=3D").replace(/,/g, "=2C");
}

/**
 * Simple password normalization.
 * @param {string} password - The password.
 * @returns {string} The normalized password.
 */
function normalizePassword(password) {
  // Simplified SASLprep - in production, use a proper SASLprep library
  return password.normalize("NFKC");
}
