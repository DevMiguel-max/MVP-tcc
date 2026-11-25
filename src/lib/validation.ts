import { z } from "zod";
import { ADC_MAX } from "./defaults";

/** Payload enviado pelo firmware (ou simulador) em POST /api/readings. */
export const readingPayloadSchema = z.object({
  deviceId: z.string().trim().min(1).max(64),
  pointId: z.string().trim().min(1).max(32),
  /** leitura bruta JÁ FILTRADA (mediana + média móvel exponencial), em contagens do ADC */
  raw: z.number().finite().min(0).max(ADC_MAX),
  /** °C; null/ausente quando o DS18B20 não responde */
  tempC: z.number().finite().min(-55).max(125).nullish(),
  /** umidade % calculada no dispositivo com a calibração vigente */
  moisture: z.number().finite().min(-10).max(100),
  /** epoch em milissegundos */
  ts: z.number().int().nonnegative(),
  /** true somente para dados do simulador — vira a etiqueta "SIMULADO" na interface */
  simulated: z.boolean().optional().default(false),
});
export type ReadingPayload = z.infer<typeof readingPayloadSchema>;

export const pointUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    limit: z.number().finite().gt(0).max(100).optional(),
  })
  .refine((v) => v.name !== undefined || v.limit !== undefined, {
    message: "Informe name e/ou limit.",
  });

const pairSchema = z.object({
  raw: z.number().finite().min(0).max(ADC_MAX),
  moisture: z.number().finite().min(0).max(100),
});

export const calibrationRequestSchema = z.object({
  pointId: z.string().trim().min(1).max(32),
  pairs: z
    .array(pairSchema)
    .min(3, "Informe ao menos 3 pares (leitura bruta, umidade real).")
    .max(50),
});
