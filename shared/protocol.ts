import { z } from 'zod';
import { websiteSource } from './website';
export const nicknameSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .refine((v) => !/[\u0000-\u001f\u007f<>]/.test(v), '昵称含不支持的字符');
export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{16,64}$/);
export const createSchema = z
  .object({ nickname: nicknameSchema, title: z.string().trim().min(1).max(48) })
  .strict();
export const joinSchema = z
  .object({ nickname: nicknameSchema, invite: z.string().min(32).max(128) })
  .strict();
export const commandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('play') }),
  z.object({ kind: z.literal('pause') }),
  z.object({ kind: z.literal('seek'), position: z.number().finite().min(0).max(864000) }),
  z.object({
    kind: z.literal('source'),
    title: z.string().min(1).max(180),
    duration: z.number().finite().positive().max(864000),
  }),
  z
    .object({
      kind: z.literal('website'),
      url: z
        .string()
        .max(2048)
        .transform((v, ctx) => {
          try {
            return websiteSource(v).url;
          } catch (e) {
            ctx.addIssue({ code: 'custom', message: (e as Error).message });
            return z.NEVER;
          }
        }),
    })
    .strict(),
  z.object({ kind: z.literal('stop') }),
  z.object({ kind: z.literal('ended') }),
]);
export const envelopeSchema = z
  .object({
    id: z.string().uuid(),
    roomId: idSchema,
    epoch: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    command: commandSchema,
  })
  .strict();
export type PlaybackCommand = z.infer<typeof commandSchema>;
export type CommandEnvelope = z.infer<typeof envelopeSchema>;
export type ViewingState = 'not-ready' | 'ready' | 'watching' | 'blocked' | 'buffering';
export interface MemberView {
  id: string;
  nickname: string;
  status: 'pending' | 'approved' | 'denied' | 'banned';
  online: boolean;
  viewing: ViewingState;
}
export interface ChatMessage {
  id: string;
  memberId: string;
  nickname: string;
  text: string;
  at: number;
  type: 'chat' | 'pause-request';
}
export interface PlaybackState {
  kind: 'none' | 'local' | 'website';
  website?: { provider: string; url: string };
  title: string;
  duration: number;
  position: number;
  paused: boolean;
  updatedAt: number;
  available: boolean;
}
export interface RoomView {
  id: string;
  title: string;
  hostId: string;
  selfId: string;
  selfStatus: MemberView['status'];
  protocolVersion: 2;
  revision: number;
  mediaEpoch: number;
  closed: boolean;
  createdAt: number;
  hostState: 'online' | 'reconnecting' | 'waiting';
  members: MemberView[];
  pending: MemberView[];
  playback: PlaybackState;
  chat: ChatMessage[];
  serverNow: number;
}
export interface Ack<T = RoomView> {
  ok: boolean;
  value?: T;
  error?: string;
  code?: string;
}

export const viewingSchema = z
  .object({
    epoch: z.number().int().nonnegative(),
    state: z.enum(['not-ready', 'ready', 'watching', 'blocked', 'buffering']),
    duration: z.number().finite().positive().max(864000).optional(),
  })
  .strict();
