/**
 * Response validation middleware for API schema compliance.
 *
 * In dev mode, validates API responses against expected JSON shapes
 * and logs warnings on field name mismatches, missing required keys,
 * or unexpected types. Helps catch client/server schema drift.
 *
 * Skipped in production for performance.
 */

import type { NextFunction, Request, Response } from 'express';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('validate');

type Schema = Record<string, string>;

const schemas: Record<string, Schema> = {
  '/api/fs/browse': {
    path: 'string',
    fullPath: 'string',
    files: 'array',
  },
  '/api/git/repo-info': {
    isGitRepo: 'boolean',
  },
  '/api/git/status': {
    isGitRepo: 'boolean',
  },
  '/api/git/remote': {
    isGitRepo: 'boolean',
  },
  '/api/git/repository-info': {
    isGitRepo: 'boolean',
  },
  '/api/auth/password': {
    success: 'boolean',
  },
  '/api/auth/tailscale-token': {
    success: 'boolean',
  },
  '/api/auth/config': {
    enableSSHKeys: 'boolean',
    disallowUserPassword: 'boolean',
    noAuth: 'boolean',
  },
  '/api/auth/verify': {
    valid: 'boolean',
  },
  '/api/config': {
    repositoryBasePath: 'string',
    serverConfigured: 'boolean',
  },
  '/api/health': {
    status: 'string',
    timestamp: 'string',
    version: 'string',
    connections: 'object',
  },
  '/api/server/status': {
    macAppConnected: 'boolean',
    isHQMode: 'boolean',
    version: 'string',
  },
};

function canValidate(req: Request): boolean {
  return (
    req.method === 'GET' ||
    req.method === 'POST' ||
    req.method === 'PUT' ||
    req.method === 'DELETE' ||
    req.method === 'PATCH'
  );
}

function matchSchema(path: string): Schema | undefined {
  return schemas[path];
}

export function createValidateMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!canValidate(req) || process.env.NODE_ENV === 'production') {
      return next();
    }

    const schema = matchSchema(req.path);
    if (!schema) return next();

    // Capture the original json() to intercept the response
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const obj = body as Record<string, unknown>;

        for (const [key, expectedType] of Object.entries(schema)) {
          if (!(key in obj)) {
            logger.warn(
              `Schema drift on ${req.method} ${req.path}: missing key '${key}'. ` +
                `Expected keys: [${Object.keys(schema).join(', ')}]. ` +
                `Got keys: [${Object.keys(obj).join(', ')}]`
            );
          } else {
            const actualType = typeof obj[key];
            const typeMatches =
              expectedType === 'array'
                ? Array.isArray(obj[key])
                : expectedType === 'object'
                  ? obj[key] !== null && actualType === 'object' && !Array.isArray(obj[key])
                  : actualType === expectedType;

            if (!typeMatches) {
              logger.warn(
                `Schema drift on ${req.method} ${req.path}.${key}: ` +
                  `expected ${expectedType}, got ${obj[key] === null ? 'null' : actualType}`
              );
            }
          }
        }
      }

      return originalJson(body);
    };

    next();
  };
}
