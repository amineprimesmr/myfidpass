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
