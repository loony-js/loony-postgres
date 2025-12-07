// src/constants.js

export const MESSAGE_TYPES = {
  // Client messages
  STARTUP: 0, // No type byte for startup
  QUERY: "Q".charCodeAt(0), // 0x51
  TERMINATE: "X".charCodeAt(0), // 0x58
  PASSWORD_MESSAGE: "p".charCodeAt(0), // 0x70
  // Extended Protocol (not fully implemented but defined for structure)
  BIND: "B".charCodeAt(0), // 0x42
  PARSE: "P".charCodeAt(0), // 0x50
  DESCRIBE: "D".charCodeAt(0), // 0x44
  EXECUTE: "E".charCodeAt(0), // 0x45
  SYNC: "S".charCodeAt(0), // 0x53
  CLOSE: "C".charCodeAt(0), // 0x43

  // Server messages
  AUTHENTICATION: "R".charCodeAt(0), // 0x52
  PARAMETER_STATUS: "S".charCodeAt(0), // 0x53
  BACKEND_KEY_DATA: "K".charCodeAt(0), // 0x4B
  READY_FOR_QUERY: "Z".charCodeAt(0), // 0x5A
  ROW_DESCRIPTION: "T".charCodeAt(0), // 0x54
  DATA_ROW: "D".charCodeAt(0), // 0x44
  COMMAND_COMPLETE: "C".charCodeAt(0), // 0x43
  ERROR_RESPONSE: "E".charCodeAt(0), // 0x45
  NOTICE_RESPONSE: "N".charCodeAt(0), // 0x4E
  PARSE_COMPLETE: "1".charCodeAt(0), // 0x31
  BIND_COMPLETE: "2".charCodeAt(0), // 0x32
  CLOSE_COMPLETE: "3".charCodeAt(0), // 0x33
  NO_DATA: "n".charCodeAt(0), // 0x6E
  EMPTY_QUERY_RESPONSE: "I".charCodeAt(0), // 0x49
};

export const AUTH_TYPES = {
  OK: 0,
  CLEARTEXT_PASSWORD: 3,
  MD5_PASSWORD: 5,
  SASL: 10,
  SASL_CONTINUE: 11,
  SASL_FINAL: 12,
  // Other types omitted for brevity
};
