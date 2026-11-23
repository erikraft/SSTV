# Relatório de auditoria de segurança — ErikrafT SSTV

- **Repositório:** https://github.com/erikraft/SSTV
- **Base auditada em modo somente leitura:** `ea020253b6fe57e02fa656670a1489c0238ac714`
- **Data:** 2026-11-23
- **Método:** revisão estática do código-fonte, árvore completa versionada, configurações de build/hospedagem e metadados dos commits recentes. A auditoria da base foi concluída antes de qualquer alteração desta PR.
- **Escopo:** aplicação web Vite/JavaScript executada no navegador; sem testes contra produção.

## 1. Resumo executivo

O repositório contém uma aplicação cliente de SSTV. O processamento de áudio e imagem acontece no navegador. Não foram encontrados servidores próprios, rotas de API, server actions, edge functions, webhooks, autenticação, pagamentos ou banco de dados remoto.

Os riscos concretos concentram-se em disponibilidade do navegador ao processar áudio local, validação de mensagens do Web Worker e configuração de permissões. A configuração atual da Vercel também bloqueava deliberadamente o microfone, impedindo a funcionalidade solicitada.

### Achados ranqueados

| ID | Criticidade | Confiança | Situação |
|---|---|---|---|
| SSTV-01 | MÉDIA | CONFIRMADA | Mitigado nesta PR; permanece uma limitação de pico de memória durante a descompressão inicial pelo navegador |
| SSTV-02 | BAIXA | CONFIRMADA | Corrigido nesta PR — política de microfone incompatível com a funcionalidade |
| SSTV-03 | MÉDIA | PROVÁVEL | Não verificável sem instalação/auditoria das dependências; lockfile ausente |
| SSTV-04 | BAIXA | CONFIRMADA | Corrigido nesta PR — falha do Worker podia deixar a interface de decodificação travada |
| SSTV-05 | BAIXA | CONFIRMADA | Endurecido nesta PR — construção de mensagem de erro por `innerHTML`, embora o texto variável estivesse escapado |
| SSTV-06 | MÉDIA | CONFIRMADA | Corrigido nesta PR — dimensões da imagem eram verificadas somente após a decodificação do navegador |

### SSTV-01 — Consumo excessivo de memória/CPU ao decodificar áudio

- **Criticidade:** MÉDIA
- **Confiança:** CONFIRMADA
- **Evidência na base auditada:**
  - `src/decoder.js:26` define um limite de tamanho de arquivo de 50 MB.
  - `src/decoder.js:757-791` valida o tamanho, mas chama `decodeAudioData()` sem limite de duração e copia o canal de áudio inteiro para outro `Float32Array`.
  - `src/worker/decoder.js:3-4` recebe e desestrutura a mensagem sem validar seu formato, sample rate, tamanho, FFT ou modo.
  - `src/sstv/decoder.js:71, 99, 117, 203` realiza fatiamentos e análise repetida dos samples durante o processamento.
- **Impacto plausível:** um arquivo de áudio comprimido longo, escolhido pelo próprio visitante, pode expandir para uma quantidade muito maior de dados em memória e consumir CPU durante a decodificação. O cenário demonstrável é indisponibilidade da aba/dispositivo do visitante; não há evidência de execução remota de código ou impacto em servidor.
- **Correção nesta PR:** limite de 10 minutos e validação de sample rate, tamanho do array, FFT e VIS mode no cliente e no Worker; mensagens do Worker passam a ter tipos explícitos; o buffer de imagem é enviado por linha para renderização incremental.
- **Risco residual:** `decodeAudioData()` precisa descomprimir o arquivo antes que a aplicação consiga ler sua duração. O limite de 10 minutos impede o processamento posterior de áudios maiores, mas não garante impedir todo pico de memória durante a descompressão nativa do navegador.

### SSTV-02 — Política de permissões bloqueava o microfone

- **Criticidade:** BAIXA (incompatibilidade funcional, não uma vulnerabilidade de acesso)
- **Confiança:** CONFIRMADA
- **Evidência na base auditada:** `vercel.json:37-38` declarava `microphone=()`, bloqueando o uso de microfone pelo próprio site.
- **Impacto:** a API de captura de áudio não poderia ser usada sob essa política, mesmo após consentimento explícito do usuário.
- **Correção nesta PR:** política alterada para `microphone=(self)`; câmera e geolocalização continuam bloqueadas. A captura continua condicionada à permissão explícita do navegador e ao contexto seguro (HTTPS/localhost).

### SSTV-03 — Reprodutibilidade e vulnerabilidades de dependências

- **Criticidade:** MÉDIA
- **Confiança:** PROVÁVEL quanto à existência de dependência vulnerável; CONFIRMADA quanto à ausência de lockfile na árvore auditada.
- **Evidência na base auditada:** `package.json:14` usa intervalo de versão para Vite (`^6.4.6`); a árvore versionada não contém `package-lock.json`, `npm-shrinkwrap.json` ou `yarn.lock`.
- **Impacto:** instalações em momentos diferentes podem resolver versões transitivas diferentes. Sem lockfile e sem execução do gerenciador, não é correto afirmar que há ou não uma CVE explorável.
- **O que falta confirmar:** executar `npm install`/geração do lockfile em ambiente controlado e `npm audit` (ou auditoria equivalente) no commit final; revisar cada advisory pelo caminho de dependência e possibilidade real de exploração.
- **Limitação desta auditoria:** `npm audit` não foi executado nesta sessão. Nenhuma CVE ou versão vulnerável foi inventada.

### SSTV-04 — Erro fatal do Worker não recuperava o estado da interface

- **Criticidade:** BAIXA
- **Confiança:** CONFIRMADA
- **Evidência na base auditada:** `src/decoder.js:902` apenas registrava `decoderWorker.onerror` no console; o botão de decodificação podia permanecer desabilitado após uma falha do Worker.
- **Impacto:** falha de disponibilidade/recuperação da interface para o próprio visitante.
- **Correção nesta PR:** o handler agora encerra o progresso, apresenta mensagem segura e restaura o estado do botão.

### SSTV-05 — Mensagem de erro montada por innerHTML

- **Criticidade:** BAIXA (endurecimento preventivo; XSS não confirmada)
- **Confiança:** CONFIRMADA quanto ao uso de `innerHTML`; NÃO CONFIRMADA quanto a XSS explorável.
- **Evidência na base auditada:** `src/decoder.js:38` interpolava uma mensagem em `innerHTML`, mas a função `escapeHtml()` escapava os caracteres HTML do texto variável e o link de contato era constante.
- **Impacto:** mantém uma superfície de injeção DOM desnecessária. A evidência disponível não prova que um atacante consiga executar JavaScript.
- **Correção nesta PR:** construção com `createElement`, `textContent` e `replaceChildren`; removida a necessidade de HTML interpolado.


### SSTV-06 — Decodificação de imagem antes de validar dimensões

- **Criticidade:** MÉDIA
- **Confiança:** CONFIRMADA
- **Evidência na base auditada:** `src/encoder.js:10-12` definia limites de 15 MB, 8192 pixels por dimensão e 16 megapixels; porém `src/encoder.js:35-48` criava e carregava um elemento `Image` antes de conferir `naturalWidth`, `naturalHeight` e a contagem de pixels.
- **Impacto plausível:** uma imagem comprimida pequena com dimensões extremas pode exigir muita memória durante a decodificação nativa antes de a validação JavaScript ser executada. O cenário exige que o visitante selecione o arquivo; não prova execução remota de código.
- **Correção nesta PR:** leitura limitada de cabeçalhos PNG, JPEG e WebP (até 2 MiB) e validação de dimensões/pixels antes de criar o elemento `Image`. A validação após o carregamento permanece como segunda barreira.
- **Limitação residual:** JPEGs com metadados anteriores ao marcador de frame além dos primeiros 2 MiB são rejeitados por segurança. A análise de cabeçalho não substitui as proteções internas do decodificador de imagem do navegador.

## 2. Reconhecimento

### Stack e hospedagem

- HTML, CSS, JavaScript em módulos ES e Vite.
- Tailwind CSS via plugin Vite.
- PhotoSwipe para galeria.
- vanilla-cookieconsent para preferências de cookies.
- Hospedagem/configuração versionada para Vercel (`vercel.json`).
- Web Worker local para decodificação SSTV.
- Web Audio API e Canvas para processamento de áudio/imagem.
- IndexedDB para histórico local de imagens decodificadas.
- Não foi encontrado código de Supabase, Firebase, Stripe, Mercado Pago, APIs de IA, e-mail, SMS ou WhatsApp.

### Superfície de ataque

- A aplicação é uma SPA estática. `vercel.json` reescreve os caminhos para `index.html`; não foram encontradas rotas de API ou endpoints de negócio no repositório.
- Entradas locais: arquivo de áudio no decoder, arquivo de imagem no encoder e, após esta PR, fluxo de áudio capturado pelo microfone mediante permissão explícita.
- Mensagens entre a interface e o Web Worker são uma fronteira interna importante e agora são validadas.
- IndexedDB contém histórico local de imagens; não é um banco remoto nem um endpoint acessível pela rede.
- A galeria usa URLs de objeto locais e conteúdo de imagem criado pelo próprio decoder.

### Autenticação, autorização e dados

- Não há login, sessão, contas ou papéis de usuário no código.
- Não há recursos remotos por ID; IDOR/BOLA e BFLA não se aplicam à aplicação atual.
- Não há escrita de corpo de requisição em banco remoto; mass assignment não se aplica.
- Não há webhooks nem integração de pagamento; validação de assinatura/idempotência não se aplica.
- Arquivos selecionados e áudio capturado são processados no navegador. O histórico é gravado no IndexedDB local. Não foi encontrado fluxo que envie esses arquivos para um servidor.
- Não há chaves de API necessárias para o funcionamento da aplicação.

### Segredos e histórico

- A árvore atual não contém arquivos `.env` nem arquivos de configuração de secrets.
- As buscas de código por nomes comuns de tokens/segredos não retornaram correspondências.
- Os metadados dos commits recentes foram consultados. A inspeção de todos os blobs de todos os commits históricos não pôde ser concluída nesta sessão; portanto, a ausência de segredo em todo o histórico é **NÃO VERIFICÁVEL**.
- A verificação de secrets deve ser repetida com um scanner histórico dedicado antes de considerar o histórico inteiro limpo.

### Funcionalidades com custo por uso

- Não há chamadas a APIs pagas, IA, SMS, e-mail, armazenamento remoto ou funções serverless de negócio no código encontrado.
- Há custo operacional normal da hospedagem estática e consumo local de CPU/memória do dispositivo.
- `src/analyticsConsent.js` lista Google Tag Manager e Microsoft Clarity como serviços de consentimento; não foi localizado carregador/script ativo desses serviços na árvore analisada. A configuração externa do painel não é verificável aqui.

## 3. Checagem obrigatória das cinco falhas prioritárias

1. **Rate limit/consumo sem limite:** não existem rotas de login, cadastro, OTP, IA, mensagens ou APIs caras. Rate limit por IP/usuário não é aplicável. O risco local de consumo excessivo de áudio é SSTV-01 e recebeu limites de duração/tamanho de amostras nesta PR.
2. **IDOR/BOLA:** não há endpoints que recebam IDs de recursos pertencentes a usuários. IDs do histórico são locais ao IndexedDB.
3. **Mass assignment:** não há backend nem persistência remota de objetos de requisição.
4. **Webhook sem verificação:** não há webhooks ou pagamentos no projeto.
5. **Banco aberto:** não há Supabase/Firebase nem migrations, policies RLS ou regras Firestore/Storage versionadas. IndexedDB é local; políticas de banco remoto não se aplicam.

## 4. OWASP Top 10:2025

| Categoria | Resultado da revisão |
|---|---|
| A01 — Broken Access Control | Não aplicável no código atual: não há autenticação, endpoints privados, funções administrativas ou recursos remotos por ID. CORS/SSRF não foram identificados como superfícies de API. |
| A02 — Security Misconfiguration | Cabeçalhos CSP, HSTS, X-Content-Type-Options, X-Frame-Options e Referrer-Policy já existem em `vercel.json`. Encontrada a política de microfone incompatível (SSTV-02), corrigida nesta PR. `style-src 'unsafe-inline'` reduz a rigidez da CSP, mas é usado no contexto de estilos dinâmicos/inline; não foi demonstrado um vetor de injeção CSS explorável. |
| A03 — Software Supply Chain Failures | Lockfile ausente e intervalos de versão: SSTV-03. Auditoria de advisories pendente; nenhum CVE foi declarado sem evidência. |
| A04 — Cryptographic Failures | Não foram encontrados armazenamento de senhas, tráfego de pagamento, segredos criptográficos ou dados sensíveis remotos. `crypto.randomUUID()` é usado para IDs locais, não como mecanismo de autenticação. |
| A05 — Injection | Não foram encontrados SQL, comandos de sistema, `eval` ou `new Function`. O `innerHTML` encontrado usava escape explícito; foi removido por defesa em profundidade (SSTV-05). |
| A06 — Insecure Design | Limites de processamento de áudio (SSTV-01) e validação tardia de dimensões de imagem (SSTV-06) foram corrigidos com verificações antes do processamento e validação adicional no Worker. |
| A07 — Authentication Failures | Não há autenticação implementada; não existem login, recuperação de senha ou OTP para testar. |
| A08 — Software or Data Integrity Failures | Não foram encontrados scripts executáveis de terceiros carregados de CDN nem mecanismos de atualização remota de código. O risco de dependências sem lockfile está registrado em A03. |
| A09 — Security Logging and Alerting Failures | Não há backend ou eventos de autenticação/segurança para monitoramento centralizado. Erros são registrados localmente no console; não foi encontrada integração de alertas. |
| A10 — Mishandling of Exceptional Conditions | Falha do Worker não restaurava o estado da interface (SSTV-04), corrigida nesta PR. A descompressão nativa do áudio ainda pode ter pico de memória antes da validação de duração, conforme risco residual de SSTV-01. |

## 5. Validação e limitações

### Verificações executadas

- Inspeção da árvore versionada completa da base auditada.
- Leitura dos arquivos de entrada, encoder, decoder, Worker, decoder SSTV, IndexedDB, consentimento, pacote e configuração Vercel.
- Busca no código por padrões comuns de segredos e APIs/endpoints.
- Revisão dos metadados dos commits recentes.
- Dez testes unitários de validação de áudio e cabeçalhos/dimensões de imagem executados com Node.js em ambiente isolado: 10 passaram, 0 falharam. Os testes foram executados sem instalar as dependências Vite do projeto. O helper e os casos de teste foram executados sem instalar as dependências Vite do projeto.

### Não executado / não verificável

- `npm audit`: não executado nesta sessão; não há lockfile versionado.
- Build Vite e testes em navegador real: dependem de instalação e execução local/CI; não são declarados como aprovados neste relatório.
- Teste físico de microfone, cancelamento de eco, diferentes codecs de MediaRecorder e autoplay em Android/iOS/desktop.
- Teste com arquivos SSTV de referência para todos os modos e comparação de pixels do decoder.
- Configurações privadas do painel Vercel, DNS, WAF, secrets de ambiente e logs de produção.
- Varredura exaustiva de secrets em todos os blobs do histórico Git.
- Verificação em buscadores/crawlers de metadados SEO.

**Conclusão:** a auditoria do código versionado identificou e corrigiu problemas concretos de permissões, validação de entrada, tratamento de erro e construção DOM. Não há evidência no repositório atual de backend exposto, autenticação quebrada, IDOR, mass assignment, webhook ou banco remoto aberto. A auditoria de dependências e a varredura histórica completa de segredos permanecem pendentes e não devem ser tratadas como aprovadas.


---

## 6. Auditoria complementar após o merge da PR #5

- **Base revisada em modo somente leitura:** `7082cbb0c27070f2fc3bee5241451d167cd68406`.
- **Escopo adicional:** seletor de modo, detecção VIS, estimativa de frequência FFT, mensagens do Worker, efeito Matrix e formulário de feedback.
- **Sem testes contra produção:** nenhuma rota ou serviço de produção foi chamado.

### SSTV-07 — Detecção automática sensível ao alinhamento e a ruído fora da banda

- **Criticidade:** MÉDIA (confiabilidade e disponibilidade do processamento local).
- **Confiança:** CONFIRMADA quanto às fragilidades algorítmicas no código; a causa exata da gravação que o usuário decodificou permanece NÃO VERIFICÁVEL sem o arquivo original.
- **Evidência da base:** `src/sstv/decoder.js` selecionava o maior pico de todo o espectro sem limitar a faixa de frequências analisada; as janelas do cabeçalho eram posicionadas no começo dos segmentos, próximas às transições, e o primeiro candidato compatível podia ser aceito antes do início real do líder, deslocando o ponto inicial da imagem; e a função de interpolação de pico em `src/utils.js` aplicava um deslocamento sub-bin com fator incorreto para a interpolação parabólica.
- **Impacto plausível:** interferência forte fora da banda SSTV, bordas de tom ou estimativas de frequência imprecisas podem atrapalhar a identificação do cabeçalho/VIS e a leitura de tons de pixel, gerando falha ou imagem degradada.
- **Correção nesta PR:** restringe a busca de picos às bandas esperadas; centraliza as janelas de amostragem do cabeçalho e dos bits VIS; refina o início real do cabeçalho com pontuação Goertzel dos quatro tons do preâmbulo (sem deslocar a imagem alguns milissegundos); usa interpolação parabólica limitada a meio bin; mantém somente a detecção automática e remove o caminho `forcedMode`. A busca inicial usa passos de 5 ms e a etapa de refinamento usa passos de 0,25 ms.
- **Limitação:** não foi fornecido o áudio que reproduziu o problema. Testes sintéticos de cabeçalho/VIS não substituem a validação com a gravação original.

### Revisão da implementação do decoder

A implementação mantém a detecção automática do modo SSTV pelo cabeçalho VIS e calcula o início da imagem após o cabeçalho. Caminhos alternativos que ignoram esse offset não são utilizados.

### Cinco verificações prioritárias

1. **Rate limit/consumo:** não existem endpoints de servidor para login, OTP, IA, e-mail ou SMS. O processamento local continua limitado a 50 MB, 10 minutos e 30 milhões de amostras. Risco residual: `decodeAudioData()` descomprime antes da validação de duração.
2. **IDOR/BOLA:** nenhum endpoint recebe IDs de recursos remotos de usuários.
3. **Mass assignment:** não há backend que persista corpos de requisição.
4. **Webhooks:** não há integração de pagamentos ou webhooks.
5. **Banco aberto:** não há Supabase/Firebase, migrations SQL ou regras RLS/Firestore/Storage versionadas. IndexedDB é local ao navegador.

### OWASP Top 10:2025

| Categoria | Resultado |
|---|---|
| A01 Broken Access Control | Nenhum endpoint privado, sessão, função administrativa, IDOR ou SSRF foi encontrado na SPA estática. |
| A02 Security Misconfiguration | CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy e Permissions-Policy estão definidos em `vercel.json`. `style-src 'unsafe-inline'` permanece como endurecimento futuro; não foi demonstrada exploração. |
| A03 Software Supply Chain Failures | Lockfile ausente. `npm audit` não foi executado; não se afirma que as dependências estejam livres de advisories. |
| A04 Cryptographic Failures | Não foi identificado armazenamento de credenciais, pagamento ou dados sensíveis em backend. |
| A05 Injection | Mensagens de erro usam DOM seguro/`textContent`; não foram identificados SQL, comandos de sistema ou avaliação dinâmica. |
| A06 Insecure Design | Limites de áudio/imagem permanecem; a detecção VIS e a estimativa de frequência receberam endurecimento. |
| A07 Authentication Failures | Não existe autenticação no produto. |
| A08 Software or Data Integrity Failures | Não foi encontrado carregador remoto de código ou mecanismo de atualização dinâmica. Dependências de build continuam sujeitas à resolução do npm sem lockfile. |
| A09 Security Logging and Alerting Failures | Sem backend ou alertas centralizados; erros são tratados localmente no navegador. |
| A10 Mishandling of Exceptional Conditions | Payload inválido e falhas do Worker recebem tratamento; o pico de memória nativo antes da validação do áudio continua como risco residual. |

### Testes e limites da auditoria complementar

- Foram adicionados 11 casos sintéticos ao teste do decoder: detecção dos sete VIS modes, cabeçalho com e sem silêncio inicial, alinhamento em 44,1 kHz, interpolação parabólica e rejeição de áudio sem cabeçalho.
- Uma simulação isolada do algoritmo com sinais sintéticos em 11.025, 44.100 e 48.000 Hz, com zero e 123 ms de silêncio inicial, mediu erro de alinhamento inferior a 0,3 ms. Isso não equivale à execução de `npm test` nem valida uma gravação real.

### Limites da auditoria complementar

- `npm audit` não foi executado: o repositório não possui lockfile e a sessão não teve acesso de rede ao npm registry para gerar um sem alterar a resolução das dependências.
- `npm run build` não foi executado porque as dependências não estão instaladas nesta sessão.
- O áudio original que apresentou a imagem bugada não foi fornecido; não é possível confirmar que a correção reproduza exatamente o caso relatado.
- Não foram executados testes contra produção, auditoria de painel Vercel, scanner histórico completo de segredos ou análise de infraestrutura externa.
- Nenhuma CVE ou vulnerabilidade de dependência foi inventada.

**Conclusão complementar:** a superfície de ataque continua limitada a uma SPA estática e ao processamento local. A correção mantém a detecção automática sem o seletor manual, alinha o início do sinal antes de decodificar pixels, remove o efeito Matrix e endurece a estimativa de frequência. A auditoria de supply chain e a validação com o áudio real permanecem pendentes.


---

## 7. Auditoria complementar — encoder, enquadramento e formatos de imagem

- **Base desta revisão:** branch `fix/encoder-audio-timing-image-framing`, derivada de `main`.
- **Escopo:** `src/encoder.js`, `src/image-validation.js`, `src/tone-generator.js`, `src/encoder.css`, markup do encoder, testes e dependências/configuração já descritas acima.
- **Sem requisições contra produção e sem upload de arquivos do usuário.**

### SSTV-08 — Sinal de pixel praticamente abafado e deriva temporal na codificação

- **Criticidade:** ALTA para a funcionalidade de codificação; não é uma vulnerabilidade de acesso remoto.
- **Confiança:** CONFIRMADA pelo código.
- **Evidência na base:** em `src/encoder.js`, a função local `tone()` aplicava `Math.min(1, i / 24, (n - i) / 24)` em toda chamada. Cada pixel Martin 1 dura aproximadamente 5 amostras a 11.025 Hz; portanto, a rampa de 24 amostras abrangia mais do que a duração inteira de cada pixel, reduzindo drasticamente a amplitude. O mesmo código arredondava separadamente a quantidade de amostras de cada pixel (`Math.round(seconds * rate)`), acumulando erro de duração ao longo da linha e da imagem.
- **Impacto:** transmissão com imagem severamente degradada, faixas e cores incorretas ao decodificar o WAV gerado.
- **Correção proposta nesta PR:** gerador de tons com fase contínua e acumulador de amostras fracionárias; sem fade por pixel; fade curto somente nas extremidades do WAV completo.
- **Teste adicionado:** verifica a duração total de 320 pixels em Martin 1 e Martin 2 e confirma que o sinal não fica próximo do silêncio.

### SSTV-09 — Validação de formatos de imagem incompleta

- **Criticidade:** BAIXA (limitação funcional com endurecimento de entrada).
- **Confiança:** CONFIRMADA.
- **Evidência na base:** `src/encoder.js` aceitava somente `image/png`, `image/jpeg` e `image/webp`; `src/image-validation.js` somente interpretava cabeçalhos desses três formatos.
- **Impacto:** GIF e BMP válidos eram recusados mesmo quando o navegador poderia renderizá-los.
- **Correção proposta nesta PR:** suporte a GIF e BMP, com leitura limitada do cabeçalho e validação das dimensões antes da decodificação de pixels. Mantêm-se os limites de 15 MB, 8192 pixels por dimensão e 16 megapixels. SVG e formatos sem parser de cabeçalho seguro não são aceitos nesta alteração.

### SSTV-10 — Enquadramento automático sem controle manual

- **Criticidade:** BAIXA (limitação funcional).
- **Confiança:** CONFIRMADA.
- **Evidência na base:** `src/encoder.js` sempre usava escala `Math.max(320 / width, 256 / height)` e centralizava a imagem, cortando partes que excediam o quadro sem permitir reposicionamento ou modo de ajuste integral.
- **Impacto:** o usuário não podia escolher qual parte de uma imagem fora da proporção 320×256 seria transmitida nem preservar a imagem inteira com margens.
- **Correção proposta nesta PR:** seleção entre preencher/cortar e ajustar a imagem inteira; controles horizontais e verticais para reposicionar o recorte; o preview e os pixels lidos pelo encoder usam o mesmo canvas, evitando diferença entre pré-visualização e áudio.

### Revisão de referências externas e licenças

- Não foi encontrada referência a Play Store no conteúdo do encoder, README ou aviso de terceiros revisados.
- Foi removida a referência incorreta à PR de seleção manual do projeto upstream, pois essa alteração não está incluída.
- O aviso de copyright e a licença MIT do decoder upstream foram mantidos. Removê-los seria incompatível com a obrigação de preservar o aviso de copyright e a permissão da licença para partes substanciais do código adaptado. A atribuição legal não significa que o projeto pertença ao upstream.

### Segurança e supply chain — estado desta revisão

- As entradas de imagem continuam limitadas por tamanho, dimensões e quantidade de pixels antes da criação do elemento `Image`; os cabeçalhos dos formatos adicionados são verificados antes da decodificação.
- Não foi introduzido backend, upload remoto, autenticação, banco remoto, webhook ou endpoint de custo por uso.
- O `package.json` continua sem lockfile versionado. `npm audit` e build não foram executados nesta revisão; não há base para declarar dependências livres de vulnerabilidades.
- A validação com o WAV real que originou a segunda imagem permanece pendente, pois o áudio não foi anexado. O defeito de geração foi confirmado estaticamente e coberto por testes determinísticos, mas a gravação original não pôde ser reproduzida.

**Limites:** esta revisão não comprova configurações privadas da Vercel, WAF/DNS, secrets do painel, nem a ausência de segredos em todos os blobs históricos do Git. Não foram executados testes contra produção.
