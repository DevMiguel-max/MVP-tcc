/*
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  OREMETRIX — Firmware do sensor de umidade (ESP32)
 *
 *  Lê o sensor capacitivo (ADC) e o DS18B20, filtra, aplica
 *  a calibração linear e envia por HTTP POST a cada 5 s.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

#include "config.h"

// Se o secrets.h não existir, o build falha com uma mensagem clara.
#if __has_include("../include/secrets.h")
  #include "../include/secrets.h"
#else
  #error "Copie firmware/include/secrets.h.example para firmware/include/secrets.h e preencha as credenciais."
#endif

// ── Globais ──────────────────────────────────────────────────

Preferences prefs;
OneWire oneWire(PIN_DS18B20);
DallasTemperature ds18(&oneWire);

// Calibração vigente (atualizada via GET /api/config)
float calA = DEFAULT_CAL_A;
float calB = DEFAULT_CAL_B;

// EMA (média móvel exponencial)
float emaValue = -1.0f;  // -1 indica "não inicializado"

// Fila de leituras pendentes (buffer offline)
struct QueuedReading {
  float raw;
  float tempC;
  float moisture;
  unsigned long ts;
  bool valid;
};
QueuedReading offlineQueue[QUEUE_MAX_SIZE];
int queueHead = 0;
int queueCount = 0;

unsigned long lastSendMs = 0;
unsigned long lastConfigFetchMs = 0;
const unsigned long CONFIG_FETCH_INTERVAL = 60000; // busca config a cada 60 s

// ── Filtragem ────────────────────────────────────────────────

/**
 * Mediana de N amostras do ADC.
 */
float readMedian(int pin, int n) {
  int samples[MEDIAN_SAMPLES];
  for (int i = 0; i < n; i++) {
    samples[i] = analogRead(pin);
    delayMicroseconds(500);
  }
  // Insertion sort (N pequeno)
  for (int i = 1; i < n; i++) {
    int key = samples[i];
    int j = i - 1;
    while (j >= 0 && samples[j] > key) {
      samples[j + 1] = samples[j];
      j--;
    }
    samples[j + 1] = key;
  }
  return (float)samples[n / 2];
}

/**
 * Média móvel exponencial.
 */
float applyEMA(float newValue) {
  if (emaValue < 0) {
    emaValue = newValue;  // primeiro valor
  } else {
    emaValue = EMA_ALPHA * newValue + (1.0f - EMA_ALPHA) * emaValue;
  }
  return emaValue;
}

// ── Temperatura ──────────────────────────────────────────────

/**
 * Lê o DS18B20. Retorna NAN se falhar.
 */
float readTemperature() {
  ds18.requestTemperatures();
  float t = ds18.getTempCByIndex(0);
  if (t == DEVICE_DISCONNECTED_C || t < -55.0f || t > 125.0f) {
    return NAN;
  }
  return t;
}

// ── Wi-Fi ────────────────────────────────────────────────────

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("[wifi] Conectando a %s...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  WiFi.setAutoReconnect(true);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[wifi] Conectado! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[wifi] Falha na conexão. Tentará novamente.");
  }
}

// ── Fila offline ─────────────────────────────────────────────

void enqueue(float raw, float tempC, float moisture, unsigned long ts) {
  if (queueCount >= QUEUE_MAX_SIZE) {
    Serial.println("[fila] Cheia — descartando a mais antiga.");
    queueHead = (queueHead + 1) % QUEUE_MAX_SIZE;
    queueCount--;
  }
  int idx = (queueHead + queueCount) % QUEUE_MAX_SIZE;
  offlineQueue[idx] = { raw, tempC, moisture, ts, true };
  queueCount++;
}

bool dequeue(QueuedReading &out) {
  if (queueCount == 0) return false;
  out = offlineQueue[queueHead];
  offlineQueue[queueHead].valid = false;
  queueHead = (queueHead + 1) % QUEUE_MAX_SIZE;
  queueCount--;
  return true;
}

// ── HTTP ─────────────────────────────────────────────────────

/**
 * Envia uma leitura ao backend. Retorna true se HTTP 2xx.
 */
bool sendReading(float raw, float tempC, float moisture, unsigned long ts) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/readings";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);

  JsonDocument doc;
  doc["deviceId"] = DEVICE_ID;
  doc["pointId"] = POINT_ID;
  doc["raw"] = raw;
  if (!isnan(tempC)) doc["tempC"] = tempC;
  doc["moisture"] = moisture;
  doc["ts"] = ts;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  bool ok = (code >= 200 && code < 300);

  if (ok) {
    Serial.printf("[http] Enviado: moisture=%.2f%% raw=%.1f temp=%.1f°C → %d\n",
                  moisture, raw, tempC, code);
  } else {
    Serial.printf("[http] Erro %d ao enviar.\n", code);
  }

  http.end();
  return ok;
}

/**
 * Busca a calibração e o limite atuais do servidor.
 */
void fetchConfig() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/config/" + DEVICE_ID;
  http.begin(url);
  http.addHeader("x-api-key", API_KEY);

  int code = http.GET();
  if (code == 200) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, http.getStream());
    if (!err) {
      float newA = doc["a"].as<float>();
      float newB = doc["b"].as<float>();
      if (newA != calA || newB != calB) {
        calA = newA;
        calB = newB;
        // Salva na NVS para sobreviver a resets
        prefs.begin("oremetrix", false);
        prefs.putFloat("calA", calA);
        prefs.putFloat("calB", calB);
        prefs.end();
        Serial.printf("[cfg] Nova calibração: a=%.6f b=%.4f\n", calA, calB);
      }
    }
  } else {
    Serial.printf("[cfg] Erro %d ao buscar config.\n", code);
  }
  http.end();
}

// ── Setup ────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n=== OREMETRIX — Sensor de Umidade ===");
  Serial.printf("Device: %s  Point: %s\n", DEVICE_ID, POINT_ID);

  // ADC
  analogReadResolution(12);       // 0–4095
  analogSetAttenuation(ADC_11db); // 0–3.3 V

  // DS18B20
  ds18.begin();
  Serial.printf("[ds18] %d sensor(es) encontrado(s).\n", ds18.getDeviceCount());

  // Calibração salva na NVS
  prefs.begin("oremetrix", true);  // somente leitura
  calA = prefs.getFloat("calA", DEFAULT_CAL_A);
  calB = prefs.getFloat("calB", DEFAULT_CAL_B);
  prefs.end();
  Serial.printf("[cal] a=%.6f b=%.4f\n", calA, calB);

  // Wi-Fi
  connectWiFi();

  // Buscar config na inicialização
  fetchConfig();
}

// ── Loop ─────────────────────────────────────────────────────

void loop() {
  connectWiFi();

  unsigned long now = millis();

  // Busca config periodicamente
  if (now - lastConfigFetchMs >= CONFIG_FETCH_INTERVAL) {
    fetchConfig();
    lastConfigFetchMs = now;
  }

  // Leitura + envio no intervalo configurado
  if (now - lastSendMs >= SEND_INTERVAL_MS) {
    lastSendMs = now;

    // 1. Leitura com mediana
    float rawMedian = readMedian(PIN_MOISTURE_ADC, MEDIAN_SAMPLES);

    // 2. EMA
    float rawFiltered = applyEMA(rawMedian);

    // 3. Calibração: umidade = a * raw + b
    float moisture = calA * rawFiltered + calB;
    moisture = constrain(moisture, 0.0f, 100.0f);

    // 4. Temperatura
    float tempC = readTemperature();

    // 5. Timestamp (epoch ms — requer NTP; se Wi-Fi conectado, configTime já fez)
    struct timeval tv;
    gettimeofday(&tv, NULL);
    unsigned long tsMs = (unsigned long)(tv.tv_sec) * 1000UL + (unsigned long)(tv.tv_usec / 1000);
    // Se o relógio não foi sincronizado, tsMs será baixo; o servidor corrige.

    Serial.printf("[leitura] raw=%.1f filtrada=%.1f moisture=%.2f%% temp=%.1f°C\n",
                  rawMedian, rawFiltered, moisture, tempC);

    // 6. Enviar (ou enfileirar se offline)
    if (!sendReading(rawFiltered, tempC, moisture, tsMs)) {
      enqueue(rawFiltered, tempC, moisture, tsMs);
      Serial.printf("[fila] Enfileirada (%d na fila).\n", queueCount);
    }

    // 7. Tentar reenviar a fila
    QueuedReading queued;
    while (dequeue(queued)) {
      if (!sendReading(queued.raw, queued.tempC, queued.moisture, queued.ts)) {
        // Falhou de novo — recoloca na fila e para de tentar
        enqueue(queued.raw, queued.tempC, queued.moisture, queued.ts);
        break;
      }
    }
  }

  delay(100);
}
