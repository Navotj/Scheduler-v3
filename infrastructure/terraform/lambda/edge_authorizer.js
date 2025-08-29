exports.handler = async (event) => {
  const headers = (event && event.headers) ? event.headers : {};
  const provided =
    headers["x-edge-secret"] ||
    headers["X-Edge-Secret"] ||
    headers["X-EDGE-SECRET"];

  const expected = process.env.EDGE_SECRET;
  const ok = Boolean(provided) && Boolean(expected) && provided === expected;

  return {
    isAuthorized: ok,
    context: { reason: ok ? "ok" : "missing_or_bad_edge_secret" }
  };
};
