// replace function (handler)
exports.handler = async (event) => {
  const headers = (event && event.headers) ? event.headers : {};
  const provided =
    headers["x-origin-verify"] ||
    headers["X-Origin-Verify"] ||
    headers["X-ORIGIN-VERIFY"];

  const expected = process.env.ORIGIN_VERIFY_SECRET;
  const ok = Boolean(provided) && Boolean(expected) && provided === expected;

  return {
    isAuthorized: ok,
    context: { reason: ok ? "ok" : "missing_or_bad_origin_verify" }
  };
};
