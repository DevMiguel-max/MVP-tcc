import assert from "node:assert/strict";
import { test } from "node:test";
import { applyLinear, CalibrationError, fitLinear } from "@/lib/calibration";

const close = (actual: number, expected: number, tol = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tol, `esperado ${expected}, obtido ${actual}`);

test("3 pontos sobre uma reta perfeita: a = -0,005, b = 20, R² = 1", () => {
  const fit = fitLinear([
    { raw: 2800, moisture: 6 },
    { raw: 2400, moisture: 8 },
    { raw: 2000, moisture: 10 },
  ]);
  close(fit.a, -0.005);
  close(fit.b, 20);
  close(fit.r2, 1);
  assert.equal(fit.n, 3);
});

test("3 pontos de exemplo com erro: valores conferidos à mão", () => {
  // x̄ = 2400, ȳ = 8; Sxx = 320000; Sxy = -1520; Syy = 7,28
  // a = -1520/320000 = -0,00475; b = 8 + 0,00475*2400 = 19,4; R² = 1520² / (320000*7,28)
  const fit = fitLinear([
    { raw: 2800, moisture: 6.0 },
    { raw: 2400, moisture: 8.2 },
    { raw: 2000, moisture: 9.8 },
  ]);
  close(fit.a, -0.00475);
  close(fit.b, 19.4);
  close(fit.r2, 2310400 / 2329600, 1e-12); // 0,991758...
});

test("4 pontos (conferência clássica): a = 1,9, b = 0, R² = 90,25/93,75", () => {
  const fit = fitLinear([
    { raw: 1, moisture: 2 },
    { raw: 2, moisture: 4 },
    { raw: 3, moisture: 5 },
    { raw: 4, moisture: 8 },
  ]);
  close(fit.a, 1.9);
  close(fit.b, 0);
  close(fit.r2, 90.25 / 93.75, 1e-12);
});

test("a ordem dos pares não altera o resultado", () => {
  const pairs = [
    { raw: 2800, moisture: 6.0 },
    { raw: 2400, moisture: 8.2 },
    { raw: 2000, moisture: 9.8 },
    { raw: 2600, moisture: 7.1 },
  ];
  const a = fitLinear(pairs);
  const b = fitLinear([...pairs].reverse());
  close(a.a, b.a, 1e-12);
  close(a.b, b.b, 1e-12);
  close(a.r2, b.r2, 1e-12);
});

test("avisa quando o R² é baixo ou há poucos pares", () => {
  const fit = fitLinear([
    { raw: 2800, moisture: 8 },
    { raw: 2400, moisture: 6 },
    { raw: 2000, moisture: 9 },
  ]);
  assert.ok(fit.r2 < 0.95);
  assert.ok(fit.warnings.some((w) => w.includes("R²")));
  assert.ok(fit.warnings.some((w) => w.includes("pares")));
});

test("rejeita menos de 3 pares, leituras iguais e umidades iguais", () => {
  assert.throws(() => fitLinear([{ raw: 1, moisture: 1 }, { raw: 2, moisture: 2 }]), CalibrationError);
  assert.throws(
    () => fitLinear([{ raw: 2000, moisture: 5 }, { raw: 2000, moisture: 6 }, { raw: 2000, moisture: 7 }]),
    CalibrationError,
  );
  assert.throws(
    () => fitLinear([{ raw: 2000, moisture: 7 }, { raw: 2200, moisture: 7 }, { raw: 2400, moisture: 7 }]),
    CalibrationError,
  );
});

test("applyLinear usa a mesma conta do firmware", () => {
  close(applyLinear(-0.005, 20, 2200), 9);
});

test("dados do print do TCC (2810 → 64 %): inclinação positiva e R² baixo geram avisos", () => {
  const fit = fitLinear([
    { raw: 2000, moisture: 10 },
    { raw: 2410, moisture: 8 },
    { raw: 2810, moisture: 64 },
  ]);
  assert.ok(fit.a > 0);
  assert.ok(fit.r2 < 0.95);
  assert.ok(fit.warnings.some((w) => w.includes("Inclinação positiva")));
  assert.ok(fit.warnings.some((w) => w.includes("R² baixo")));
});
