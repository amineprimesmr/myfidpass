export const STORAGE_MEMBER_KEY_PREFIX = "fidpass_success_";
export const STORAGE_ADDED_KEY_PREFIX = "fidpass_added_";
export const SUCCESS_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

export function memberStorageKey(slug) {
  return `${STORAGE_MEMBER_KEY_PREFIX}${slug}`;
}

export function addedStorageKey(slug, memberId) {
  return `${STORAGE_ADDED_KEY_PREFIX}${slug}:${memberId}`;
}
