// src/messageParser.js

/**
 * Reads a null-terminated string (C-String) from a Buffer.
 * @param {Buffer} buffer - The buffer to read from.
 * @param {number} offset - The starting offset.
 * @returns {string} The decoded string.
 */
export function readCString(buffer, offset) {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) {
    end++;
  }
  return buffer.toString("utf8", offset, end);
}

/**
 * Parses a sequence of null-terminated key-value pairs (e.g., ErrorResponse, NoticeResponse, ParameterStatus).
 * @param {Buffer} buffer - The message body.
 * @returns {object} An object containing the parsed key-value pairs.
 */
export function parseNullTerminatedPairs(buffer) {
  const result = {};
  let offset = 0;

  while (offset < buffer.length && buffer[offset] !== 0) {
    // Key is a single byte (char code)
    const key = buffer.toString("utf8", offset, offset + 1);
    offset += 1;

    // Value is a null-terminated string
    const value = readCString(buffer, offset);
    offset += value.length + 1;

    result[key] = value;
  }

  return result;
}

/**
 * Parses a CommandComplete message body.
 * @param {Buffer} message - The message body (a single C-string).
 * @returns {object} Parsed command details.
 */
export function parseCommandComplete(message) {
  const commandTag = readCString(message, 0);
  const parts = commandTag.split(" ");

  let rowCount = 0;
  let oid = null;

  // Example: INSERT OID ROWS (for inserts) or SELECT ROWS
  if (parts.length === 3 && parts[0].toLowerCase() === "insert") {
    oid = parseInt(parts[1], 10);
    rowCount = parseInt(parts[2], 10);
  } else if (parts.length >= 2) {
    rowCount = parseInt(parts.pop(), 10); // Last part is usually row count
    if (isNaN(rowCount)) rowCount = 0;
  }

  return {
    command: parts[0],
    rowCount: rowCount,
    oid: oid,
    commandTag: commandTag,
  };
}

/**
 * Parses the RowDescription message body.
 * @param {Buffer} message - The message body.
 * @returns {Array<object>} An array of field objects.
 */
export function parseRowDescription(message) {
  const fieldCount = message.readInt16BE(0);
  let offset = 2;
  const fields = [];

  for (let i = 0; i < fieldCount; i++) {
    const name = readCString(message, offset);
    offset += name.length + 1;

    if (offset + 18 > message.length) break;

    const field = {
      name,
      tableOID: message.readInt32BE(offset),
      columnAttrNum: message.readInt16BE(offset + 4),
      dataTypeOID: message.readInt32BE(offset + 6),
      dataTypeSize: message.readInt16BE(offset + 10),
      typeModifier: message.readInt32BE(offset + 12),
      format: message.readInt16BE(offset + 16),
    };

    offset += 18;
    fields.push(field);
  }

  return fields;
}

/**
 * Parses a DataRow message body into a JavaScript object.
 * @param {Buffer} message - The message body.
 * @param {Array<object>} fields - The field definitions from RowDescription.
 * @returns {object} A single row object.
 */
export function parseDataRow(message, fields) {
  const fieldCount = message.readInt16BE(0);
  let offset = 2;
  const row = {};

  for (let i = 0; i < fieldCount && i < fields.length; i++) {
    if (offset + 4 > message.length) break;

    const length = message.readInt32BE(offset);
    offset += 4;

    if (length === -1) {
      row[fields[i].name] = null;
    } else {
      if (offset + length > message.length) break;

      // Assuming text format (0) for simplicity.
      const value = message.toString("utf8", offset, offset + length);
      row[fields[i].name] = value;
      offset += length;
    }
  }

  return row;
}

/**
 * Parses key=value,key=value SCRAM parameters string.
 * @param {string} str - The SCRAM parameters string.
 * @returns {object} The parsed parameters.
 */
export function parseSCRAMParams(str) {
  const params = {};
  const pairs = str.split(",");

  for (const pair of pairs) {
    const [key, value] = pair.split("=", 2);
    if (key && value !== undefined) {
      params[key] = value;
    }
  }

  return params;
}
