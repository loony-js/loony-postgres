// src/PostgreSQLConnection.js

import net from "net";
import crypto from "crypto";
import { MESSAGE_TYPES, AUTH_TYPES } from "./constants";
import {
  createStartupPacket,
  createSimpleQueryPacket,
  createPasswordPacket,
  createTerminationPacket,
  createSASLInitialResponsePacket,
  createParsePacket,
  createBindPacket,
  createExecutePacket,
  createSyncPacket,
  createDescribePacket,
} from "./messageBuilder";
import {
  parseNullTerminatedPairs,
  readCString,
  parseCommandComplete,
  parseRowDescription,
  parseDataRow,
} from "./messageParser";
import {
  startSCRAMSHA256,
  processSASLContinue,
  processSASLFinal,
} from "./scramAuth";
import type { QueryResult } from "./types";

class PostgreSQLConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  socket: net.Socket | null;
  buffer: Buffer;
  processId: number;
  secretKey: number;
  encoding: string;
  state: string;
  readyForQuery: boolean;
  currentQuery: any;
  queryQueue: Array<any>;
  MESSAGE_TYPES: typeof MESSAGE_TYPES;
  AUTH_TYPES: typeof AUTH_TYPES;
  scram: any;

  constructor(config: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  }) {
    this.host = config.host || "localhost";
    this.port = config.port || 5432;
    this.database = config.database || "postgres";
    this.user = config.user || "postgres";
    this.password = config.password || "";

    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.processId = 0;
    this.secretKey = 0;
    this.encoding = "utf8";

    this.state = "disconnected";
    this.readyForQuery = true;
    this.currentQuery = null;
    this.queryQueue = [];

    this.MESSAGE_TYPES = MESSAGE_TYPES;
    this.AUTH_TYPES = AUTH_TYPES;

    // SCRAM authentication state
    this.scram = {
      clientNonce: null,
      serverNonce: null,
      salt: null,
      iterations: 0,
      clientFirstMessage: null,
      clientFirstMessageBare: null,
      clientFinalMessage: null,
      clientFinalMessageWithoutProof: null,
      serverFirstMessage: null,
      serverFinalMessage: null,
      saltedPassword: null,
      authMessage: null,
    };
  }

  // --- Connection & Lifecycle Methods ---

  async connect() {
    return new Promise((resolve, reject) => {
      // ... (TCP connection setup remains the same)
      try {
        this.socket = net.createConnection(
          {
            host: this.host,
            port: this.port,
          },
          () => {
            this.state = "connected";
            console.log(
              "TCP connection established, sending startup packet...",
            );
            this._sendStartupMessage();
          },
        );

        this.socket?.on("data", (data: any) => {
          this.buffer = Buffer.concat([this.buffer, data]);
          this._processIncomingData();
        });

        this.socket?.on("error", (err) => {
          console.error("Socket error:", err);
          this.state = "error";
          if (this.state !== "connected") {
            reject(err);
          }
        });

        this.socket?.on("close", () => {
          this.state = "disconnected";
        });

        this.socket?.on("end", () => {
          this.state = "disconnected";
        });

        const onReadyForQuery = (status: any) => {
          this.readyForQuery = true;
          this.socket?.removeListener("authenticationError", onAuthError);
          resolve(this);
        };

        const onAuthError = (error: any) => {
          this.socket?.removeListener("readyForQuery", onReadyForQuery);
          reject(error);
        };

        this.socket?.once("readyForQuery", onReadyForQuery);
        this.socket?.once("authenticationError", onAuthError);
      } catch (error) {
        reject(error);
      }
    });
  }

  async close() {
    return new Promise<void>((resolve) => {
      if (this.socket && this.state !== "disconnected") {
        this.socket?.write(createTerminationPacket());
        this.socket?.end();
        this.socket?.once("close", () => {
          this.state = "disconnected";
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // --- Core Protocol Handlers ---

  _sendStartupMessage() {
    const startupPacket = createStartupPacket(this);
    this.socket?.write(startupPacket);
  }

  _processIncomingData() {
    while (this.buffer.length >= 5) {
      const messageType = this.buffer[0];
      const length = this.buffer.readInt32BE(1);

      if (length < 4) {
        console.error("Invalid message length:", length);
        this.buffer = this.buffer.slice(1);
        continue;
      }

      const totalMessageLength = length + 1;

      if (this.buffer.length < totalMessageLength) {
        break; // Wait for more data
      }

      const message = this.buffer.slice(0, totalMessageLength);
      this.buffer = this.buffer.slice(totalMessageLength);
      this._processMessage(message);
    }
  }

  _processMessage(message: Buffer<ArrayBuffer>) {
    if (message.length < 5) return;

    const messageType = message[0];
    const messageBody = message.slice(5);

    switch (messageType) {
      case this.MESSAGE_TYPES.AUTHENTICATION:
        this._handleAuthenticationMessage(messageBody);
        break;
      case this.MESSAGE_TYPES.BACKEND_KEY_DATA:
        this._handleBackendKeyData(messageBody);
        break;
      case this.MESSAGE_TYPES.READY_FOR_QUERY:
        this._handleReadyForQuery(messageBody);
        break;
      case this.MESSAGE_TYPES.ERROR_RESPONSE:
        this._handleErrorResponse(messageBody);
        break;
      case this.MESSAGE_TYPES.NOTICE_RESPONSE:
        this._handleNoticeResponse(messageBody);
        break;
      case this.MESSAGE_TYPES.PARAMETER_STATUS:
        this._handleParameterStatus(messageBody);
        break;
      // Query Responses
      case this.MESSAGE_TYPES.ROW_DESCRIPTION:
      case this.MESSAGE_TYPES.DATA_ROW:
      case this.MESSAGE_TYPES.COMMAND_COMPLETE:
      case this.MESSAGE_TYPES.EMPTY_QUERY_RESPONSE:
      case this.MESSAGE_TYPES.NO_DATA:
      case this.MESSAGE_TYPES.PARSE_COMPLETE:
      case this.MESSAGE_TYPES.BIND_COMPLETE:
        if (this.currentQuery && this.currentQuery.handlers) {
          this._handleQueryResponse(messageType, messageBody);
        }
        break;
      default:
        //console.log(`Unhandled message type: 0x${messageType.toString(16).toUpperCase()}`);
        break;
    }
  }

  // --- Authentication Handlers (now includes SCRAM logic from scramAuth.js) ---

  _handleAuthenticationMessage(message: Buffer) {
    if (message.length < 4) return;

    const authType = message.readInt32BE(0);
    const authData = message.slice(4);

    switch (authType) {
      case this.AUTH_TYPES.OK:
        this.socket?.emit("authenticated");
        break;
      case this.AUTH_TYPES.CLEARTEXT_PASSWORD:
        this.socket?.write(createPasswordPacket(this.password));
        break;
      case this.AUTH_TYPES.MD5_PASSWORD:
        this._handleMD5Authentication(authData);
        break;
      case this.AUTH_TYPES.SASL:
        this._handleSASLAuthentication(authData);
        break;
      case this.AUTH_TYPES.SASL_CONTINUE:
        this._handleSASLContinue(authData);
        break;
      case this.AUTH_TYPES.SASL_FINAL:
        this._handleSASLFinal(authData);
        break;
      default:
        this.socket?.emit(
          "authenticationError",
          new Error(`Unsupported authentication type: ${authType}`),
        );
        break;
    }
  }

  _handleMD5Authentication(message: Buffer) {
    const salt = message.slice(0, 4);

    const firstHash = crypto
      .createHash("md5")
      .update(this.password + this.user)
      .digest("hex");

    const secondHash = crypto
      .createHash("md5")
      .update(firstHash + salt.toString("hex"))
      .digest("hex");

    this.socket?.write(createPasswordPacket("md5" + secondHash));
  }

  _handleSASLAuthentication(message: Buffer<ArrayBufferLike>) {
    // Parse mechanisms list (null-terminated strings)
    const mechanisms = [];
    let offset = 0;
    while (offset < message.length && message[offset] !== 0) {
      const mechanism = readCString(message, offset);
      mechanisms.push(mechanism);
      offset += mechanism.length + 1;
    }

    if (mechanisms.includes("SCRAM-SHA-256")) {
      this.scram = startSCRAMSHA256(this.scram, this.user);
      this.socket?.write(
        createSASLInitialResponsePacket(
          "SCRAM-SHA-256",
          this.scram.clientFirstMessage,
        ),
      );
    } else {
      const error = new Error(
        `No supported SASL mechanism. Available: ${mechanisms.join(", ")}`,
      );
      this.socket?.emit("authenticationError", error);
    }
  }

  _handleSASLContinue(message: any) {
    const { state, error } = processSASLContinue(
      this.scram,
      message,
      this.password,
    );
    this.scram = state;

    if (error) {
      this.socket?.emit("authenticationError", error);
      return;
    }

    // Send client final message
    this.socket?.write(
      createPasswordPacket(this.scram.clientFinalMessage, false),
    );
  }

  _handleSASLFinal(message: any) {
    const error = processSASLFinal(this.scram, message);

    if (error) {
      this.socket?.emit("authenticationError", error);
      return;
    }

    this.socket?.emit("authenticated");
  }

  _handleBackendKeyData(message: {
    length: number;
    readInt32BE: (arg0: number) => number;
  }) {
    if (message.length >= 8) {
      this.processId = message.readInt32BE(0);
      this.secretKey = message.readInt32BE(4);
      this.socket?.emit("authenticated");
    }
  }

  _handleReadyForQuery(message: Buffer<ArrayBufferLike>) {
    const status = message.toString("utf8", 0, 1);
    this.readyForQuery = true;
    this.socket?.emit("readyForQuery", status);
  }

  // --- Response and Error Handlers (uses messageParser.js) ---

  _handleErrorResponse(message: Buffer<ArrayBufferLike>) {
    const fields = parseNullTerminatedPairs(message);
    const error: any = new Error(fields.M || "PostgreSQL error");
    error.fields = fields;

    if (this.currentQuery && this.currentQuery.reject) {
      this.currentQuery.reject(error);
      this.currentQuery = null;
    } else {
      this.socket?.emit("authenticationError", error);
      this.socket?.emit("error", error);
    }
  }

  _handleNoticeResponse(message: Buffer<ArrayBufferLike>) {
    const fields = parseNullTerminatedPairs(message);
    console.log("PostgreSQL notice:", fields);
  }

  _handleParameterStatus(message: Buffer<ArrayBufferLike>) {
    const pairs = parseNullTerminatedPairs(message);
    console.log("Parameter status:", pairs);
  }

  _handleQueryResponse(messageType: any, message: any) {
    if (!this.currentQuery || !this.currentQuery.handlers) return;

    const handlers = this.currentQuery.handlers;

    switch (messageType) {
      case this.MESSAGE_TYPES.PARSE_COMPLETE:
        handlers.onParseComplete && handlers.onParseComplete();
        break;
      case this.MESSAGE_TYPES.BIND_COMPLETE:
        handlers.onBindComplete && handlers.onBindComplete();
        break;
      case this.MESSAGE_TYPES.ROW_DESCRIPTION:
        handlers.onRowDescription && handlers.onRowDescription(message);
        break;
      case this.MESSAGE_TYPES.DATA_ROW:
        handlers.onDataRow && handlers.onDataRow(message);
        break;
      case this.MESSAGE_TYPES.COMMAND_COMPLETE:
        handlers.onCommandComplete && handlers.onCommandComplete(message);
        break;
      case this.MESSAGE_TYPES.EMPTY_QUERY_RESPONSE:
        handlers.onEmptyQueryResponse && handlers.onEmptyQueryResponse();
        break;
      case this.MESSAGE_TYPES.NO_DATA:
        handlers.onNoData && handlers.onNoData();
        break;
    }
  }

  // --- Query Method (with queue support) ---

  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    return new Promise((resolve, reject) => {
      this.queryQueue.push({ sql, params, resolve, reject });
      this._processQueue();
    });
  }

  _processQueue() {
    if (
      !this.readyForQuery ||
      this.currentQuery ||
      this.queryQueue.length === 0
    ) {
      return;
    }

    const request = this.queryQueue.shift();
    if (!request) {
      return;
    }

    this.currentQuery = request;
    this.readyForQuery = false;

    const results: any[] = [];
    let fields:
      | {
          name: string;
          tableOID: number;
          columnAttrNum: number;
          dataTypeOID: number;
          dataTypeSize: number;
          typeModifier: number;
          format: number;
        }[]
      | null = null;
    let commandCompleteMessage: Buffer<ArrayBufferLike> | null = null;

    const handlers = {
      onParseComplete: () => {},
      onBindComplete: () => {},
      onRowDescription: (message: Buffer<ArrayBufferLike>) =>
        (fields = parseRowDescription(message)),
      onDataRow: (message: Buffer<ArrayBufferLike>) =>
        results.push(parseDataRow(message, fields)),
      onCommandComplete: (message: any) => (commandCompleteMessage = message),
      onEmptyQueryResponse: () =>
        (commandCompleteMessage = Buffer.from("EMPTY\0", "utf8")),
      onNoData: () => {},
    };

    this.currentQuery.handlers = handlers;

    const timeout = setTimeout(() => {
      if (this.currentQuery) {
        this.currentQuery.reject(new Error("Query timeout"));
        this.currentQuery = null;
        this.readyForQuery = true;
        this._processQueue();
      }
    }, 30000);

    const cleanup = () => {
      clearTimeout(timeout);
      this.socket?.removeListener("readyForQuery", onReadyForQuery);
      this.socket?.removeListener("error", onError);
      this.currentQuery = null;
      this.readyForQuery = true;
    };

    this._sendQuery(request.sql, request.params);

    const onReadyForQuery = (status: string) => {
      if (!this.currentQuery) {
        cleanup();
        this._processQueue();
        return;
      }

      let parsedCommand: any = {
        command: "UNKNOWN",
        rowCount: 0,
        commandTag: "",
        oid: null,
      };

      if (commandCompleteMessage) {
        parsedCommand = parseCommandComplete(commandCompleteMessage);
      } else if (status === "I") {
        parsedCommand.command = "EMPTY";
        parsedCommand.commandTag = "EMPTY";
      }

      const resolver = this.currentQuery.resolve;
      cleanup();

      resolver({
        rows: results,
        fields: fields,
        command: parsedCommand.command,
        rowCount: parsedCommand.rowCount,
        commandTag: parsedCommand.commandTag,
        oid: parsedCommand.oid,
      } as QueryResult);

      this._processQueue();
    };

    const onError = (error: any) => {
      if (this.currentQuery) {
        this.currentQuery.reject(error);
      }
      cleanup();
      this._processQueue();
    };

    this.socket?.once("readyForQuery", onReadyForQuery);
    this.socket?.once("error", onError);
  }

  _sendQuery(sql: string, params: any[] = []) {
    if (params && params.length > 0) {
      // Use extended query protocol for parameterized queries
      this._sendExtendedQuery(sql, params);
    } else {
      // Use simple query protocol for queries without parameters
      this.socket?.write(createSimpleQueryPacket(sql));
    }
  }

  _sendExtendedQuery(sql: string, params: any[]) {
    // Convert parameter values to strings/nulls for text format
    const paramValues: (string | null)[] = params.map((param) => {
      if (param === null || param === undefined) {
        return null;
      }
      if (typeof param === "string") {
        return param;
      }
      if (typeof param === "boolean") {
        return param ? "true" : "false";
      }
      if (typeof param === "number") {
        return param.toString();
      }
      if (typeof param === "object") {
        return JSON.stringify(param);
      }
      return String(param);
    });

    // Send PARSE
    this.socket?.write(createParsePacket("", sql, []));
    // Send BIND
    this.socket?.write(createBindPacket("", "", paramValues));
    // Request row description for portal
    this.socket?.write(createDescribePacket("P", ""));
    // Send EXECUTE
    this.socket?.write(createExecutePacket("", 0));
    // Send SYNC
    this.socket?.write(createSyncPacket());
  }
}

export default PostgreSQLConnection;
