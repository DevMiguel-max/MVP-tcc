import assert from "node:assert/strict";
import { test } from "node:test";
import { getAlerts } from "@/lib/api/alerts";
import { applyCalibration, getCalibrations, postCalibration } from "@/lib/api/calibration";
import { getDeviceConfig } from "@/lib/api/config";
import { listPointsHandler, putPoint } from "@/lib/api/points";
import { getReadings, postReading } from "@/lib/api/readings";
import { DEFAULT_CAL } from "@/lib/defaults";
import { keyOf, req, reading, createTestDb } from "./helpers";

const NOW = 1_800_000_000_000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (res: Response): Promise<any> => res.json();

function setup() {
  const db = createTestDb();
  return { db, key: keyOf(db) };
}

/** envia uma leitura válida e devolve a resposta */
function send(db: ReturnType<typeof createTestDb>, key: string, over: Record<string, unknown> = {}) {
  return postReading(req("POST", "/api/readings", { body: reading(over), key }), db, NOW);
}

test("primeiro boot: 3 pontos de exemplo, limite 9,0 e calibração padrão", async () => {
  const { db } = setup();
  const { points } = await body(await listPointsHandler(db));
  assert.deepEqual(points.map((p: { id: string }) => p.id), ["C-01", "P-01", "P-03"]);
  for (const p of points) {
    assert.equal(p.limit, 9);
    assert.equal(p.calibration.a, DEFAULT_CAL.a);
    assert.equal(p.calibration.b, DEFAULT_CAL.b);
    assert.equal(p.status, "sem_dados");
    assert.equal(p.latest, null);
  }
});

test("POST /api/readings exige a chave de API", async () => {
  const { db, key } = setup();
  assert.equal((await postReading(req("POST", "/api/readings", { body: reading() }), db, NOW)).status, 401);
  assert.equal((await postReading(req("POST", "/api/readings", { body: reading(), key: "errada" }), db, NOW)).status, 401);
  assert.equal((await send(db, key)).status, 201);
});

test("POST /api/readings grava a leitura e o GET devolve o histórico", async () => {
  const { db, key } = setup();
  const res = await send(db, key, { raw: 2310.5, moisture: 8.4, tempC: 25.1 });
  assert.equal(res.status, 201);
  const out = await body(res);
  assert.equal(out.ok, true);
  assert.equal(out.tsSource, "dispositivo");

  const { readings } = await body(await getReadings(req("GET", "/api/readings?pointId=P-03"), db));
  assert.equal(readings.length, 1);
  assert.equal(readings[0].raw, 2310.5);
  assert.equal(readings[0].moisture, 8.4);
  assert.equal(readings[0].tempC, 25.1);
  assert.equal(readings[0].simulated, false);
});

test("dado simulado só é marcado quando o payload diz simulated: true", async () => {
  const { db, key } = setup();
  await send(db, key);
  await send(db, key, { ts: NOW + 1000, simulated: true });
  const { readings } = await body(await getReadings(req("GET", "/api/readings?pointId=P-03"), db));
  assert.deepEqual(readings.map((r: { simulated: boolean }) => r.simulated), [false, true]);
  const { points } = await body(await listPointsHandler(db));
  assert.equal(points.find((p: { id: string }) => p.id === "P-03").latest.simulated, true);
});

test("payload inválido → 422; JSON quebrado → 400; ponto/dispositivo errado → 404/409", async () => {
  const { db, key } = setup();
  for (const bad of [{ raw: "2200" }, { raw: 5000 }, { moisture: 150 }, { tempC: 300 }, { pointId: "" }, { ts: 1.5 }]) {
    const res = await send(db, key, bad);
    assert.equal(res.status, 422, JSON.stringify(bad));
    assert.equal((await body(res)).error, "payload_invalido");
  }
  const broken = await postReading(req("POST", "/api/readings", { rawBody: "{nao-json", key }), db, NOW);
  assert.equal(broken.status, 400);
  assert.equal((await send(db, key, { pointId: "X-99" })).status, 404);
  assert.equal((await send(db, key, { deviceId: "esp32-c01" })).status, 409);
});

test("tempC pode ser null (DS18B20 desconectado)", async () => {
  const { db, key } = setup();
  assert.equal((await send(db, key, { tempC: null })).status, 201);
  const { readings } = await body(await getReadings(req("GET", "/api/readings?pointId=P-03"), db));
  assert.equal(readings[0].tempC, null);
});

test("timestamp absurdo (relógio sem NTP) é trocado pelo horário do servidor", async () => {
  const { db, key } = setup();
  const out = await body(await send(db, key, { ts: 0 }));
  assert.equal(out.tsSource, "servidor");
  assert.equal(out.ts, NOW);
  const future = await body(await send(db, key, { ts: NOW + 3_600_000 }));
  assert.equal(future.tsSource, "servidor");
});

test("GET /api/readings: filtros from/to, order e limit", async () => {
  const { db, key } = setup();
  for (let i = 0; i < 6; i++) await send(db, key, { ts: NOW - 60_000 + i * 1000, moisture: 5 + i * 0.1 });
  await send(db, key, { pointId: "C-01", deviceId: "esp32-c01", ts: NOW - 60_000 });

  const all = await body(await getReadings(req("GET", "/api/readings?pointId=P-03"), db));
  assert.equal(all.readings.length, 6);

  const range = await body(
    await getReadings(req("GET", `/api/readings?pointId=P-03&from=${NOW - 60_000 + 2000}&to=${NOW - 60_000 + 4000}`), db),
  );
  assert.equal(range.readings.length, 3);

  const iso = await body(
    await getReadings(req("GET", `/api/readings?pointId=P-03&from=${encodeURIComponent(new Date(NOW - 60_000 + 5000).toISOString())}`), db),
  );
  assert.equal(iso.readings.length, 1);

  // limit pega as MAIS RECENTES; order=asc devolve em ordem crescente de tempo
  const lim = await body(await getReadings(req("GET", "/api/readings?pointId=P-03&limit=2"), db));
  assert.deepEqual(lim.readings.map((r: { ts: number }) => r.ts), [NOW - 60_000 + 4000, NOW - 60_000 + 5000]);
  const desc = await body(await getReadings(req("GET", "/api/readings?pointId=P-03&limit=2&order=desc"), db));
  assert.equal(desc.readings[0].ts, NOW - 60_000 + 5000);

  // sem pointId traz todos os pontos
  assert.equal((await body(await getReadings(req("GET", "/api/readings"), db))).readings.length, 7);

  for (const q of ["from=abc", "limit=0", "limit=99999", "order=x", "from=20&to=10", "pointId=X-99"]) {
    const res = await getReadings(req("GET", `/api/readings?${q}`), db);
    assert.ok(res.status === 422 || res.status === 404, q);
  }
});

test("alerta só abre com 3 leituras seguidas acima do limite (pico isolado não alarma)", async () => {
  const { db, key } = setup();
  const seq = [8, 9.5, 8.5, 9.6, 9.7, 8, 9.8, 9.9, 9.4]; // picos nunca chegam a 3 seguidos... até o fim
  const events: (string | null)[] = [];
  for (let i = 0; i < seq.length; i++) {
    events.push((await body(await send(db, key, { ts: NOW + i * 1000, moisture: seq[i] }))).alert);
  }
  // 9.8, 9.9, 9.4 são as 3 últimas, todas > 9 → abre só na última
  assert.deepEqual(events, [null, null, null, null, null, null, null, null, "opened"]);
  const { alerts } = await body(await getAlerts(req("GET", "/api/alerts"), db));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].pointId, "P-03");
  assert.equal(alerts[0].resolvedAt, null);
});

test("exatamente no limite não conta como acima (moisture > limit)", async () => {
  const { db, key } = setup();
  for (let i = 0; i < 4; i++) await send(db, key, { ts: NOW + i * 1000, moisture: 9 });
  assert.equal((await body(await getAlerts(req("GET", "/api/alerts"), db))).alerts.length, 0);
});

test("não duplica alerta enquanto aberto e o fecha após 3 leituras dentro do limite", async () => {
  const { db, key } = setup();
  let t = NOW;
  const push = async (m: number) => (await body(await send(db, key, { ts: (t += 1000), moisture: m }))).alert;
  assert.equal(await push(9.5), null);
  assert.equal(await push(9.6), null);
  assert.equal(await push(9.7), "opened");
  assert.equal(await push(9.8), null); // continua aberto, sem 2º alerta
  assert.equal(await push(9.9), null);
  assert.equal((await body(await getAlerts(req("GET", "/api/alerts"), db))).alerts.length, 1);

  assert.equal(await push(8.0), null);
  assert.equal(await push(8.1), null);
  // um novo pico no meio da recuperação mantém o alerta aberto
  assert.equal(await push(9.5), null);
  assert.equal((await body(await getAlerts(req("GET", "/api/alerts?active=1"), db))).alerts.length, 1);
  assert.equal(await push(8.0), null);
  assert.equal(await push(8.0), null);
  assert.equal(await push(8.0), "resolved");

  const all = (await body(await getAlerts(req("GET", "/api/alerts"), db))).alerts;
  assert.equal(all.length, 1);
  assert.notEqual(all[0].resolvedAt, null);
  assert.equal((await body(await getAlerts(req("GET", "/api/alerts?active=1"), db))).alerts.length, 0);
});

test("alerta herda a etiqueta SIMULADO da leitura que o disparou", async () => {
  const { db, key } = setup();
  for (let i = 0; i < 3; i++) await send(db, key, { ts: NOW + i * 1000, moisture: 9.5, simulated: true });
  const { alerts } = await body(await getAlerts(req("GET", "/api/alerts"), db));
  assert.equal(alerts[0].simulated, true);
});

test("status do ponto: ok → atenção → alerta", async () => {
  const { db, key } = setup();
  const status = async () => {
    const { points } = await body(await listPointsHandler(db));
    return points.find((p: { id: string }) => p.id === "P-03");
  };
  await send(db, key, { ts: NOW, moisture: 6 });
  assert.equal((await status()).status, "ok");
  assert.ok(Math.abs((await status()).margin - 3) < 1e-9);
  await send(db, key, { ts: NOW + 1000, moisture: 8.5 }); // > 90% de 9 = 8,1
  assert.equal((await status()).status, "atencao");
  await send(db, key, { ts: NOW + 2000, moisture: 9.3 });
  await send(db, key, { ts: NOW + 3000, moisture: 9.4 });
  assert.equal((await status()).status, "atencao"); // acima do limite, mas ainda só 2 seguidas: sem alerta
  await send(db, key, { ts: NOW + 4000, moisture: 9.5 });
  const s = await status();
  assert.equal(s.status, "alerta");
  assert.equal(s.alertOpen, true);
});

test("GET /api/config/:deviceId devolve {a, b, limit} e exige a chave", async () => {
  const { db, key } = setup();
  assert.equal((await getDeviceConfig(req("GET", "/api/config/esp32-p03"), db, "esp32-p03")).status, 401);
  const ok = await getDeviceConfig(req("GET", "/api/config/esp32-p03", { key }), db, "esp32-p03");
  assert.equal(ok.status, 200);
  assert.deepEqual(await body(ok), { a: DEFAULT_CAL.a, b: DEFAULT_CAL.b, limit: 9 });
  assert.equal((await getDeviceConfig(req("GET", "/x", { key }), db, "nao-existe")).status, 404);
});

test("PUT /api/points/:id altera nome e limite, com validação", async () => {
  const { db, key } = setup();
  const res = await putPoint(req("PUT", "/api/points/P-03", { body: { name: "  Pilha Norte ", limit: 8.5 } }), db, "P-03");
  assert.equal(res.status, 200);
  const { point } = await body(res);
  assert.equal(point.name, "Pilha Norte");
  assert.equal(point.limit, 8.5);

  // o firmware passa a receber o novo limite
  const cfg = await body(await getDeviceConfig(req("GET", "/x", { key }), db, "esp32-p03"));
  assert.equal(cfg.limit, 8.5);

  // só o limite: o nome permanece
  const only = await body(await putPoint(req("PUT", "/x", { body: { limit: 10 } }), db, "P-03"));
  assert.equal(only.point.name, "Pilha Norte");

  for (const bad of [{}, { limit: 0 }, { limit: 101 }, { limit: "9" }, { name: "   " }]) {
    assert.equal((await putPoint(req("PUT", "/x", { body: bad }), db, "P-03")).status, 422, JSON.stringify(bad));
  }
  assert.equal((await putPoint(req("PUT", "/x", { body: { limit: 5 } }), db, "X-99")).status, 404);
});

test("o novo limite vale para os próximos alertas", async () => {
  const { db, key } = setup();
  await putPoint(req("PUT", "/x", { body: { limit: 7 } }), db, "P-03");
  for (let i = 0; i < 3; i++) await send(db, key, { ts: NOW + i * 1000, moisture: 7.5 });
  assert.equal((await body(await getAlerts(req("GET", "/api/alerts"), db))).alerts.length, 1);
});

test("POST /api/calibration calcula a, b e R², salva e só aplica no ponto quando pedido", async () => {
  const { db, key } = setup();
  const pairs = [
    { raw: 2800, moisture: 6.0 },
    { raw: 2400, moisture: 8.2 },
    { raw: 2000, moisture: 9.8 },
  ];
  const res = await postCalibration(req("POST", "/api/calibration", { body: { pointId: "P-03", pairs } }), db, NOW);
  assert.equal(res.status, 201);
  const cal = await body(res);
  assert.ok(Math.abs(cal.a - -0.00475) < 1e-12);
  assert.ok(Math.abs(cal.b - 19.4) < 1e-9);
  assert.ok(Math.abs(cal.r2 - 2310400 / 2329600) < 1e-12);
  assert.equal(cal.appliedAt, null);

  // salvo, mas o ponto ainda usa a calibração padrão
  const before = await body(await getDeviceConfig(req("GET", "/x", { key }), db, "esp32-p03"));
  assert.equal(before.a, DEFAULT_CAL.a);
  const list = await body(await getCalibrations(req("GET", "/api/calibration?pointId=P-03"), db));
  assert.equal(list.calibrations.length, 1);
  assert.deepEqual(list.calibrations[0].pairs, pairs);

  // aplicar
  const applied = await applyCalibration(db, String(cal.id), NOW + 5);
  assert.equal(applied.status, 200);
  const after = await body(await getDeviceConfig(req("GET", "/x", { key }), db, "esp32-p03"));
  assert.ok(Math.abs(after.a - -0.00475) < 1e-12);
  assert.ok(Math.abs(after.b - 19.4) < 1e-9);
  const { points } = await body(await listPointsHandler(db));
  const p03 = points.find((p: { id: string }) => p.id === "P-03");
  assert.ok(Math.abs(p03.calibration.r2 - 2310400 / 2329600) < 1e-12);
  assert.equal(p03.calibration.updatedAt, NOW + 5);
  // os outros pontos não mudam
  assert.equal(points.find((p: { id: string }) => p.id === "P-01").calibration.a, DEFAULT_CAL.a);
  assert.notEqual((await body(await getCalibrations(req("GET", "/api/calibration"), db))).calibrations[0].appliedAt, null);
});

test("calibração: menos de 3 pares, dados degenerados e ponto/id inexistentes", async () => {
  const { db } = setup();
  const two = [{ raw: 2000, moisture: 9 }, { raw: 2400, moisture: 8 }];
  assert.equal((await postCalibration(req("POST", "/x", { body: { pointId: "P-03", pairs: two } }), db)).status, 422);
  const flat = [{ raw: 2000, moisture: 8 }, { raw: 2200, moisture: 8 }, { raw: 2400, moisture: 8 }];
  const res = await postCalibration(req("POST", "/x", { body: { pointId: "P-03", pairs: flat } }), db);
  assert.equal(res.status, 422);
  assert.equal((await body(res)).error, "calibracao_invalida");
  const ok3 = [{ raw: 2000, moisture: 9 }, { raw: 2200, moisture: 8 }, { raw: 2400, moisture: 7 }];
  assert.equal((await postCalibration(req("POST", "/x", { body: { pointId: "X-99", pairs: ok3 } }), db)).status, 404);
  assert.equal((await applyCalibration(db, "999")).status, 404);
  assert.equal((await applyCalibration(db, "abc")).status, 422);
});

test("aplicar calibração com R² baixo exige force=1 (evita calibrar o ponto com lixo)", async () => {
  const { db, key } = setup();
  const bad = [
    { raw: 2000, moisture: 10 },
    { raw: 2410, moisture: 8 },
    { raw: 2810, moisture: 64 },
  ];
  const cal = await body(await postCalibration(req("POST", "/api/calibration", { body: { pointId: "P-03", pairs: bad } }), db, NOW));
  assert.ok(cal.r2 < 0.95);

  const denied = await applyCalibration(db, String(cal.id), NOW + 1);
  assert.equal(denied.status, 409);
  assert.equal((await body(denied)).error, "r2_baixo");
  // nada mudou no ponto
  assert.equal((await body(await getDeviceConfig(req("GET", "/x", { key }), db, "esp32-p03"))).a, DEFAULT_CAL.a);

  const forced = await applyCalibration(db, String(cal.id), NOW + 2, true);
  assert.equal(forced.status, 200);
  assert.ok((await body(await getDeviceConfig(req("GET", "/x", { key }), db, "esp32-p03"))).a > 0);
});
