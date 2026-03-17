import { initAuthPage } from "../features/auth.js";

export default {
  init(route) {
    initAuthPage(route.tab || "login");
  },
};
