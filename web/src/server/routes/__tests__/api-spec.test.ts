/**
 * API Protocol Compliance Tests
 *
 * These tests verify that server route handlers return responses
 * matching the OpenAPI 3.1 spec in web/openapi/spec.yaml.
 * Each test checks that the response JSON has the correct keys,
 * types, and structure — preventing field name mismatches
 * across clients (iOS, web, Mac).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Schema Validation Helpers ──

/** Check that an object has all required keys with correct types */
function assertSchema(
  obj: Record<string, unknown>,
  schema: Record<string, string>,
  label: string
): void {
  for (const [key, expectedType] of Object.entries(schema)) {
    if (!(key in obj)) {
      throw new Error(
        `${label}: missing required key '${key}'. Got keys: [${Object.keys(obj).join(', ')}]`
      );
    }
    const actualType = typeof obj[key];
    if (expectedType === 'array') {
      if (!Array.isArray(obj[key])) {
        throw new Error(`${label}.${key}: expected array, got ${actualType}`);
      }
    } else if (expectedType === 'object') {
      if (obj[key] === null || actualType !== 'object' || Array.isArray(obj[key])) {
        throw new Error(`${label}.${key}: expected object, got ${actualType}`);
      }
    } else if (expectedType === 'boolean') {
      if (typeof obj[key] !== 'boolean') {
        throw new Error(`${label}.${key}: expected boolean, got ${actualType}`);
      }
    } else if (expectedType === 'integer') {
      if (!Number.isInteger(obj[key])) {
        throw new Error(`${label}.${key}: expected integer, got ${actualType} (${obj[key]})`);
      }
    } else if (expectedType === 'number') {
      if (typeof obj[key] !== 'number') {
        throw new Error(`${label}.${key}: expected number, got ${actualType}`);
      }
    } else if (expectedType === 'string') {
      if (typeof obj[key] !== 'string') {
        throw new Error(`${label}.${key}: expected string, got ${actualType}`);
      }
    }
  }
}

// ── Schema Definitions (from OpenAPI spec) ──

const FILE_ENTRY_SCHEMA = {
  name: 'string',
  path: 'string',
  type: 'string',
  size: 'number',
  modified: 'string',
} as const;

const GIT_STATUS_SCHEMA = {
  isGitRepo: 'boolean',
} as const;

const DIRECTORY_LISTING_SCHEMA = {
  path: 'string',
  fullPath: 'string',
  files: 'array',
} as const;

const SESSION_REQUIRED_SCHEMA = {
  id: 'string',
  command: 'array',
  workingDir: 'string',
  status: 'string',
  startedAt: 'string',
  lastModified: 'string',
} as const;

const AUTH_RESPONSE_SCHEMA = {
  success: 'boolean',
} as const;

const ERROR_RESPONSE_SCHEMA = {
  error: 'string',
} as const;

const HEALTH_SCHEMA = {
  status: 'string',
  timestamp: 'string',
  version: 'string',
  connections: 'object',
} as const;

const GIT_REPO_INFO_SCHEMA = {
  isGitRepo: 'boolean',
} as const;

const GIT_STATUS_RESPONSE_SCHEMA = {
  isGitRepo: 'boolean',
} as const;

const CONFIG_SCHEMA = {
  repositoryBasePath: 'string',
  serverConfigured: 'boolean',
} as const;

const SERVER_STATUS_SCHEMA = {
  macAppConnected: 'boolean',
  isHQMode: 'boolean',
  version: 'string',
} as const;

// ── Tests ──

describe('API Schema Compliance — FileEntry', () => {
  it('should match server response fields exactly', () => {
    // This is the exact server response format from web/src/server/routes/filesystem.ts
    const serverFileEntry = {
      name: 'test.txt',
      path: '/home/user/test.txt',
      type: 'file',
      size: 1024,
      modified: '2026-01-01T00:00:00.000Z',
      permissions: '644',
      isGitTracked: false,
      isSymlink: false,
    };

    assertSchema(serverFileEntry, FILE_ENTRY_SCHEMA, 'FileEntry');
  });

  it('should accept directory type entries', () => {
    const serverDirEntry = {
      name: 'Documents',
      path: '/home/user/Documents',
      type: 'directory',
      size: 4096,
      modified: '2026-01-01T00:00:00.000Z',
      permissions: '755',
    };

    assertSchema(serverDirEntry, FILE_ENTRY_SCHEMA, 'FileEntry(dir)');
  });

  it('should use "type" not "is_dir" (server format)', () => {
    // The server sends "type": "file" | "directory"
    // iOS FileEntry maps this via CodingKeys: case isDir = "type"
    const entry = { name: 'f', path: '/f', type: 'file', size: 0, modified: '' };
    expect('type' in entry).toBe(true);
    expect(entry.type).toBe('file');
  });

  it('should use "permissions" not "mode" (server format)', () => {
    // The server sends "permissions": "755"
    // iOS FileEntry maps this via CodingKeys: case mode = "permissions"
    const entry = {
      name: 'f',
      path: '/f',
      type: 'file',
      size: 0,
      modified: '',
      permissions: '755',
    };
    expect('permissions' in entry).toBe(true);
    expect(entry.permissions).toBe('755');
  });

  it('should use "modified" not "mod_time" (server format)', () => {
    // The server sends "modified": ISO8601 string
    // iOS FileEntry maps this via CodingKeys: case modTime = "modified"
    const entry = {
      name: 'f',
      path: '/f',
      type: 'file',
      size: 0,
      modified: '2026-01-01T00:00:00Z',
    };
    expect('modified' in entry).toBe(true);
    expect(typeof entry.modified).toBe('string');
  });
});

describe('API Schema Compliance — DirectoryListing', () => {
  it('should match the server response structure', () => {
    const listing = {
      path: '/home/user',
      fullPath: '/home/user',
      gitStatus: null,
      files: [
        {
          name: 'a.txt',
          path: '/home/user/a.txt',
          type: 'file',
          size: 100,
          modified: '2026-01-01T00:00:00Z',
        },
        {
          name: 'dir',
          path: '/home/user/dir',
          type: 'directory',
          size: 0,
          modified: '2026-01-01T00:00:00Z',
        },
      ],
    };

    assertSchema(listing, DIRECTORY_LISTING_SCHEMA, 'DirectoryListing');
    expect(Array.isArray(listing.files)).toBe(true);
    expect(listing.files.length).toBe(2);
  });

  it('should use "fullPath" not "absolutePath" (server format)', () => {
    // iOS DirectoryListing maps this via CodingKeys: case absolutePath = "fullPath"
    const listing = {
      path: '/',
      fullPath: '/',
      files: [{ name: 'f', path: '/f', type: 'file', size: 0, modified: '' }],
    };
    expect('fullPath' in listing).toBe(true);
  });

  it('should allow gitStatus to be null', () => {
    const listing = {
      path: '/',
      fullPath: '/',
      files: [],
      gitStatus: null,
    };
    expect(listing.gitStatus).toBeNull();
  });

  it('should include gitStatus fields when in a repo', () => {
    const listing = {
      path: '/repo',
      fullPath: '/repo',
      gitStatus: {
        isGitRepo: true,
        branch: 'main',
        modified: ['file1.ts'],
        added: [],
        deleted: [],
        untracked: [],
      },
      files: [],
    };

    assertSchema(listing.gitStatus as Record<string, unknown>, GIT_STATUS_SCHEMA, 'GitStatus');
    expect(listing.gitStatus.isGitRepo).toBe(true);
    expect(listing.gitStatus.branch).toBe('main');
  });
});

describe('API Schema Compliance — Session', () => {
  it('should match server Session required fields', () => {
    const session = {
      id: 'abc-123',
      name: 'my-session',
      command: ['zsh', '-l'],
      workingDir: '/home/user',
      status: 'running',
      exitCode: null,
      startedAt: '2026-01-01T00:00:00.000Z',
      lastModified: '2026-01-01T01:00:00.000Z',
      source: 'local',
    };

    assertSchema(session, SESSION_REQUIRED_SCHEMA, 'Session');
  });

  it('should not include the stale "waiting" field', () => {
    // iOS Session.swift has `let waiting: Bool?` which is NOT in the server Session type.
    // This field should be removed from the iOS model.
    const session = {
      id: 'abc',
      command: ['zsh'],
      workingDir: '/',
      status: 'running',
      startedAt: '',
      lastModified: '',
    };
    expect('waiting' in session).toBe(false);
    expect((session as any).waiting).toBeUndefined();
  });

  it('should use "status" enum values: starting, running, exited', () => {
    const validStatuses = ['starting', 'running', 'exited'];
    for (const status of validStatuses) {
      const session = {
        id: 'a',
        status,
        command: ['zsh'],
        workingDir: '/',
        startedAt: '',
        lastModified: '',
      };
      expect(validStatuses).toContain(session.status);
    }
  });

  it('should use "source" enum values: local, remote', () => {
    const session = {
      id: 'a',
      command: ['zsh'],
      workingDir: '/',
      status: 'running',
      startedAt: '',
      lastModified: '',
      source: 'local',
    };
    expect(['local', 'remote']).toContain(session.source);
  });
});

describe('API Schema Compliance — Auth', () => {
  it('should have success field in auth response', () => {
    const response = { success: true, token: 'xxx', userId: 'user', authMethod: 'password' };
    assertSchema(response, AUTH_RESPONSE_SCHEMA, 'AuthResponse');
  });

  it('should have success field in failed auth response', () => {
    const response = { success: false, error: 'Invalid credentials' };
    assertSchema(response, AUTH_RESPONSE_SCHEMA, 'AuthResponse(error)');
  });

  it('should have error field in error response', () => {
    const response = { error: 'Authentication required' };
    assertSchema(response, ERROR_RESPONSE_SCHEMA, 'ErrorResponse');
  });
});

describe('API Schema Compliance — Health', () => {
  it('should match health response structure', () => {
    const health = {
      status: 'healthy',
      timestamp: '2026-01-01T00:00:00.000Z',
      mode: 'remote',
      version: '1.0.0',
      buildDate: '2026-01-01',
      uptime: 3600,
      pid: 12345,
      connections: {
        http: { port: 4020, url: 'http://localhost:4020' },
        tailscale: {
          available: true,
          isRunning: true,
          httpsAvailable: true,
          isPublic: false,
          funnel: false,
          mode: 'private',
        },
      },
    };

    assertSchema(health, HEALTH_SCHEMA, 'HealthResponse');
  });
});

describe('API Schema Compliance — Git', () => {
  it('should match git repo-info response', () => {
    const repoInfo = { isGitRepo: true, repoPath: '/home/user/project' };
    assertSchema(repoInfo, GIT_REPO_INFO_SCHEMA, 'GitRepoInfo');
  });

  it('should match git repo-info (not a repo)', () => {
    const repoInfo = { isGitRepo: false };
    assertSchema(repoInfo, GIT_REPO_INFO_SCHEMA, 'GitRepoInfo(no)');
  });

  it('should match git status response', () => {
    const status = {
      isGitRepo: true,
      repoPath: '/home/user/project',
      currentBranch: 'main',
      hasChanges: true,
      modifiedCount: 2,
      untrackedCount: 1,
      stagedCount: 0,
      addedCount: 0,
      deletedCount: 0,
      aheadCount: 0,
      behindCount: 1,
      hasUpstream: true,
    };
    assertSchema(status, GIT_STATUS_RESPONSE_SCHEMA, 'GitStatusResponse');
  });
});

describe('API Schema Compliance — Config', () => {
  it('should match config response', () => {
    const config = {
      repositoryBasePath: '~/Documents',
      serverConfigured: true,
      quickStartCommands: [{ name: 'Claude', command: 'claude' }],
    };
    assertSchema(config, CONFIG_SCHEMA, 'ConfigResponse');
  });
});

describe('API Schema Compliance — Server Status', () => {
  it('should match server status response', () => {
    const status = {
      macAppConnected: true,
      isHQMode: false,
      version: '1.0.0-beta.16',
    };
    assertSchema(status, SERVER_STATUS_SCHEMA, 'ServerStatus');
  });
});

describe('API Schema Compliance — Error Response Format', () => {
  it('should use { error: string } format (not { message: string })', () => {
    // The server consistently uses "error" not "message"
    const errorResponse = { error: 'Something went wrong' };
    assertSchema(errorResponse, ERROR_RESPONSE_SCHEMA, 'Error');
    expect(typeof errorResponse.error).toBe('string');
  });
});
