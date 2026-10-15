import { z } from 'zod';
import { idSchema } from './protocol';
export const DIRECT_LIMIT = 3;
export const peerEpochSchema = z
  .object({ epoch: z.number().int().nonnegative(), mediaEpoch: z.number().int().nonnegative() })
  .strict();
export const peerReadySchema = peerEpochSchema.extend({ nonce: z.string().uuid() }).strict();
export const peerSignalSchema = peerEpochSchema
  .extend({
    target: idSchema,
    linkId: z.string().min(73).max(73),
    description: z
      .object({ type: z.enum(['offer', 'answer']), sdp: z.string().min(1).max(12000) })
      .strict()
      .optional(),
    candidate: z
      .object({
        candidate: z.string().max(2048),
        sdpMid: z.string().max(16).nullable().optional(),
        sdpMLineIndex: z.number().int().min(0).max(8).nullable().optional(),
        usernameFragment: z.string().max(256).nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => !!v.description !== !!v.candidate, 'Exactly one signal payload is required');
export type PeerSignal = z.infer<typeof peerSignalSchema>;
export interface PeerRoster {
  roomId: string;
  epoch: number;
  mediaEpoch: number;
  members: { id: string; nonce: string }[];
}
export interface IncomingPeerSignal extends Omit<PeerSignal, 'target'> {
  from: string;
}
export interface Delivery {
  mode: 'direct' | 'relay';
  reason: 'small-room' | 'size' | 'direct-failed' | 'manual' | 'legacy';
  resume: boolean;
  since: number;
}
