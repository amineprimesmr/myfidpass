export function createClientFidelityStore(initial = {}) {
  const state = {
    slug: "",
    business: null,
    member: null,
    games: [],
    roulette_segments: [],
    tickets: null,
    rewards: [],
    engagementActions: [],
    engagementDone: [],
    /** Débloque étapes 2–3 après confirmation utilisateur (voir localStorage). */
    walletConfirmed: false,
    ...initial,
  };

  return {
    get() {
      return state;
    },
    patch(next) {
      Object.assign(state, next || {});
      return state;
    },
  };
}
