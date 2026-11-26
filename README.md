# OREMETRIX

Protótipo de **medição online da umidade de minério de ferro** para TCC do SENAI (demanda da Vale S/A).
Substitui a coleta manual de amostras com resultado tardio por medição contínua em pilhas e correias transportadoras, com envio em tempo real via HTTP para painel web e alertas automáticos.

> **Regra de honestidade — Protótipo em escala:** este projeto usa **ESP32 + sensor de umidade capacitivo analógico + DS18B20** e **não é uma solução industrial**. O sistema também funciona sem hardware por meio de um simulador (`scripts/simulator.ts`). Todo dado gerado pelo simulador é marcado com `simulated: true` e exibido na interface com a etiqueta visível **SIMULADO**. Nunca apresente dados simulados como medições reais.

---

## Status da entrega

| Etapa | Conteúdo | Situação |
|---|---|---|
| 1 | Backend Next.js + SQLite (`better-sqlite3`) + testes de calibração e API | **Implementada e testada** (`28/28` testes passando) |
| 2 | Simulador (`scripts/simulator.ts` e `scripts/seed.ts`) | **Implementada e executada ponta a ponta** (alertas abrem e fecham no cenário `alert`) |
| 3 | Painel web em pt-BR (Painel, Histórico, Calibração, Configurações) | **Implementada** (`typecheck` e `build` passando; UI ainda não validada visualmente no navegador) |
| 4 | Firmware ESP32 (`firmware/`, PlatformIO / Arduino) | **Implementada** (`pio run` ainda não executado: precisa de PlatformIO instalado) |
| 5 | `README.md` final e revisão | **Concluída** |

---

## Arquitetura do repositório

```text
.
├── firmware/
│   ├── platformio.ini             # Configuração PlatformIO (esp32dev, Arduino)
│   ├── include/secrets.h.example  # Modelo de credenciais Wi-Fi e API Key (nunca commitar secrets.h)
│   └── src/
│       ├── config.h               # Pinos, filtragem, calibração padrão, URL e IDs
│       └── main.cpp               # Leitura ADC + DS18B20, mediana + EMA, Preferences, fila offline e HTTP
├── scripts/
│   ├── seed.ts                    # Inicializa data/oremetrix.db com os 3 pontos de exemplo
│   └── simulator.ts               # Simulador de 3 cenários (estável, deriva, ruidoso)
├── src/
│   ├── app/
│   │   ├── page.tsx               # Tela Painel (cards, faixa de alertas, gráficos Recharts)
│   │   ├── historico/page.tsx     # Tela Histórico (filtros por ponto/período e exportação CSV)
│   │   ├── calibracao/page.tsx    # Tela Calibração (regressão linear, gráfico de dispersão e aplicação)
│   │   ├── configuracoes/page.tsx # Tela Configurações (status do simulador, chave de API, limites)
│   │   └── api/                   # Rotas App Router (readings, config, points, calibration, alerts, settings)
│   ├── components/                # Navbar, PointCard, MoistureChart, AlertBar, SimulatedBadge, StatusDot
│   ├── hooks/usePolling.ts        # Hook de polling automático para o painel
│   └── lib/                       # Banco SQLite, schema, repositório, validação Zod, calibração, alertas
├── tests/                         # Testes unitários e de handlers da API (calibration.test.ts, api.test.ts)
└── data/                          # Diretório onde data/oremetrix.db é criado em tempo de execução
```

Identidade visual configurada em `tailwind.config.js`, `src/app/globals.css` e `src/app/layout.tsx`: fundo azul-marinho `#0b1f3a`, destaque verde `#22c55e`, tipografia `Space Grotesk` (títulos) e `Inter` (corpo).

---

## Como rodar

### Pré-requisitos

- **Node.js `>= 20.9`** (testado com Node `v26.13.1` e npm `11.20.0`).
- Em Windows com PowerShell onde `npm.ps1` esteja bloqueado pela ExecutionPolicy, utilize `npm.cmd` ou `cmd /c "npm ..."`.

### 1. Instalar dependências e rodar testes

```bash
npm install
npm test
```

> **Nota sobre scripts nativos (`better-sqlite3`):** se a instalação do `better-sqlite3` falhar, rode `npm rebuild better-sqlite3` (precisa de Node 20.9+; em Windows, as ferramentas de build do Visual Studio podem ser exigidas).

### 2. Subir o painel e o backend

```bash
npm run dev
```

Acesse **http://localhost:3000**.

- Na primeira execução (ao inicializar a conexão em `src/lib/db.ts`), o banco `data/oremetrix.db` é criado automaticamente com:
  - **3 pontos de exemplo:** `P-01` ("Pilha 1", `esp32-p01`), `P-03` ("Pilha 2", `esp32-p03`) e `C-01` ("Correia 1", `esp32-c01`), todos com limite padrão `9,0%` e calibração ilustrativa (`a = -0,005`, `b = 20`).
  - **Chave de API aleatória:** gerada e salva apenas no banco local (`settings.api_key`). Ela pode ser visualizada e copiada na tela **Configurações** (`/configuracoes`).
- Se quiser inicializar o banco manualmente antes de rodar o simulador (sem abrir o painel antes), execute:

```bash
npm run db:seed
```

### 3. Rodar o simulador (sem hardware)

Em outro terminal, com `npm run dev` ativo (e o banco já criado):

```bash
npm run sim
```

Opções disponíveis (implementadas em `scripts/simulator.ts`):

```bash
npm run sim:fast                     # reduz o intervalo de 2 s para 500 ms
npm run sim:alert                    # ponto P-03 inicia em 8,0% com deriva rápida até cruzar 9,0%
npm run sim -- --fast --scenario=alert
```

Comportamento simulado para os 3 pontos (todos marcados com `simulated: true` e exibidos com o selo **SIMULADO**):

- **`P-01` (estável):** oscila levemente em torno de `7,0%`.
- **`P-03` (deriva):** sobe gradualmente (taxa maior em `--scenario=alert`), ultrapassa `9,0%` (disparando alerta após 3 leituras consecutivas acima do limite) e depois retorna abaixo do limite.
- **`C-01` (ruidoso):** oscila com ruído alto em torno de `8,0%`.

---

## Como ligar o hardware (ESP32)

### Esquema de ligação (texto)

Os pinos são configurados em `firmware/src/config.h`:
- `PIN_MOISTURE_ADC`: **`GPIO34`** (`ADC1_CH6` — escolhido por ser do ADC1, que não conflita com o Wi-Fi do ESP32).
- `PIN_DS18B20`: **`GPIO4`** (barramento OneWire).

```text
                   +-----------------------+
                   |         ESP32         |
                   |                       |
   Sensor          |                       |        DS18B20 (Temperatura)
 Capacitivo        |                       |      +-----------------------+
+----------+       |                       |      |                       |
| VCC  ----+------>| 3V3               3V3 |<-----+ VCC (vermelho)        |
| GND  ----+------>| GND               GND |<-----+ GND (preto)           |
| AOUT ----+------>| GPIO34          GPIO4 |<--+--+ DQ  (amarelo/branco)  |
+----------+       |                       |   |  |                       |
                   +-----------------------+   |  +-----------------------+
                                               |
                                          [Resistor 4,7 kΩ]
                                               |
                                              3V3
```

> **Atenção:** alimente o sensor capacitivo com **3,3 V** (ou use divisor resistivo na saída analógica caso seu módulo opere exclusivamente em 5 V), pois o ADC do ESP32 suporta no máximo **3,3 V** no `GPIO34`. O firmware configura resolução de 12 bits (`0–4095`) e atenuação `ADC_11db`.

### Compilação e gravação do firmware (PlatformIO)

1. Copie `firmware/include/secrets.h.example` para `firmware/include/secrets.h` (o `.gitignore` impede que `secrets.h` seja versionado).
2. Preencha `WIFI_SSID`, `WIFI_PASSWORD` e `API_KEY` (copie a chave gerada pelo backend na tela **Configurações** do painel).
3. Em `firmware/src/config.h`, ajuste `SERVER_URL` para o IP da máquina que executa o Next.js na rede local (ex.: `http://192.168.1.100:3000`) e confira `DEVICE_ID` / `POINT_ID`.
4. Compile (sem precisar de placa conectada) ou grave na placa dentro da pasta `firmware/`:

```bash
cd firmware
pio run                  # compila o firmware
pio run --target upload  # grava no ESP32 conectado via USB
pio device monitor -b 115200
```

### Funcionamento do firmware (`firmware/src/main.cpp`)

- Coleta **15 amostras** (`MEDIAN_SAMPLES`) do ADC, extrai a **mediana** e aplica **média móvel exponencial** (`EMA_ALPHA = 0.2f`).
- Calcula `umidade_% = a * leitura_filtrada + b` (limitada a `0–100%`) e lê o DS18B20.
- Sincroniza o relógio por NTP (`configTime`) e envia o timestamp em epoch ms com 64 bits. Se o NTP ainda não sincronizou, envia `ts = 0` e o servidor usa o próprio horário.
- Envia `POST /api/readings` a cada **5 s** (`SEND_INTERVAL_MS = 5000`) com header `x-api-key` (timeouts de 3 s para conectar e 5 s para responder).
- Reconecta ao Wi-Fi sem travar o loop (tentativa a cada 10 s) e mantém uma fila circular em RAM (`QUEUE_MAX_SIZE = 20`) que reenvia as leituras pendentes **em ordem** (até 5 por ciclo).
- Consulta `GET /api/config/:deviceId` na inicialização e a cada **60 s**, persistindo `a` e `b` em memória não volátil (`Preferences`, namespace `"oremetrix"`).

---

## Como calibrar o sensor

Os coeficientes padrão de primeiro boot (`a = -0,005`, `b = 20`) são **apenas ilustrativos**. Para calibração em bancada com minério real:

1. Prepare amostras de minério em diferentes faixas de umidade (recomendado **5 ou mais amostras** distribuídas na faixa de operação; o mínimo aceito pela API é **3**).
2. Registre a leitura bruta filtrada (`raw`, de `0` a `4095`) estabilizada no sensor para cada amostra e obtenha a umidade real (%) em estufa (método gravimétrico).
3. No painel web, acesse **Calibração** (`/calibracao`), selecione o ponto (ex.: `P-03`), insira os pares `(leitura bruta, umidade real %)` e clique em **Calcular Regressão**.
4. Analise os valores calculados de `a`, `b`, o coeficiente de determinação `R²` e o gráfico de dispersão com a reta ajustada. O sistema emite avisos se `R² < 0,95`, se houver menos de 5 pares ou se a inclinação `a` for positiva (em sensor capacitivo, quanto mais úmido, menor a leitura: inclinação positiva costuma indicar dado digitado errado).
5. Clique em **Aplicar ao `<ponto>`** (`POST /api/calibration/:id/apply`). Com `R² < 0,95` a API recusa (`409 r2_baixo`); o painel pede confirmação e só então envia com `?force=1`. Os novos coeficientes são gravados no ponto e enviados ao ESP32 na próxima busca de `GET /api/config/:deviceId`.

---

## API do Backend

| Método e rota | Header `x-api-key` | Descrição |
|---|---|---|
| `POST /api/readings` | Sim | Valida payload (`zod`), autentica chave, grava leitura e avalia regra de alerta |
| `GET /api/readings?pointId=&from=&to=&limit=&order=` | Não | Consulta histórico (`from`/`to` em epoch ms ou ISO 8601; `limit` 1–10000, padrão 500; `order` `asc` ou `desc`) |
| `GET /api/config/:deviceId` | Sim | Retorna `{ a, b, limit }` vigentes para o dispositivo |
| `GET /api/points` | Não | Lista pontos com última leitura, margem (`limit - moisture`), `alertOpen` e `status` |
| `PUT /api/points/:id` | Não | Atualiza `name` e/ou `limit` (padrão `9,0%`) |
| `POST /api/calibration` | Não | Calcula regressão linear (mín. 3 pares), retorna `a`, `b`, `R²`, `warnings` e salva o registro |
| `GET /api/calibration?pointId=` | Não | Lista histórico de calibrações |
| `POST /api/calibration/:id/apply[?force=1]` | Não | Aplica os coeficientes salvos ao ponto. Recusa (`409`) se `R² < 0,95`, a menos que `force=1` |
| `GET /api/alerts?active=1&pointId=&limit=` | Não | Lista alertas abertos ou históricos |
| `GET /api/settings/api-key` | Não (só `localhost`) | Retorna a chave de API local para a tela Configurações; responde `403` para acessos vindos de outro endereço |

---

## Decisões tomadas

Quando faltou especificação explícita, foram adotadas as opções mais simples e registradas abaixo:

1. **Chave de API no SQLite:** gerada aleatoriamente no 1º boot (`randomBytes(24).toString("hex")`) e guardada na tabela `settings` (nunca em arquivo versionado). O simulador lê a chave direto do banco local e a tela Configurações a exibe via `GET /api/settings/api-key`.
2. **Identificação explícita de simulação (`simulated`):** campo booleano opcional (padrão `false`) em `POST /api/readings`. O firmware real não precisa enviá-lo; o simulador sempre envia `simulated: true`, e alertas herdam essa marcação.
3. **Filtragem no ESP32 e persistência do valor reportado:** `raw` enviado no payload corresponde ao valor **já filtrado** (mediana de 15 + EMA α=0,2) usado no cálculo de `moisture`. O servidor persiste `moisture` como recebido.
4. **Normalização de timestamp (`ts`):** esperado em epoch ms; se `ts` vier antes de 01/01/2020 (ESP32 sem NTP) ou mais de 10 min no futuro, o servidor substitui pelo horário do servidor e informa `tsSource: "servidor"`. O `main.cpp` chama `configTime()` (NTP) e envia 64 bits; sem sincronização enviaria `0`, e o servidor assume o horário dele.
5. **Vínculo ponto ↔ dispositivo:** `POST /api/readings` exige que `deviceId` corresponda ao `pointId` cadastrado (`409` se divergir; `404` se o ponto não existir).
6. **Histerese de alertas (anti falso alarme):** um alerta só abre após **3 leituras seguidas** estritamente `> limite` (valor exato no limite não abre), e só é resolvido após **3 leituras seguidas** `<= limite`. Há no máximo 1 alerta aberto por ponto.
7. **Status do card:** `alerta` (alerta aberto) > `atencao` (umidade `> 90%` do limite ou acima do limite antes de completar 3 leituras) > `ok`; `sem_dados` quando não há leituras.
8. **Calibração em duas etapas:** `POST /api/calibration` calcula e registra a regressão; a aplicação ao ponto (`POST /api/calibration/:id/apply`) é explícita e **não recalcula** leituras passadas.
9. **Simulador desacoplado do gerenciador de processos Web:** a tela **Configurações** detecta automaticamente se há leituras simuladas recentes (últimos 15 s) para indicar status ativo/inativo e instrui a execução via CLI (`npm run sim` / `npm run sim:alert`), evitando gerenciar processos filhos a partir das rotas Next.js.
10. **Coeficientes no simulador:** ao iniciar, `scripts/simulator.ts` busca a calibração vigente de cada ponto em `GET /api/config/:deviceId` (se a inclinação for negativa); se o servidor não responder, usa os valores ilustrativos `a = -0,005`, `b = 20`.

---

## Limitações conhecidas e o que ficou de fora

- **Botão interativo ligar/desligar simulador na tela Configurações:** o painel exibe o status do simulador e os comandos de terminal, mas **não possui** botão que inicie/encerre o processo `simulator.ts` diretamente pelo navegador.
- **Compilação do firmware não verificada neste ambiente:** o `pio` (PlatformIO CLI) não está instalado nesta máquina, portanto `pio run` ainda precisa ser executado em um ambiente com PlatformIO para confirmar a compilação.
- **Sem autenticação no painel web:** rotas administrativas (`PUT /api/points/:id`, `POST /api/calibration` e `/apply`) são abertas; só a chave de API tem a trava de `localhost`, que **não é autenticação** (o cabeçalho `Host` pode ser forjado). Uso exclusivo em rede local/bancada — **não expor à internet**.
- **Modelo físico simplificado:** calibração linear simples por ponto, sem compensação automática por temperatura (o DS18B20 apenas registra/exibe °C), sem validação com minério real e sem rotina automática de retenção/limpeza de dados antigos no SQLite.
- **Simulador lê a calibração só ao iniciar:** se a calibração de um ponto mudar com o simulador rodando, reinicie-o.
- **Segredos:** o `.gitignore` agora exclui `data/`, `.env*`, `firmware/include/secrets.h`, `node_modules/` e `.next/`. (Antes não existia, apesar de o README dizer que existia.)

---

## O que foi (e o que não foi) verificado

- ✅ **`npm test`:** 28/28 testes passando (`calibration`, `api` e `http`).
- ✅ **`npm run typecheck` e `npm run build`:** passando.
- ✅ **Execução ponta a ponta:** servidor + `npm run sim:alert --fast`: alertas abrem e fecham; chave de API devolve `403` fora de `localhost`; calibração com `R² < 0,95` é recusada sem `force=1`.
- ⚠️ **Não verificado:** aparência das telas no navegador e compilação do firmware (`pio run`, PlatformIO ausente). O firmware foi revisado, mas nunca compilado nem gravado em placa.
