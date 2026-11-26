import assert from "node:assert/strict";
import { test } from "node:test";
import { isLocalRequest } from "@/lib/http";

const r = (url: string, host?: string) => new Request(url, host ? { headers: { host } } : undefined);

test("isLocalRequest: só localhost, 127.0.0.1 e ::1", () => {
  assert.equal(isLocalRequest(r("http://localhost:3000/x")), true);
  assert.equal(isLocalRequest(r("http://127.0.0.1:3000/x")), true);
  assert.equal(isLocalRequest(r("http://[::1]:3000/x")), true);
  assert.equal(isLocalRequest(r("http://192.168.1.50:3000/x")), false);
  assert.equal(isLocalRequest(r("http://oremetrix.exemplo.com/x")), false);
});
