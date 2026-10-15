import { describe, expect, it } from 'vitest';
import { Sessions, RateLimits } from '../server/security';
import { envelopeSchema, nicknameSchema } from '../shared/protocol';
import { parseSubtitles } from '../src/media/subtitles';
describe('session and input boundaries', () => {
  it('rejects a forged or expired session', () => { let now=Date.now();const s=new Sessions('test-key',()=>now), token=s.create(); expect(s.read(`interlude=${token}`)).toBe(token); expect(s.read(`interlude=${token}x`)).toBeUndefined(); now+=7*86400000+1; expect(s.read(`interlude=${token}`)).toBeUndefined(); });
  it('binds the CSRF nonce to the authenticated session', () => {const s=new Sessions('test-key');expect(s.csrf(s.create())).not.toBe(s.csrf(s.create()));});
  it('enforces a request window and releases it after expiry',()=>{let now=0;const l=new RateLimits(()=>now);l.take('key',1,1000);expect(()=>l.take('key',1,1000)).toThrow();now=1001;expect(()=>l.take('key',1,1000)).not.toThrow();});
  it('rejects invalid numbers, excessive input and client role injection',()=>{expect(nicknameSchema.safeParse('<script>').success).toBe(false);expect(nicknameSchema.safeParse('a'.repeat(25)).success).toBe(false);expect(envelopeSchema.safeParse({id:'bad',roomId:'a'.repeat(22),epoch:0,revision:0,role:'host',command:{kind:'seek',position:NaN}}).success).toBe(false);});
});
describe('bounded plain text subtitles',()=>{
  it('parses SRT and VTT into the same media timeline',()=>{expect(parseSubtitles('1\r\n00:00:01,000 --> 00:00:02,500\r\n你好')[0]).toEqual({start:1,end:2.5,text:'你好'});expect(parseSubtitles('WEBVTT\n\n00:01.000 --> 00:02.000 align:center\nworld')[0].start).toBe(1);});
  it('never preserves HTML or ASS commands for execution',()=>{const [cue]=parseSubtitles('1\n00:00:01,000 --> 00:00:02,000\n<b>hello</b><img src=x onerror=alert(1)>{\\an8}');expect(cue.text).toBe('hello');});
  it('rejects oversized, invalid and empty subtitles',()=>{expect(()=>parseSubtitles('a'.repeat(1048577))).toThrow();expect(()=>parseSubtitles('00:00:02,000 --> 00:00:01,000\nbackwards')).toThrow();});
  it('rejects excessive cue counts',()=>{expect(()=>parseSubtitles(Array.from({length:10001},(_,i)=>`${i}\n00:00:01,000 --> 00:00:02,000\ntext`).join('\n\n'))).toThrow();});
});
