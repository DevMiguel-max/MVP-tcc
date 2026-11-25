#pragma once
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  OREMETRIX — Configurações do firmware (ESP32)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Pinos ─────────────────────────────────────────────────
#define PIN_MOISTURE_ADC 34       // GPIO34 (ADC1_CH6) — sensor capacitivo
#define PIN_DS18B20      4        // GPIO4  — sensor de temperatura (OneWire)

// ── Filtragem ─────────────────────────────────────────────
#define MEDIAN_SAMPLES   15       // amostras para a mediana
#define EMA_ALPHA        0.2f     // fator da média móvel exponencial

// ── Calibração padrão (1º boot) ───────────────────────────
//    umidade_% = CAL_A * leitura_filtrada + CAL_B
//    Valores ILUSTRATIVOS — calibrar com amostras de estufa!
#define DEFAULT_CAL_A   (-0.005f)
#define DEFAULT_CAL_B   (20.0f)

// ── Comunicação ───────────────────────────────────────────
#define SEND_INTERVAL_MS  5000    // intervalo entre envios (ms)
#define QUEUE_MAX_SIZE    20      // leituras no buffer offline

// ── Servidor ──────────────────────────────────────────────
// URL base do backend Next.js
#define SERVER_URL  "http://192.168.1.100:3000"

// ── Identificação ─────────────────────────────────────────
#define DEVICE_ID   "esp32-p03"
#define POINT_ID    "P-03"
