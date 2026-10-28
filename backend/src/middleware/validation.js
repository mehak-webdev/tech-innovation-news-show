/**
 * Request parameter and body validation middlewares.
 * Returns consistent HTTP 400 Bad Request responses for malformed or malicious inputs.
 */

/**
 * Validates that a route param (e.g. :id) is a positive integer.
 */
export function validateIdParam(paramName = 'id') {
  return (req, res, next) => {
    const rawVal = req.params[paramName];
    if (!rawVal || !/^\d+$/.test(rawVal) || parseInt(rawVal, 10) <= 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid '${paramName}' parameter. Must be a positive integer.`
      });
    }
    req.params[paramName] = parseInt(rawVal, 10);
    next();
  };
}

/**
 * Validates the processing batch limit (between 1 and 20).
 */
export function validateProcessLimit(req, res, next) {
  const rawLimit = req.query.limit || req.body?.limit;
  if (rawLimit !== undefined && rawLimit !== null && rawLimit !== '') {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid limit parameter. Must be an integer between 1 and 20.'
      });
    }
    req.validatedLimit = parsed;
  } else {
    req.validatedLimit = 3; // Default batch limit
  }
  next();
}

/**
 * Validates the listener question in RAG Q&A requests.
 */
export function validateAskQuestion(req, res, next) {
  const { question } = req.body || {};
  if (typeof question !== 'string') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Question must be provided as a string in the request body.'
    });
  }

  const trimmed = question.trim();
  if (trimmed.length === 0) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Question cannot be empty.'
    });
  }

  if (trimmed.length > 250) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Question exceeds the maximum length of 250 characters (received ${trimmed.length} characters).`
    });
  }

  req.body.question = trimmed;
  next();
}

/**
 * Validates optional query parameters for article listing.
 */
export function validateArticlesQuery(req, res, next) {
  const { sort, status } = req.query;

  if (sort && !['latest', 'importance'].includes(sort)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: "Invalid 'sort' query parameter. Allowed values are 'latest' or 'importance'."
    });
  }

  if (status && !['all', 'completed', 'pending', 'failed'].includes(status)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: "Invalid 'status' query parameter. Allowed values are 'all', 'completed', 'pending', or 'failed'."
    });
  }

  next();
}

