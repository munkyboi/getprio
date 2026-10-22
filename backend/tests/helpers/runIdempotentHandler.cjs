function runIdempotentHandler(middleware, handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body: JSON.parse(JSON.stringify(body)) }); return this; }
    };
    const errors = require('../../src/middleware/errorHandler');
    middleware(req, res, error => {
      if (error) return reject(error);
      Promise.resolve().then(() => handler(req, res)).catch(failure => errors(failure, req, res, reject));
    });
  });
}
module.exports = { runIdempotentHandler };
