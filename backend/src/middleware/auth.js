import crypto from 'crypto';

/**
 * Middleware to enforce operator authentication on privileged/expensive routes.
 *
 * Requirements:
 * - Reads expected key from environment: OPERATOR_API_KEY
 * - Inspects header: X-Operator-Key
 * - Fails closed: if OPERATOR_API_KEY is not configured or blank, all protected routes return 401
 * - Uses constant-time buffer comparison (crypto.timingSafeEqual) to prevent timing attacks
 * - Never logs key values to stdout, stderr, or response payloads
 */
export function requireOperatorAuth(req, res, next) {
  const expectedKey = process.env.OPERATOR_API_KEY;

  // Fail closed if the server does not have an operator key configured
  if (!expectedKey || typeof expectedKey !== 'string' || expectedKey.trim().length === 0) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Operator authentication is not configured on the server. Access is denied.'
    });
  }

  const providedKey = req.header('x-operator-key');
  if (!providedKey || typeof providedKey !== 'string') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing required header: X-Operator-Key'
    });
  }

  // Use timingSafeEqual to avoid timing side-channel leaks
  const expectedBuf = Buffer.from(expectedKey.trim());
  const providedBuf = Buffer.from(providedKey.trim());

  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid operator credentials provided'
    });
  }

  next();
}

