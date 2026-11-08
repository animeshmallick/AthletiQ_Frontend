/**
 * jsdom environment plus the WHATWG fetch primitives Node already provides (Response, Headers…),
 * which jsdom does not expose.
 */
const { TestEnvironment } = require('jest-environment-jsdom');

const NODE_GLOBALS = [
  'fetch',
  'Response',
  'Request',
  'Headers',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'TextEncoder',
  'TextDecoder',
  'structuredClone',
  'BroadcastChannel',
];

class JsdomWithFetch extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    for (const key of NODE_GLOBALS) {
      if (this.global[key] === undefined && globalThis[key] !== undefined)
        this.global[key] = globalThis[key];
    }
    // Node's Request only accepts Node's AbortSignal (React Router creates Requests with signals).
    this.global.AbortController = globalThis.AbortController;
    this.global.AbortSignal = globalThis.AbortSignal;
  }
}

module.exports = JsdomWithFetch;
