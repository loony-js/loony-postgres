// src/messageBuilder.js
import { MESSAGE_TYPES } from "./constants.mjs";

/**
 * Creates the initial connection startup packet (no type byte).
 * @param {object} config - Connection configuration.
 * @returns {Buffer} The complete startup message packet.
 */
export function createStartupPacket(config) {
  const protocolVersion = 196608; // 3.0 (0x00030000)

  const params = {
    user: config.user,
    database: config.database,
    client_encoding: config.encoding || "utf8",
  };

  let body = Buffer.alloc(0);

  // Protocol version (int32)
  const versionBuffer = Buffer.alloc(4);
  versionBuffer.writeInt32BE(protocolVersion, 0);
  body = Buffer.concat([body, versionBuffer]);

  // Parameters (key\0value\0 pairs)
  for (const [key, value] of Object.entries(params)) {
    body = Buffer.concat([body, Buffer.from(key, "utf8"), Buffer.from([0])]);
    body = Buffer.concat([body, Buffer.from(value, "utf8"), Buffer.from([0])]);
  }

  // Final null terminator
  body = Buffer.concat([body, Buffer.from([0])]);

  // Calculate total length (including the length field itself)
  const totalLength = body.length + 4;
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeInt32BE(totalLength, 0);

  return Buffer.concat([lengthBuffer, body]);
}

/**
 * Creates a Query message ('Q').
 * @param {string} sql - The SQL query string.
 * @returns {Buffer} The complete Query message packet.
 */
export function createSimpleQueryPacket(sql) {
  const queryBuffer = Buffer.from(sql, "utf8");

  let packet = Buffer.alloc(0);

  // Message type 'Q'
  packet = Buffer.concat([packet, Buffer.from([MESSAGE_TYPES.QUERY])]);

  // Message length: 4 (length field) + query length + 1 (null terminator)
  const length = 4 + queryBuffer.length + 1;
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeInt32BE(length, 0);
  packet = Buffer.concat([packet, lengthBuffer]);

  // Query string + null terminator
  packet = Buffer.concat([packet, queryBuffer, Buffer.from([0])]);

  return packet;
}

/**
 * Creates a PasswordMessage ('p'). Used for Cleartext, MD5, and SASL responses.
 * @param {string} password - The password or auth response string.
 * @param {boolean} addNullTerminator - Whether to add a null terminator (used for Cleartext/MD5).
 * @returns {Buffer} The complete Password message packet.
 */
export function createPasswordPacket(password, addNullTerminator = true) {
  const passwordBuffer = Buffer.from(password, "utf8");

  let packet = Buffer.alloc(0);

  // Message type 'p'
  packet = Buffer.concat([
    packet,
    Buffer.from([MESSAGE_TYPES.PASSWORD_MESSAGE]),
  ]);

  // Message length: 4 (length field) + password length + (1 if null terminated)
  const nullTermLength = addNullTerminator ? 1 : 0;
  const length = 4 + passwordBuffer.length + nullTermLength;
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeInt32BE(length, 0);
  packet = Buffer.concat([packet, lengthBuffer]);

  // Password data + optional null terminator
  packet = Buffer.concat([packet, passwordBuffer]);
  if (addNullTerminator) {
    packet = Buffer.concat([packet, Buffer.from([0])]);
  }

  return packet;
}

/**
 * Creates the Termination message ('X').
 * @returns {Buffer} The complete Termination message packet.
 */
export function createTerminationPacket() {
  // [Type('X'), Length(4)] -> Type('X') is 1 byte, Length (Int32, value 4) is 4 bytes. Total 5 bytes.
  return Buffer.from([MESSAGE_TYPES.TERMINATE, 0x00, 0x00, 0x00, 0x04]);
}

/**
 * Creates the SASLInitialResponse message ('p' type with mechanism name and initial data).
 * @param {string} mechanism - The SASL mechanism name (e.g., 'SCRAM-SHA-256').
 * @param {string} clientFirstMessage - The initial client message string.
 * @returns {Buffer} The complete SASLInitialResponse message packet.
 */
export function createSASLInitialResponsePacket(mechanism, clientFirstMessage) {
  const clientFirstMessageBuffer = Buffer.from(clientFirstMessage, "utf8");
  let packet = Buffer.alloc(0);

  // Message type 'p' (PasswordMessage)
  packet = Buffer.concat([
    packet,
    Buffer.from([MESSAGE_TYPES.PASSWORD_MESSAGE]),
  ]);

  // Message length (placeholder, will fill later)
  const lengthPos = packet.length;
  packet = Buffer.concat([packet, Buffer.alloc(4)]);

  // Mechanism name + null terminator
  packet = Buffer.concat([
    packet,
    Buffer.from(mechanism, "utf8"),
    Buffer.from([0]),
  ]);

  // Client first message length (int32) + message
  const clientMsgLength = Buffer.alloc(4);
  clientMsgLength.writeInt32BE(clientFirstMessageBuffer.length, 0);

  packet = Buffer.concat([packet, clientMsgLength, clientFirstMessageBuffer]);

  // Update length field: total message body length
  const totalLength = packet.length - lengthPos;
  packet.writeInt32BE(totalLength, lengthPos);

  return packet;
}
