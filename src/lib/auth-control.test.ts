import { describe, expect, it } from "vitest";

import { ADMIN_LOGIN_HREF, ADMIN_PANEL_HREF, authControlModel } from "./auth-control";

describe("authControlModel", () => {
  it("signed out (no session) → Admin login pointing at the sign-in page", () => {
    const model = authControlModel(null);
    expect(model.mode).toBe("signed-out");
    if (model.mode === "signed-out") {
      expect(model.loginLabel).toBe("Admin login");
      expect(model.loginHref).toBe(ADMIN_LOGIN_HREF);
    }
  });

  it("undefined session is treated as signed out", () => {
    expect(authControlModel(undefined).mode).toBe("signed-out");
  });

  it("director session → Admin panel + Logout", () => {
    const model = authControlModel({ user: { isDirector: true } });
    expect(model.mode).toBe("director");
    if (model.mode === "director") {
      expect(model.panelLabel).toBe("Admin panel");
      expect(model.panelHref).toBe(ADMIN_PANEL_HREF);
      expect(model.panelHref).toBe("/admin");
      expect(model.logoutLabel).toBe("Logout");
    }
  });

  it("session without the director flag never shows admin UI (defensive)", () => {
    expect(authControlModel({ user: {} }).mode).toBe("signed-out");
    expect(authControlModel({ user: { isDirector: false } }).mode).toBe("signed-out");
  });

  it("post-login landing is /admin (callbackUrl carried on the login href)", () => {
    expect(ADMIN_LOGIN_HREF).toContain("callbackUrl=/admin");
  });
});
