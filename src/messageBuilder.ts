// src/messageBuilder.js
import { MESSAGE_TYPES } from "./constants";
import type { ConnectionConfig, AuthParams } from "./types";

export function createPasswordPacket(
  password: string,
  addNullTerminator: boolean = true,
): Buffer {
  const passwordBuffer = Buffer.from(password, "utf8");
  let packet = Buffer.alloc(0);

  packet = Buffer.concat([
    packet,
    Buffer.from([MESSAGE_TYPES.PASSWORD_MESSAGE]),
  ]);

  const nullTermLength = addNullTerminator ? 1 : 0;
  const length = 4 + passwordBuffer.length + nullTermLength;
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeInt32BE(length, 0);
  packet = Buffer.concat([packet, lengthBuffer]);

  packet = Buffer.concat([packet, passwordBuffer]);
  if (addNullTerminator) {
    packet = Buffer.concat([packet, Buffer.from([0])]);
  }

  return packet;
}

// export function createTerminationPacket(): Buffer {
//   return Buffer.from([MESSAGE_TYPES.TERMINATE, 0x00, 0x00, 0x00, 0x04]);
// }

export function createSASLInitialResponsePacket(
  mechanism: string,
  clientFirstMessage: string,
): Buffer {
  const clientFirstMessageBuffer = Buffer.from(clientFirstMessage, "utf8");
  let packet = Buffer.alloc(0);

  packet = Buffer.concat([
    packet,
    Buffer.from([MESSAGE_TYPES.PASSWORD_MESSAGE]),
  ]);

  const lengthPos = packet.length;
  packet = Buffer.concat([packet, Buffer.alloc(4)]);

  packet = Buffer.concat([
    packet,
    Buffer.from(mechanism, "utf8"),
    Buffer.from([0]),
  ]);

  const clientMsgLength = Buffer.alloc(4);
  clientMsgLength.writeInt32BE(clientFirstMessageBuffer.length, 0);

  packet = Buffer.concat([packet, clientMsgLength, clientFirstMessageBuffer]);

  const totalLength = packet.length - lengthPos;
  packet.writeInt32BE(totalLength, lengthPos);

  return packet;
}

export function createStartupPacket(config: ConnectionConfig): Buffer {
  const protocolVersion = 196608; // 3.0 (0x00030000)

  const params: AuthParams = {
    user: config.user,
    database: config.database,
    client_encoding: config.encoding || "utf8",
  };

  let body = Buffer.alloc(0);

  const versionBuffer = Buffer.alloc(4);
  versionBuffer.writeInt32BE(protocolVersion, 0);
  body = Buffer.concat([body, versionBuffer]);

  for (const [key, value] of Object.entries(params)) {
    body = Buffer.concat([body, Buffer.from(key, "utf8"), Buffer.from([0])]);
    body = Buffer.concat([body, Buffer.from(value, "utf8"), Buffer.from([0])]);
  }

  body = Buffer.concat([body, Buffer.from([0])]);

  const totalLength = body.length + 4;
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeInt32BE(totalLength, 0);

  return Buffer.concat([lengthBuffer, body]);
}

export function createSimpleQueryPacket(sql: string): Buffer {
  const queryBuffer = Buffer.from(sql, "utf8");
  let packet = Buffer.alloc(0);

  packet = Buffer.concat([packet, Buffer.from([MESSAGE_TYPES.QUERY])]);

  const length = 4 + queryBuffer.length + 1;
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeInt32BE(length, 0);
  packet = Buffer.concat([packet, lengthBuffer]);

  packet = Buffer.concat([packet, queryBuffer, Buffer.from([0])]);

  return packet;
}

/**
 * Creates a PARSE message for the extended query protocol
 * @param statementName - Name of the prepared statement (empty string for unnamed)
 * @param sql - SQL query string with $1, $2, etc. placeholders
 * @param paramTypes - Array of parameter type OIDs (0 = infer from context)
 */
export function createParsePacket(
  statementName: string,
  sql: string,
  paramTypes: number[] = [],
): Buffer {
  const statementNameBuffer = Buffer.from(statementName, "utf8");
  const queryBuffer = Buffer.from(sql, "utf8");
  let packet = Buffer.alloc(0);

  packet = Buffer.concat([packet, Buffer.from([MESSAGE_TYPES.PARSE])]);

  const lengthPos = packet.length;
  packet = Buffer.concat([packet, Buffer.alloc(4)]);

  // Statement name (null-terminated)
  packet = Buffer.concat([packet, statementNameBuffer, Buffer.from([0])]);

  // Query string (null-terminated)
  packet = Buffer.concat([packet, queryBuffer, Buffer.from([0])]);

  // Number of parameter types
  const paramCountBuffer = Buffer.alloc(2);
  paramCountBuffer.writeInt16BE(paramTypes.length, 0);
  packet = Buffer.concat([packet, paramCountBuffer]);

  // Parameter types (int32 each)
  for (const oid of paramTypes) {
    const oidBuffer = Buffer.alloc(4);
    oidBuffer.writeInt32BE(oid, 0);
    packet = Buffer.concat([packet, oidBuffer]);
  }

  // Update length
  const totalLength = packet.length - lengthPos;
  packet.writeInt32BE(totalLength, lengthPos);

  return packet;
}

/**
 * Creates a BIND message for the extended query protocol
 * @param portalName - Name of the portal (empty string for unnamed)
 * @param statementName - Name of the prepared statement
 * @param paramValues - Array of parameter values (null for NULL values)
 */
export function createBindPacket(
  portalName: string,
  statementName: string,
  paramValues: (string | null | Buffer)[] = [],
): Buffer {
  const portalNameBuffer = Buffer.from(portalName, "utf8");
  const statementNameBuffer = Buffer.from(statementName, "utf8");
  let packet = Buffer.alloc(0);

  packet = Buffer.concat([packet, Buffer.from([MESSAGE_TYPES.BIND])]);

  const lengthPos = packet.length;
  packet = Buffer.concat([packet, Buffer.alloc(4)]);

  // Portal name (null-terminated)
  packet = Buffer.concat([packet, portalNameBuffer, Buffer.from([0])]);

  // Statement name (null-terminated)
  packet = Buffer.concat([packet, statementNameBuffer, Buffer.from([0])]);

  // Number of parameter format codes (0 = all text format)
  const formatCountBuffer = Buffer.alloc(2);
  formatCountBuffer.writeInt16BE(0, 0);
  packet = Buffer.concat([packet, formatCountBuffer]);

  // Number of parameter values
  const paramCountBuffer = Buffer.alloc(2);
  paramCountBuffer.writeInt16BE(paramValues.length, 0);
  packet = Buffer.concat([packet, paramCountBuffer]);

  // Parameter values
  for (const value of paramValues) {
    let valueBuffer: Buffer;

    if (value === null) {
      // NULL value: length = -1
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeInt32BE(-1, 0);
      packet = Buffer.concat([packet, lengthBuffer]);
    } else if (typeof value === "string") {
      valueBuffer = Buffer.from(value, "utf8");
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeInt32BE(valueBuffer.length, 0);
      packet = Buffer.concat([packet, lengthBuffer, valueBuffer]);
    } else if (Buffer.isBuffer(value)) {
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeInt32BE(value.length, 0);
      packet = Buffer.concat([packet, lengthBuffer, value]);
    }
  }

  // Result format codes (0 = all text format)
  const resultFormatCountBuffer = Buffer.alloc(2);
  resultFormatCountBuffer.writeInt16BE(0, 0);
  packet = Buffer.concat([packet, resultFormatCountBuffer]);

  // Update length
  const totalLength = packet.length - lengthPos;
  packet.writeInt32BE(totalLength, lengthPos);

  return packet;
}

/**
 * Creates a DESCRIBE message for extended query protocol
 * @param type - 'P' for portal, 'S' for prepared statement
 * @param name - Name of the portal or statement
 */
export function createDescribePacket(type: string, name: string = ""): Buffer {
  const nameBuffer = Buffer.from(name, "utf8");
  let packet = Buffer.alloc(0);

  packet = Buffer.concat([packet, Buffer.from([MESSAGE_TYPES.DESCRIBE])]);

  const lengthPos = packet.length;
  packet = Buffer.concat([packet, Buffer.alloc(4)]);

  packet = Buffer.concat([packet, Buffer.from(type, "utf8")]);
  packet = Buffer.concat([packet, nameBuffer, Buffer.from([0])]);

  // Update length
  const totalLength = packet.length - lengthPos;
  packet.writeInt32BE(totalLength, lengthPos);

  return packet;
}

/**
 * Creates an EXECUTE message for the extended query protocol
 * @param portalName - Name of the portal to execute
 * @param maxRows - Maximum number of rows to return (0 = all)
 */
export function createExecutePacket(
  portalName: string = "",
  maxRows: number = 0,
): Buffer {
  const portalNameBuffer = Buffer.from(portalName, "utf8");
  let packet = Buffer.alloc(0);

  packet = Buffer.concat([packet, Buffer.from([MESSAGE_TYPES.EXECUTE])]);

  const lengthPos = packet.length;
  packet = Buffer.concat([packet, Buffer.alloc(4)]);

  // Portal name (null-terminated)
  packet = Buffer.concat([packet, portalNameBuffer, Buffer.from([0])]);

  // Maximum rows
  const maxRowsBuffer = Buffer.alloc(4);
  maxRowsBuffer.writeInt32BE(maxRows, 0);
  packet = Buffer.concat([packet, maxRowsBuffer]);

  // Update length
  const totalLength = packet.length - lengthPos;
  packet.writeInt32BE(totalLength, lengthPos);

  return packet;
}

/**
 * Creates a SYNC message to synchronize with the server
 */
export function createSyncPacket(): Buffer {
  const packet = Buffer.alloc(5);
  packet[0] = MESSAGE_TYPES.SYNC;
  packet.writeInt32BE(4, 1);
  return packet;
}

/**
 * Creates a CLOSE message for closing a portal or statement
 * @param type - 'S' for statement, 'P' for portal
 * @param name - Name of the statement/portal
 */
export function createClosePacket(type: string, name: string): Buffer {
  const nameBuffer = Buffer.from(name, "utf8");
  let packet = Buffer.alloc(0);

  packet = Buffer.concat([packet, Buffer.from([MESSAGE_TYPES.CLOSE])]);

  const lengthPos = packet.length;
  packet = Buffer.concat([packet, Buffer.alloc(4)]);

  // Type (S or P)
  packet = Buffer.concat([packet, Buffer.from(type, "utf8")]);

  // Name (null-terminated)
  packet = Buffer.concat([packet, nameBuffer, Buffer.from([0])]);

  // Update length
  const totalLength = packet.length - lengthPos;
  packet.writeInt32BE(totalLength, lengthPos);

  return packet;
}

/**
 * Creates the initial connection startup packet (no type byte).
 * @param {object} config - Connection configuration.
 * @returns {Buffer} The complete startup message packet.
 */
// export function createStartupPacket(config) {
//   const protocolVersion = 196608; // 3.0 (0x00030000)

//   const params = {
//     user: config.user,
//     // src/messageBuilder.ts

//     database: config.database,
//     client_encoding: config.encoding || "utf8",
//   };

//   let body = Buffer.alloc(0);

//   // Protocol version (int32)
//   const versionBuffer = Buffer.alloc(4);
//   versionBuffer.writeInt32BE(protocolVersion, 0);
//   body = Buffer.concat([body, versionBuffer]);

//   // Parameters (key\0value\0 pairs)
//   for (const [key, value] of Object.entries(params)) {
//     body = Buffer.concat([body, Buffer.from(key, "utf8"), Buffer.from([0])]);
//     body = Buffer.concat([body, Buffer.from(value, "utf8"), Buffer.from([0])]);
//   }

//   // Final null terminator
//   body = Buffer.concat([body, Buffer.from([0])]);

//   // Calculate total length (including the length field itself)
//   const totalLength = body.length + 4;
//   const lengthBuffer = Buffer.alloc(4);
//   lengthBuffer.writeInt32BE(totalLength, 0);

//   return Buffer.concat([lengthBuffer, body]);
// }

/**
 * Creates a Query message ('Q').
 * @param {string} sql - The SQL query string.
 * @returns {Buffer} The complete Query message packet.
 */
// export function createSimpleQueryPacket(sql) {
//   const queryBuffer = Buffer.from(sql, "utf8");

//   let packet = Buffer.alloc(0);

//   // Message type 'Q'
//   packet = Buffer.concat([packet, Buffer.from([MESSAGE_TYPES.QUERY])]);

//   // Message length: 4 (length field) + query length + 1 (null terminator)
//   const length = 4 + queryBuffer.length + 1;
//   const lengthBuffer = Buffer.alloc(4);
//   lengthBuffer.writeInt32BE(length, 0);
//   packet = Buffer.concat([packet, lengthBuffer]);

//   // Query string + null terminator
//   packet = Buffer.concat([packet, queryBuffer, Buffer.from([0])]);

//   return packet;
// }

/**
 * Creates a PasswordMessage ('p'). Used for Cleartext, MD5, and SASL responses.
 * @param {string} password - The password or auth response string.
 * @param {boolean} addNullTerminator - Whether to add a null terminator (used for Cleartext/MD5).
 * @returns {Buffer} The complete Password message packet.
 */
// export function createPasswordPacket(password, addNullTerminator = true) {
//   const passwordBuffer = Buffer.from(password, "utf8");

//   let packet = Buffer.alloc(0);

//   // Message type 'p'
//   packet = Buffer.concat([
//     packet,
//     Buffer.from([MESSAGE_TYPES.PASSWORD_MESSAGE]),
//   ]);

//   // Message length: 4 (length field) + password length + (1 if null terminated)
//   const nullTermLength = addNullTerminator ? 1 : 0;
//   const length = 4 + passwordBuffer.length + nullTermLength;
//   const lengthBuffer = Buffer.alloc(4);
//   lengthBuffer.writeInt32BE(length, 0);
//   packet = Buffer.concat([packet, lengthBuffer]);

//   // Password data + optional null terminator
//   packet = Buffer.concat([packet, passwordBuffer]);
//   if (addNullTerminator) {
//     packet = Buffer.concat([packet, Buffer.from([0])]);
//   }

//   return packet;
// }

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
// export function createSASLInitialResponsePacket(mechanism, clientFirstMessage) {
//   const clientFirstMessageBuffer = Buffer.from(clientFirstMessage, "utf8");
//   let packet = Buffer.alloc(0);

//   // Message type 'p' (PasswordMessage)
//   packet = Buffer.concat([
//     packet,
//     Buffer.from([MESSAGE_TYPES.PASSWORD_MESSAGE]),
//   ]);

//   // Message length (placeholder, will fill later)
//   const lengthPos = packet.length;
//   packet = Buffer.concat([packet, Buffer.alloc(4)]);

//   // Mechanism name + null terminator
//   packet = Buffer.concat([
//     packet,
//     Buffer.from(mechanism, "utf8"),
//     Buffer.from([0]),
//   ]);

//   // Client first message length (int32) + message
//   const clientMsgLength = Buffer.alloc(4);
//   clientMsgLength.writeInt32BE(clientFirstMessageBuffer.length, 0);

//   packet = Buffer.concat([packet, clientMsgLength, clientFirstMessageBuffer]);

//   // Update length field: total message body length
//   const totalLength = packet.length - lengthPos;
//   packet.writeInt32BE(totalLength, lengthPos);

//   return packet;
// }
