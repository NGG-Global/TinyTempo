import { registerPlugin } from '@capacitor/core';

import {
  NOT_SHOWN, NOT_SUBMITTED, NOT_UNLOCKED, SIGNED_OUT,
  type AchievementUnlock, type LeaderboardReason, type LeaderboardView, type PlayGamesClient, type PlayGamesStatus, type ScoreSubmission,
  type SubmitReason,
} from './playGames';

interface PlayGamesPlugin {
  isAuthenticated(): Promise<unknown>;
  signIn(): Promise<unknown>;
  getPlayerInfo(): Promise<unknown>;
  submitScore(options: { leaderboardId: string; score: number; tag: string | null }): Promise<unknown>;
  showLeaderboard(options: { leaderboardId: string; span: string }): Promise<unknown>;
  unlockAchievement(options: { achievementId: string }): Promise<unknown>;
  showAchievements(): Promise<unknown>;
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

export function nativePlayGamesClient(): PlayGamesClient {
  return {
    isAuthenticated: async () => toStatus(await PlayGamesNative.isAuthenticated()),
    signIn: async () => toStatus(await PlayGamesNative.signIn()),
    getPlayerInfo: async () => toStatus(await PlayGamesNative.getPlayerInfo()),
    submitScore: async (leaderboardId, score, tag) => toSubmission(await PlayGamesNative.submitScore({ leaderboardId, score, tag })),
    showLeaderboard: async (leaderboardId, span) => toView(await PlayGamesNative.showLeaderboard({ leaderboardId, span })),
    unlockAchievement: async achievementId => toUnlock(await PlayGamesNative.unlockAchievement({ achievementId })),
    showAchievements: async () => toView(await PlayGamesNative.showAchievements()),
  };
}
