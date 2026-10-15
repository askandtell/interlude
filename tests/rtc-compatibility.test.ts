import { describe, expect, it } from 'vitest';
import { canUpdateRtcConfiguration, rtcConnectionError } from '../src/media/rtcCompatibility';

describe('RTC configuration compatibility', () => {
  it('retains the default connection path when native no-op configuration is supported', () => {
    let closed = 0;
    expect(
      canUpdateRtcConfiguration(() => ({
        setConfiguration: (config) => {
          expect(config).toEqual({ iceServers: [] });
        },
        close: () => {
          closed++;
        },
      })),
    ).toBe(true);
    expect(closed).toBe(1);
  });
  it('selects dual-peer initialization on the observed browser error and closes the probe', () => {
    let closed = 0;
    expect(
      canUpdateRtcConfiguration(() => ({
        setConfiguration: () => {
          throw new DOMException(
            'Attempted to modify the PeerConnection configuration in an unsupported way',
            'InvalidModificationError',
          );
        },
        close: () => {
          closed++;
        },
      })),
    ).toBe(false);
    expect(closed).toBe(1);
  });
  it('handles absent or blocked WebRTC without leaking a peer', () => {
    expect(
      canUpdateRtcConfiguration(() => {
        throw new Error('not supported');
      }),
    ).toBe(false);
  });
  it('offers actionable Chinese guidance while preserving the underlying error as a cause', () => {
    const original = new Error("Failed to execute 'setConfiguration' on 'RTCPeerConnection'");
    expect(rtcConnectionError(original).message).toContain('当前浏览器');
    expect(rtcConnectionError(original).cause).toBe(original);
    const other = new Error('other');
    expect(rtcConnectionError(other)).toBe(other);
  });
});
