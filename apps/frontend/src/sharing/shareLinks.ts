/**
 * Share links and the owner tokens that allow unsharing them.
 *
 * Tokens live in this browser's localStorage, so only the browser that
 * shared a report can unshare it. Storage can be unavailable (private
 * mode, blocked site data): then unsharing is simply not offered.
 */

const PREFIX = "repoinsight:share-owner:";

export const SHARE_PATH = /^\/r\/([A-Za-z0-9_-]{22})\/?$/;

export function shareUrl(shareId: string): string {
  return `${window.location.origin}/r/${shareId}`;
}

/**
 * The share id in the current URL (/r/<id>), if this is a shared-report page.
 */
export function currentShareId(): string | undefined {
  return window.location.pathname.match(SHARE_PATH)?.[1];
}

export function saveOwnerToken(shareId: string, token: string): void {
  try {
    window.localStorage.setItem(PREFIX + shareId, token);
  } catch {
    // Storage unavailable: the link works, unsharing from here does not.
  }
}

export function getOwnerToken(shareId: string): string | undefined {
  try {
    return window.localStorage.getItem(PREFIX + shareId) ?? undefined;
  } catch {
    return undefined;
  }
}

export function forgetOwnerToken(shareId: string): void {
  try {
    window.localStorage.removeItem(PREFIX + shareId);
  } catch {
    // Nothing to clean up.
  }
}
