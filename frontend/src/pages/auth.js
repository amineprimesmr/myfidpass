import { initAuthPage } from "../main.js";

export default {
  init(route) {
    initAuthPage(route.tab || "login");
  },
};
