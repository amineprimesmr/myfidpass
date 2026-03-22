export function createClientFidelityStore(initial = {}) {
  const state = {
    slug: "",
    business: null,
    member: null,
    games: [],
    roulette_segments: [],
    tickets: null,
    engagementActions: [],
    engagementDone: [],
    /** Confirmation honnête « carte ajoutée » — masque le bloc Wallet (localStorage). */
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
