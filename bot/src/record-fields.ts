export interface StageIdentity { stage: string; repeat?: number; retry: number }
export interface HashedPath { path: string; sha256: string }

export function stageFields<E extends string>(ts: string, event: E, identity: StageIdentity) {
  return { ts, event, stage: identity.stage,
    ...(identity.repeat === undefined ? {} : { repeat: identity.repeat }), retry: identity.retry };
}
