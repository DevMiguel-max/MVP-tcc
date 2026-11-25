# OREMETRIX

Protótipo de **medição online da umidade de minério de ferro** (TCC SENAI, demanda da Vale S/A).
ESP32 + sensor capacitivo + DS18B20 → API Next.js → SQLite → painel web.

> **Isto é um protótipo em escala, não uma solução industrial.** O sistema funciona sem hardware,
> usando um simulador. Todo dado simulado é marcado como `simulated` na API e deve aparecer com a
> etiqueta **SIMULADO** na interface. Nunca apresente dado simulado como medição real.

## Status da entrega

| Etapa | Conteúdo | Situação |
|---|---|---|
| 1 | Backend + banco + testes da calibração | **pronta** |
| 2 | Simulador (`npm run sim`) | pendente |
| 3 | Painel (Painel, Calibração, Histórico, Configurações) | pendente |
| 4 | Firmware ESP32 | pendente |
| 5 | README final e revisão | pendente |

## Como rodar (etapa 1)

```bash
npm install
npm test        # 25 testes: calibração + API
npm run dev     # http://localhost:3000 — cria data/oremetrix.db com 3 pontos de exemplo
```

Requer Node 20.9+ (os testes usam `better-sqlite3`; se ele não estiver instalado, caem para o
`node:sqlite`, que exige Node 22.5+).

Na primeira execução é gerada uma **chave de API aleatória**, guardada só no banco local
(`settings.api_key`). Ela não está no repositório. Para ver a chave durante a etapa 1:

```bash
sqlite3 data/oremetrix.db "select value from settings where key='api_key'"
```

(Na etapa 3 ela aparece na tela Configurações.)

## API

| Método e rota | Chave `x-api-key` | O que faz |
|---|---|---|
| `POST /api/readings` | sim | Valida (zod), grava a leitura e avalia alertas |
| `GET /api/readings?pointId=&from=&to=&limit=&order=` | não | Histórico. `from`/`to` em epoch ms ou ISO 8601; `limit` 1–10000 (padrão 500, pega as **mais recentes**); `order` asc (padrão) ou desc |
| `GET /api/config/:deviceId` | sim | `{a, b, limit}` do ponto do dispositivo |
| `PUT /api/points/:id` | não | Altera `name` e/ou `limit` (padrão 9,0 %) |
| `POST /api/calibration` | não | 3+ pares `{raw, moisture}` → `a`, `b`, `R²`; **salva** o registro |
| `GET /api/points` | não | *(extra)* pontos com última leitura, margem e status |
| `GET /api/alerts?active=1&pointId=` | não | *(extra)* alertas |
| `GET /api/calibration?pointId=` | não | *(extra)* histórico de calibrações |
| `POST /api/calibration/:id/apply` | não | *(extra)* aplica a calibração salva ao ponto |

Payload de `POST /api/readings`:

```json
{ "deviceId": "esp32-p03", "pointId": "P-03", "raw": 2200.4, "tempC": 24.5,
  "moisture": 9.0, "ts": 1800000000000, "simulated": false }
```

Pontos de exemplo: `P-01` Pilha 1 (`esp32-p01`), `P-03` Pilha 2 (`esp32-p03`), `C-01` Correia 1 (`esp32-c01`).

## Decisões tomadas

1. **Chave de API** gerada na 1ª execução e guardada no SQLite (não em arquivo versionado). O simulador (etapa 2) a lê do mesmo banco.
2. **Campo extra `simulated`** (opcional, padrão `false`) no payload, para sustentar a etiqueta SIMULADO. O firmware real não precisa enviá-lo; o simulador sempre envia `true`.
3. **`raw`** é a leitura *já filtrada* (mediana de 15 + média móvel exponencial), a mesma usada na conta `umidade = a·raw + b`. O servidor guarda `moisture` como veio do dispositivo (não recalcula).
4. **`ts`** em milissegundos. Se for anterior a 2020 (relógio sem NTP) ou mais de 10 min no futuro, o servidor usa o próprio horário e informa `tsSource: "servidor"`.
5. **`deviceId` deve corresponder ao ponto** (`409` se não bater; `404` se o ponto não existir).
6. **Alerta:** abre com 3 leituras seguidas `> limite` (exatamente no limite não conta); fecha com 3 seguidas `≤ limite`; no máximo 1 alerta aberto por ponto; usa o limite vigente. O alerta herda a etiqueta `simulated` da leitura que o disparou.
7. **Status do card:** `alerta` (alerta aberto) › `atencao` (umidade > 90 % do limite, ou acima do limite sem 3 seguidas) › `ok`; `sem_dados` se nunca houve leitura.
8. **Calibração em dois passos:** `POST /api/calibration` calcula e salva; aplicar ao ponto é uma ação explícita (botão na tela, etapa 3). Aplicar **não recalcula** o histórico. Há avisos para R² < 0,95 e para menos de 5 pares (o mínimo aceito é 3).
9. **Calibração padrão do 1º boot:** `a = -0,005`, `b = 20` (sensor capacitivo: mais úmido → leitura menor). Valores **ilustrativos**, não validados com minério — é obrigatório calibrar com amostras de estufa.
10. **Mensagens de validação do zod** ficam em inglês (campo `issues` da resposta); as mensagens próprias da API estão em português.

## Limitações conhecidas (até aqui)

- **Sem login no painel:** as rotas usadas pelo painel (`PUT /api/points`, `POST /api/calibration`, etc.) são abertas, e a chave de API ficará visível em Configurações. Uso local/rede interna apenas — **não exponha à internet**.
- Calibração linear única por ponto; sem compensação por temperatura nem por tipo de minério.
- Sem rotina de limpeza/retenção de leituras antigas.
- Nenhum valor foi validado com sensor real ou minério real.

## O que foi (e o que não foi) verificado nesta etapa

- ✅ `npm test`: 25/25 passando — regressão linear com valores conferidos à mão (a, b, R²), autenticação, validação, filtros, regra dos 3 alertas seguidos, configuração, calibração e aplicação.
- ✅ `tsc` sem erros de tipo no código do projeto.
- ⚠️ **Não executado:** `npm install`, `next dev` e `better-sqlite3`. O ambiente onde a etapa foi construída não tinha acesso à internet. A lógica foi testada chamando os handlers diretamente (com `Request`/`Response` padrão) sobre um banco em memória via `node:sqlite`; a camada `src/lib/db.ts` (better-sqlite3) e os arquivos `src/app/api/**/route.ts` são finos e **ainda precisam do primeiro `npm run dev` real** para serem confirmados.
