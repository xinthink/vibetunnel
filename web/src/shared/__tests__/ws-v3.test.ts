import { describe, expect, it } from 'vitest';
import {
  decodeWsV3Frame,
  decodeWsV3ResizePayload,
  decodeWsV3SubscribePayload,
  encodeWsV3Frame,
  encodeWsV3ResizePayload,
  encodeWsV3SubscribePayload,
  WS_V3_MAGIC,
  WS_V3_VERSION,
  WsV3MessageType,
  WsV3SubscribeFlags,
} from '../ws-v3';

describe('ws-v3 constants', () => {
  it('should have magic bytes "VT" in LE (0x5654)', () => {
    expect(WS_V3_MAGIC).toBe(0x5654);
  });

  it('should use protocol version 3', () => {
    expect(WS_V3_VERSION).toBe(3);
  });

  it('should define all message types with unique values', () => {
    const types = Object.values(WsV3MessageType).filter((v): v is number => typeof v === 'number');
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
  });

  it('should match the iOS client message type values', () => {
    // Values must match ios/VibeTunnel/Services/BufferWebSocketClient.swift V3Type enum
    expect(WsV3MessageType.HELLO).toBe(1);
    expect(WsV3MessageType.WELCOME).toBe(2);
    expect(WsV3MessageType.SUBSCRIBE).toBe(10);
    expect(WsV3MessageType.UNSUBSCRIBE).toBe(11);
    expect(WsV3MessageType.STDOUT).toBe(20);
    expect(WsV3MessageType.SNAPSHOT_VT).toBe(21);
    expect(WsV3MessageType.EVENT).toBe(22);
    expect(WsV3MessageType.ERROR).toBe(23);
    expect(WsV3MessageType.INPUT_TEXT).toBe(30);
    expect(WsV3MessageType.INPUT_KEY).toBe(31);
    expect(WsV3MessageType.RESIZE).toBe(32);
    expect(WsV3MessageType.KILL).toBe(33);
    expect(WsV3MessageType.RESET_SIZE).toBe(34);
    expect(WsV3MessageType.PING).toBe(40);
    expect(WsV3MessageType.PONG).toBe(41);
  });

  it('should match subscribe flag values with iOS client', () => {
    // Values must match ios/VibeTunnel/Services/BufferWebSocketClient.swift V3SubscribeFlags
    expect(WsV3SubscribeFlags.Stdout).toBe(1);
    expect(WsV3SubscribeFlags.Snapshots).toBe(2);
    expect(WsV3SubscribeFlags.Events).toBe(4);
  });
});

describe('ws-v3 frame encode/decode', () => {
  it('should round-trip a frame with session ID and payload', () => {
    const payload = new TextEncoder().encode('hello world');
    const encoded = encodeWsV3Frame({
      type: WsV3MessageType.STDOUT,
      sessionId: 'test-session-1',
      payload,
    });
    const decoded = decodeWsV3Frame(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.type).toBe(WsV3MessageType.STDOUT);
    expect(decoded!.sessionId).toBe('test-session-1');
    expect(new TextDecoder().decode(decoded!.payload)).toBe('hello world');
  });

  it('should round-trip every message type', () => {
    const types = Object.values(WsV3MessageType).filter((v): v is number => typeof v === 'number');

    for (const type of types) {
      const encoded = encodeWsV3Frame({
        type,
        sessionId: 's1',
        payload: new Uint8Array([1, 2, 3]),
      });
      const decoded = decodeWsV3Frame(encoded);
      expect(decoded!.type).toBe(type);
    }
  });

  it('should handle empty session ID', () => {
    const encoded = encodeWsV3Frame({
      type: WsV3MessageType.PING,
    });
    const decoded = decodeWsV3Frame(encoded);
    expect(decoded!.sessionId).toBe('');
  });

  it('should handle empty payload', () => {
    const encoded = encodeWsV3Frame({
      type: WsV3MessageType.PONG,
      sessionId: 's1',
    });
    const decoded = decodeWsV3Frame(encoded);
    expect(decoded!.payload.length).toBe(0);
  });

  it('should handle Unicode session IDs', () => {
    const encoded = encodeWsV3Frame({
      type: WsV3MessageType.SUBSCRIBE,
      sessionId: 'сессия-тест',
    });
    const decoded = decodeWsV3Frame(encoded);
    expect(decoded!.sessionId).toBe('сессия-тест');
  });

  it('should handle large payload (1MB)', () => {
    const payload = new Uint8Array(1_000_000);
    // Fill with some data to avoid all-zero optimisation
    for (let i = 0; i < payload.length; i++) payload[i] = i % 256;
    const encoded = encodeWsV3Frame({
      type: WsV3MessageType.SNAPSHOT_VT,
      sessionId: 'large',
      payload,
    });
    const decoded = decodeWsV3Frame(encoded);
    expect(decoded!.payload.length).toBe(1_000_000);
    expect(decoded!.payload[0]).toBe(0);
    expect(decoded!.payload[500_000]).toBe(500_000 % 256);
  });
});

describe('ws-v3 frame decode — error handling', () => {
  it('should return null for data shorter than minimum header (12 bytes)', () => {
    const tooShort = new Uint8Array(11);
    expect(decodeWsV3Frame(tooShort)).toBeNull();
  });

  it('should return null for wrong magic bytes', () => {
    const encoded = encodeWsV3Frame({
      type: WsV3MessageType.PING,
      sessionId: 'test',
    });
    // Corrupt magic bytes
    encoded[0] = 0x00;
    encoded[1] = 0x00;
    expect(decodeWsV3Frame(encoded)).toBeNull();
  });

  it('should return null for wrong version', () => {
    const encoded = encodeWsV3Frame({
      type: WsV3MessageType.PING,
      sessionId: 'test',
    });
    // Corrupt version byte (offset 2)
    encoded[2] = 0xff;
    expect(decodeWsV3Frame(encoded)).toBeNull();
  });

  it('should return null when sessionIdLen exceeds data', () => {
    const encoded = encodeWsV3Frame({
      type: WsV3MessageType.PING,
      sessionId: 'test',
    });
    // Corrupt sessionIdLen to claim it's huge
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    view.setUint32(4, 999999, true);
    expect(decodeWsV3Frame(encoded)).toBeNull();
  });

  it('should return null when payloadLen exceeds data', () => {
    const encoded = encodeWsV3Frame({
      type: WsV3MessageType.STDOUT,
      sessionId: 'test',
      payload: new Uint8Array([1, 2, 3]),
    });
    // Corrupt payloadLen to claim it's huge
    const headerOffset = 2 + 1 + 1 + 4 + 4; // after sessionId (4 bytes)
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    view.setUint32(headerOffset, 999999, true);
    expect(decodeWsV3Frame(encoded)).toBeNull();
  });

  it('should handle frame with exactly the right size', () => {
    const encoded = encodeWsV3Frame({
      type: WsV3MessageType.INPUT_TEXT,
      sessionId: 's',
      payload: new Uint8Array([42]),
    });
    expect(decodeWsV3Frame(encoded)).not.toBeNull();
  });

  it('should handle frame with extra data after payload', () => {
    const encoded = encodeWsV3Frame({
      type: WsV3MessageType.INPUT_TEXT,
      sessionId: 's',
      payload: new Uint8Array([42]),
    });
    // Append extra bytes
    const withExtra = new Uint8Array(encoded.length + 5);
    withExtra.set(encoded);
    const decoded = decodeWsV3Frame(withExtra);
    expect(decoded).not.toBeNull();
    expect(decoded!.payload.length).toBe(1);
  });
});

describe('ws-v3 subscribe payload', () => {
  it('should round-trip subscribe flags and intervals', () => {
    const encoded = encodeWsV3SubscribePayload({
      flags: WsV3SubscribeFlags.Stdout | WsV3SubscribeFlags.Snapshots,
      snapshotMinIntervalMs: 100,
      snapshotMaxIntervalMs: 1000,
    });
    const decoded = decodeWsV3SubscribePayload(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.flags).toBe(3); // Stdout | Snapshots = 1 | 2 = 3
    expect(decoded!.snapshotMinIntervalMs).toBe(100);
    expect(decoded!.snapshotMaxIntervalMs).toBe(1000);
  });

  it('should handle all subscribe flags combined', () => {
    const encoded = encodeWsV3SubscribePayload({
      flags: WsV3SubscribeFlags.Stdout | WsV3SubscribeFlags.Snapshots | WsV3SubscribeFlags.Events,
    });
    const decoded = decodeWsV3SubscribePayload(encoded);
    expect(decoded!.flags).toBe(7); // 1 | 2 | 4 = 7
  });

  it('should handle default intervals (0)', () => {
    const encoded = encodeWsV3SubscribePayload({ flags: 0 });
    const decoded = decodeWsV3SubscribePayload(encoded);
    expect(decoded!.snapshotMinIntervalMs).toBe(0);
    expect(decoded!.snapshotMaxIntervalMs).toBe(0);
  });

  it('should return null for payload smaller than 12 bytes', () => {
    const tooShort = new Uint8Array(11);
    expect(decodeWsV3SubscribePayload(tooShort)).toBeNull();
  });

  it('should match iOS client subscribe flags', () => {
    // iOS uses: flags = snapshots.rawValue | events.rawValue
    // snapshots = 2, events = 4 → flags = 6
    const iosFlags = WsV3SubscribeFlags.Snapshots | WsV3SubscribeFlags.Events;
    expect(iosFlags).toBe(6);

    const encoded = encodeWsV3SubscribePayload({ flags: iosFlags });
    const decoded = decodeWsV3SubscribePayload(encoded);
    expect(decoded!.flags).toBe(6);
  });
});

describe('ws-v3 resize payload', () => {
  it('should round-trip cols and rows', () => {
    const encoded = encodeWsV3ResizePayload(120, 40);
    const decoded = decodeWsV3ResizePayload(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.cols).toBe(120);
    expect(decoded!.rows).toBe(40);
  });

  it('should handle large terminal dimensions', () => {
    const encoded = encodeWsV3ResizePayload(500, 200);
    const decoded = decodeWsV3ResizePayload(encoded);
    expect(decoded!.cols).toBe(500);
    expect(decoded!.rows).toBe(200);
  });

  it('should handle zero dimensions (edge case)', () => {
    const encoded = encodeWsV3ResizePayload(0, 0);
    const decoded = decodeWsV3ResizePayload(encoded);
    expect(decoded!.cols).toBe(0);
    expect(decoded!.rows).toBe(0);
  });

  it('should return null for payload smaller than 8 bytes', () => {
    const tooShort = new Uint8Array(7);
    expect(decodeWsV3ResizePayload(tooShort)).toBeNull();
  });
});

describe('ws-v3 cross-platform frame layout', () => {
  it('should start frame with magic bytes 0x56, 0x54 in LE order', () => {
    const encoded = encodeWsV3Frame({
      type: WsV3MessageType.HELLO,
      sessionId: 'test',
    });
    // Little-endian: [0x54, 0x56]
    expect(encoded[0]).toBe(0x54);
    expect(encoded[1]).toBe(0x56);
  });

  it('should place version at offset 2', () => {
    const encoded = encodeWsV3Frame({
      type: WsV3MessageType.HELLO,
      sessionId: 'test',
    });
    expect(encoded[2]).toBe(3);
  });

  it('should place type at offset 3', () => {
    const encoded = encodeWsV3Frame({
      type: WsV3MessageType.PING,
      sessionId: 'test',
    });
    expect(encoded[3]).toBe(40);
  });

  it('should match the documented frame layout byte-for-byte', () => {
    // Frame: magic(2) + version(1) + type(1) + sessionIdLen(4) + sessionId + payloadLen(4) + payload
    const payload = new Uint8Array([0xaa, 0xbb, 0xcc]);
    const encoded = encodeWsV3Frame({
      type: WsV3MessageType.KILL,
      sessionId: 'ab',
      payload,
    });

    // Byte 0-1: magic = 0x5654 LE → [0x54, 0x56]
    expect(encoded[0]).toBe(0x54);
    expect(encoded[1]).toBe(0x56);
    // Byte 2: version = 3
    expect(encoded[2]).toBe(3);
    // Byte 3: type = KILL (33)
    expect(encoded[3]).toBe(33);
    // Byte 4-7: sessionIdLen = 2 (LE: [2,0,0,0])
    expect(encoded[4]).toBe(2);
    expect(encoded[5]).toBe(0);
    expect(encoded[6]).toBe(0);
    expect(encoded[7]).toBe(0);
    // Byte 8-9: sessionId "ab" → [0x61, 0x62]
    expect(encoded[8]).toBe(0x61); // 'a'
    expect(encoded[9]).toBe(0x62); // 'b'
    // Byte 10-13: payloadLen = 3 (LE: [3,0,0,0])
    expect(encoded[10]).toBe(3);
    expect(encoded[11]).toBe(0);
    expect(encoded[12]).toBe(0);
    expect(encoded[13]).toBe(0);
    // Byte 14-16: payload = [0xAA, 0xBB, 0xCC]
    expect(encoded[14]).toBe(0xaa);
    expect(encoded[15]).toBe(0xbb);
    expect(encoded[16]).toBe(0xcc);
  });
});
