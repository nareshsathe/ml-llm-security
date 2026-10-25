/**
 * asyncHandler.js
 * ----------------
 * Wraps an async Express route handler so any rejected promise (e.g. a
 * MongoDB timeout) is passed to next(err) instead of becoming an unhandled
 * rejection that crashes the whole Node process. Express 4 does NOT do this
 * automatically for async functions — this is the standard fix.
 */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
