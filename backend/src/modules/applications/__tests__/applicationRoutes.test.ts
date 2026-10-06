import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.JWT_SECRET ??= "test-secret";
process.env.ADMIN_EMAIL ??= "admin@example.com";
process.env.ADMIN_PASSWORD ??= "password";
const { requireAuth } = await import("../../../middleware/auth.js");

describe("application preparation authentication", () => {
  it("rejects an unauthenticated request with 401", () => {
    let statusCode = 0;
    let body: unknown;
    const response = {
      status(status: number) {
        statusCode = status;
        return this;
      },
      json(value: unknown) {
        body = value;
      },
    };
    requireAuth(
      { headers: {} } as never,
      response as never,
      () => {
        throw new Error("next should not be called");
      },
    );
    assert.equal(statusCode, 401);
    assert.deepEqual(body, {
      success: false,
      message: "Authentication required",
    });
  });
});
