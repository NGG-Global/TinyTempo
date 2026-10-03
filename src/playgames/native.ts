import { registerPlugin } from '@capacitor/core';

import {
  NOT_SHOWN, NOT_SUBMITTED, NOT_UNLOCKED, SIGNED_OUT, SNAPSHOT_FAILED,
  type AchievementUnlock, type LeaderboardReason, type LeaderboardView, type PlayGamesClient, type PlayGamesStatus, type ScoreSubmission,
  type SnapshotConflict, type SnapshotPayload, type SnapshotRead, type SnapshotReason, type SnapshotResolution, type SnapshotWrite, type SubmitReason,
} from './playGames';

/** A snapshot's bytes cross the bridge as base64; the plugin never sees the text. */
interface SnapshotOptions { data: string; description: string; progress: number }

interface PlayGamesPlugin {
  isAuthenticated(): Promise<unknown>;
  signIn(): Promise<unknown>;
  getPlayerInfo(): Promise<unknown>;
  submitScore(options: { leaderboardId: string; score: number; tag: string | null }): Promise<unknown>;
  showLeaderboard(options: { leaderboardId: string; span: string }): Promise<unknown>;
  unlockAchievement(options: { achievementId: string }): Promise<unknown>;
  showAchievements(): Promise<unknown>;
  readSnapshot(options: { name: string }): Promise<unknown>;
  writeSnapshot(options: { name: string } & SnapshotOptions): Promise<unknown>;
  resolveSnapshot(options: { conflictId: string } & SnapshotOptions): Promise<unknown>;
}

/**
 * The native plugin in `android/app/src/main/java/com/tinytempo/app/PlayGamesPlugin.java`.
 * No web implementation is registered: in a browser this object exists but every call
 * rejects, which is why `boot.ts` never reaches this file off a native platform.
 */
const PlayGamesNative = registerPlugin<PlayGamesPlugin>('PlayGames');

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Anything crossing the bridge is JSON from another process, so it is validated rather
 * than cast — the same rule the billing bridge follows. A malformed answer reads as
 * signed out, which is the safe direction: it costs a cloud feature, never a grant.
 */
export function toStatus(value: unknown): PlayGamesStatus {
  if (typeof value !== 'object' || value === null) return SIGNED_OUT;
  const record = value as { authenticated?: unknown; reason?: unknown; playerId?: unknown; displayName?: unknown };
  const authenticated = record.authenticated === true;
  const reason = asString(record.reason) || 'unknown';
  if (!authenticated) return { authenticated: false, player: null, reason };
  const playerId = asString(record.playerId);
  const displayName = asString(record.displayName);
  return {
    authenticated: true,
    player: playerId.length > 0 ? { playerId, displayName } : null,
    reason,
  };
}

const SUBMIT_REASONS: readonly SubmitReason[] = ['submitted', 'signed_out', 'offline', 'timeout', 'failed', 'invalid', 'unavailable'];
const VIEW_REASONS: readonly LeaderboardReason[] = ['shown', 'signed_out', 'failed', 'invalid', 'unavailable'];

/** A submission answer from the bridge, validated. Anything malformed reads as a failure. */
export function toSubmission(value: unknown): ScoreSubmission {
  if (typeof value !== 'object' || value === null) return NOT_SUBMITTED('failed');
  const record = value as { submitted?: unknown; newBest?: unknown; reason?: unknown };
  const reason = SUBMIT_REASONS.find(r => r === record.reason);
  if (record.submitted === true) return { submitted: true, newBest: record.newBest === true, reason: 'submitted' };
  return NOT_SUBMITTED(reason === undefined || reason === 'submitted' ? 'failed' : reason);
}

/** A leaderboard-screen answer from the bridge, validated the same way. */
export function toView(value: unknown): LeaderboardView {
  if (typeof value !== 'object' || value === null) return NOT_SHOWN('failed');
  const record = value as { shown?: unknown; reason?: unknown };
  if (record.shown === true) return { shown: true, reason: 'shown' };
  const reason = VIEW_REASONS.find(r => r === record.reason);
  return NOT_SHOWN(reason === undefined || reason === 'shown' ? 'failed' : reason);
}

const UNLOCK_REASONS: readonly AchievementUnlock['reason'][] = ['sent', 'signed_out', 'failed', 'invalid', 'unavailable'];

/** An unlock answer from the bridge, validated. Anything malformed reads as a failure. */
export function toUnlock(value: unknown): AchievementUnlock {
  if (typeof value !== 'object' || value === null) return NOT_UNLOCKED('failed');
  const record = value as { sent?: unknown; reason?: unknown };
  if (record.sent === true) return { sent: true, reason: 'sent' };
  const reason = UNLOCK_REASONS.find(r => r === record.reason);
  return NOT_UNLOCKED(reason === undefined || reason === 'sent' ? 'failed' : reason);
}

const SNAPSHOT_REASONS: readonly SnapshotReason[] = ['signed_out', 'offline', 'timeout', 'failed', 'invalid', 'unavailable'];

/** Snapshot bytes as the plugin sends them, base64 of UTF-8, back to text. Null for anything that is not that. */
export function textFromBase64(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function base64FromText(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** A conflict as the bridge reports it, or null when it is not one. Payload text that will not decode is a missing side. */
function toConflict(record: { kind?: unknown; conflictId?: unknown; base?: unknown; other?: unknown }): SnapshotConflict | null {
  if (record.kind !== 'conflict' || typeof record.conflictId !== 'string' || record.conflictId === '') return null;
  return { kind: 'conflict', conflictId: record.conflictId, base: textFromBase64(record.base), other: textFromBase64(record.other) };
}

function toSnapshotFailure(record: { reason?: unknown }) {
  const reason = SNAPSHOT_REASONS.find(r => r === record.reason);
  return SNAPSHOT_FAILED(reason ?? 'failed');
}

/**
 * A snapshot read from the bridge, validated. `data` absent or empty is a snapshot that
 * has never been written. Anything else malformed reads as a failure, which costs this
 * sync and nothing more.
 */
export function toSnapshotRead(value: unknown): SnapshotRead {
  if (typeof value !== 'object' || value === null) return SNAPSHOT_FAILED('failed');
  const record = value as { kind?: unknown; data?: unknown; conflictId?: unknown; base?: unknown; other?: unknown; reason?: unknown };
  if (record.kind === 'data') return { kind: 'data', data: textFromBase64(record.data) };
  return toConflict(record) ?? toSnapshotFailure(record);
}

export function toSnapshotWrite(value: unknown): SnapshotWrite {
  if (typeof value !== 'object' || value === null) return SNAPSHOT_FAILED('failed');
  const record = value as { kind?: unknown; conflictId?: unknown; base?: unknown; other?: unknown; reason?: unknown };
  if (record.kind === 'committed') return { kind: 'committed' };
  return toConflict(record) ?? toSnapshotFailure(record);
}

export function toSnapshotResolution(value: unknown): SnapshotResolution {
  if (typeof value !== 'object' || value === null) return SNAPSHOT_FAILED('failed');
  const record = value as { kind?: unknown; conflictId?: unknown; base?: unknown; other?: unknown; reason?: unknown };
  if (record.kind === 'resolved') return { kind: 'resolved' };
  return toConflict(record) ?? toSnapshotFailure(record);
}

const snapshotOptions = (payload: SnapshotPayload): SnapshotOptions =>
  ({ data: base64FromText(payload.data), description: payload.description, progress: payload.progress });

export function nativePlayGamesClient(): PlayGamesClient {
  return {
    isAuthenticated: async () => toStatus(await PlayGamesNative.isAuthenticated()),
    signIn: async () => toStatus(await PlayGamesNative.signIn()),
    getPlayerInfo: async () => toStatus(await PlayGamesNative.getPlayerInfo()),
    submitScore: async (leaderboardId, score, tag) => toSubmission(await PlayGamesNative.submitScore({ leaderboardId, score, tag })),
    showLeaderboard: async (leaderboardId, span) => toView(await PlayGamesNative.showLeaderboard({ leaderboardId, span })),
    unlockAchievement: async achievementId => toUnlock(await PlayGamesNative.unlockAchievement({ achievementId })),
    showAchievements: async () => toView(await PlayGamesNative.showAchievements()),
    readSnapshot: async name => toSnapshotRead(await PlayGamesNative.readSnapshot({ name })),
    writeSnapshot: async (name, payload) => toSnapshotWrite(await PlayGamesNative.writeSnapshot({ name, ...snapshotOptions(payload) })),
    resolveSnapshot: async (conflictId, payload) => toSnapshotResolution(await PlayGamesNative.resolveSnapshot({ conflictId, ...snapshotOptions(payload) })),
  };
}
