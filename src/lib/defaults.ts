/** Limite padrão de umidade (%), conforme a especificação. */
export const DEFAULT_LIMIT = 9.0;

/**
 * Calibração padrão do primeiro boot: umidade_% = a * leitura_filtrada + b.
 * Valores ILUSTRATIVOS (sensor capacitivo: quanto mais úmido, menor a leitura).
 * Não foram validados com minério real — é preciso calibrar com amostras de estufa.
 */
export const DEFAULT_CAL = { a: -0.005, b: 20 } as const;

/** Leituras consecutivas acima do limite para abrir um alerta (e dentro do limite para fechá-lo). */
export const CONSECUTIVE_READINGS = 3;

/** Acima de 90% do limite o ponto fica em "atenção". */
export const ATTENTION_RATIO = 0.9;

/** Faixa do ADC de 12 bits do ESP32. */
export const ADC_MAX = 4095;
