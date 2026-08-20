# Buscador Global de Livros

Buscador global de livros em catálogos gratuitos e públicos. Pesquise por título, autor ou ISBN em uma única busca e receba resultados consolidados de **+40 fontes** — com destaque para PDFs de domínio público, acesso aberto e acervos digitais brasileiros e internacionais.

A aplicação tem uma interface com tema de biblioteca arcana ("Biblioteca Arcana") e expõe uma API REST simples que agrega catálogos via APIs públicas, raspagem de HTML e buscas `filetype:pdf` em vários motores.

## Funcionalidades

- **Busca simultânea e paralela** em catálogos com API pública: Internet Archive, Open Library, Project Gutenberg, Google Books, LibriVox, Wikisource (pt), Wikilivros, OpenAlex, Crossref, **arXiv**, **DOAB**, **OAPEN**, **Semantic Scholar**, **DOAJ** e **Gallica (BnF)**.
- **Todos os catálogos HTML ativos** (Planet eBook, PDFBooksWorld, FreeComputerBooks, GetFreeEBooks, Free-eBooks.net, ManyBooks, BookBub, BookBoon, Feedbooks, Smashwords, FreeTechBooks, Bookyards, **Faded Page**) com limite de concorrência (6) para não sobrecarregar as fontes.
- **Busca precisa por ISBN** (ISBN-10/13): resolve o registro direto no Open Library e no Google Books, sem depender de correspondência textual.
- **Descoberta complementar de PDFs** em 16 buscas simultâneas na web (Google, Bing, DuckDuckGo, Yahoo, Mojeek, **Brave, Startpage, Ecosia e Yandex**), combinando título exato, ISBN, repositórios acadêmicos, bibliotecas digitais e variações do nome do arquivo, com filtro de domínios confiáveis (`archive.org`, `zenodo.org`, `core.ac.uk`, `gov.br`, `edu.br`, `scielo.org`, `arxiv.org`, `oapen.org`, `doabooks.org`, `gallica.bnf.fr`, `globalgreyebooks.com`, `fadedpage.com`, entre outros).
- **Torrent oficial do Internet Archive**: obras em domínio público ganham link para o arquivo `.torrent` oficial da própria instituição, tanto nos resultados do Internet Archive quanto anexado a resultados equivalentes de outras fontes.
- **Consolidação fuzzy de duplicatas**: o mesmo livro vindo de vários catálogos é unificado em um único cartão — unindo PDFs, capas, formatos, idiomas e descrições e contando a evidência de múltiplas fontes.
- **Metadados enriquecidos**: autores completos, editora, número de páginas e ISBN (com preferência por ISBN-13) são exibidos no cartão quando a fonte os fornece (Open Library, Google Books, Internet Archive, Faded Page, DOAB/OAPEN, Crossref e DOAJ).
- **Ranqueamento inteligente** que combina PDF direto, texto completo (TXT/ePub), quantidade de formatos, confiança da fonte, hospedeiro confiável do PDF, correspondência de título e número de fontes consolidadas.
- **Anexo de PDFs complementares** a resultados sem PDF na fonte original, com verificação de segurança e correspondência de título.
- **Conversor de PDF local**: traduz a camada de texto com LibreTranslate/Argos Translate sem chave de API, com tradução concorrente em blocos (mantendo páginas, imagens e geometria sempre que possível).
- **Filtro por idioma** (português, inglês, espanhol, francês, alemão, italiano) com detecção de títulos em português.
- **Opção de exibir somente resultados com PDF disponível**.
- **Filtros avançados**: ordenação (relevância, ano, fonte, título), faixa de ano (mín./máx.), formato (PDF, ePub, áudio, texto) e coleção (livro, artigo, audiolivro, texto).
- **Estante de favoritos** ("Minha estante"): guarde resultados com um toque na estrela; ficam salvos no navegador (localStorage) em um painel lateral.
- **Histórico de buscas** recentes com atalhos para repetir uma busca.
- **Sorteio da coruja**: pesquisa um clássico da literatura aleatoriamente.
- **Exportar resultados em CSV** (compatível com Excel) e **copiar link da busca** (inclui filtros e idioma).
- **Atalhos de teclado**: `/` foca a busca, `Esc` limpa/fecha a estante.
- **Cache de buscas em memória** (10 min, máx. 50 entradas) e **coalescência** de requisições simultâneas para a mesma consulta.
- **Efeitos visuais**: céu estrelado com estrelas cadentes e aurora no topo, anel de runas girando ao redor da coruja enquanto busca, brilho (shimmer) dourado nos títulos e métricas, invocação dos cartões de resultado (entrada com luz), feitiço ao disparar a busca, sparkles seguindo o cursor, explosão de luz na melhor escolha e ao guardar na estante, revelação das seções ao rolar, skeleton loading, contadores animados, tilt 3D da capa, toast de notificações e conselhos da coruja com efeito de digitação — tudo respeitando `prefers-reduced-motion` e pausável com o botão de efeitos.
- Relatórios de status por fonte, catálogos pesquisados e avisos de licença/direitos.

## Fontes pesquisadas

| Tipo | Fontes |
| --- | --- |
| APIs | Internet Archive, Open Library, Project Gutenberg, Google Books, LibriVox, Wikisource (pt), Wikilivros, OpenAlex, Crossref, arXiv, DOAB, OAPEN, Semantic Scholar, DOAJ, Gallica (BnF) |
| Catálogos HTML | Planet eBook, Free-eBooks.net, ManyBooks, BookBub, BookBoon, Feedbooks, Smashwords, PDFBooksWorld, FreeTechBooks, Bookyards, GetFreeEBooks, FreeComputerBooks, Faded Page |
| Acervos adicionais | Portal Domínio Público, Wikisource (pt), Wikilivros, SciELO Livros, DOAB, OAPEN, Biblioteca Brasiliana (USP), Biblioteca Nacional Digital, Biblioteca Digital do Senado, ARCA Fiocruz, Luso Livros, Biblioteca Digital Camões, Literatura Brasileira UFSC, Global Grey Ebooks |
| Descoberta | Google Acadêmico, Google/Bing/DuckDuckGo/Yahoo/Mojeek/Brave/Startpage/Ecosia/Yandex `filetype:pdf`, consultas de repositórios e bibliotecas digitais |
| Torrent | Torrent oficial do Internet Archive (`.torrent` de textos em domínio público) |

## Como funciona

1. A consulta é limpa e normalizada (acentos, espaços, comprimento).
2. **+20 provedores** (APIs e catálogos HTML) são consultados em paralelo, com timeout por fonte (6 s, 7 s no Internet Archive, 10 s em DOAB/OAPEN).
3. Se a consulta for um **ISBN**, dois provedores extras resolvem o registro exato.
4. Em paralelo, **16 buscas `filetype:pdf`** (Google/Bing/DuckDuckGo/Yahoo/Mojeek/Brave/Startpage/Ecosia/Yandex, exatas, por repositório, biblioteca digital e nome de arquivo) coletam PDFs complementares, e uma busca por **torrents oficiais** é feita no Internet Archive.
5. Os resultados são deduplicados por URL, **consolidados por semelhança de título/autor** e ranqueados.
6. PDFs complementares são anexados aos resultados correspondentes, e torrents do Internet Archive são oferecidos para obras equivalentes; quando o torrent encontrado não tem um resultado equivalente, ele aparece como cartão próprio ("Internet Archive (torrent)").

## Requisitos

- Node.js 18 ou superior.
- Python 3.10 ou superior para o conversor de PDF.

## Executando

```bash
./setup-translation.ps1  # primeira vez: instala LibreTranslate e os modelos locais
npm start
# ou
node server.js
# ou, no Windows com runtime do Codex
./start.ps1
```

O servidor sobe em `http://127.0.0.1:4173` (defina `PORT` na variável de ambiente para alterar).

### Variáveis de ambiente

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `4173` | Porta HTTP do servidor |
| `HTML_SOURCES` | todos | IDs de catálogos HTML a consultar, separados por vírgula (ex.: `planet-ebook,pdfbooksworld`) |
| `PDF_PYTHON` | `python`/`python3` | Caminho do interpretador Python usado para extrair e reconstruir PDFs |
| `TRANSLATION_API_URL` | `http://127.0.0.1:5000/translate` | Endpoint local do LibreTranslate; altere somente para usar outro provedor |
| `TRANSLATION_API_KEY` | vazio | Chave opcional/necessária conforme o provedor de tradução |
| `TRANSLATION_CONCURRENCY` | `8` | Requisições simultâneas ao serviço de tradução (reduzido automaticamente para MyMemory) |
| `TRANSLATION_CHUNK_CHARS` | `1800` | Tamanho máximo de caracteres por bloco enviado ao tradutor |
| `PDF_TRANSLATION_MAX_BYTES` | `209715200` | Tamanho máximo do PDF enviado (200 MB) |

## Verificação

```bash
npm run check
# ou
./check.ps1
```

Executa a checagem de sintaxe (`node --check`) em `server.js` e `public/app.js`.

## Deploy (GitHub Actions + Cloudflare Workers)

O projeto roda como um **Cloudflare Worker** servindo `public/` como assets estáticos. Um **GitHub Actions** publica automaticamente a cada push — não é preciso ligar nada manualmente.

### 1. Criar o repositório no GitHub

Crie um repositório vazio (público ou privado) e envie o código:

```bash
git add .
git commit -m "Buscador global de livros"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/buscador-de-livro.git
git push -u origin main
```

### 2. Criar o token da API da Cloudflare

1. Entre em [dash.cloudflare.com](https://dash.cloudflare.com) → **My Profile → API Tokens → Create Token**.
2. Use o template **"Edit Cloudflare Workers"** e gere o token.
3. Copie também o **Account ID** (lado direito da página inicial do Workers).

### 3. Configurar os segredos no GitHub

No repositório → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Valor |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | token criado no passo 2 |
| `CLOUDFLARE_ACCOUNT_ID` | ID da conta Cloudflare |

### 4. Publicar

O deploy acontece automaticamente em todo `git push` na `main`. O site fica em `https://biblioteca-arcana.<seu-subdominio>.workers.dev`.

Também é possível publicar localmente:

```bash
npm install
npm run dev      # teste local (assets + worker) em http://localhost:8787
npx wrangler login
npm run deploy   # publica direto
```

### Limites do plano gratuito da Cloudflare

- 100.000 requisições/dia e 50 sub-requests por requisição (a busca faz ~42-48, dentro do limite).
- 10 ms de CPU por requisição; se a busca mais pesada estourar, o plano pago (US$ 5/mês) eleva para 30 s.

## Estrutura

```
.
├── server.js          # Lógica central: agregação de fontes, deduplicação e ranqueamento
├── worker.js          # Entrypoint do Cloudflare Workers (adapta server.js para a Fetch API)
├── wrangler.toml      # Configuração do Workers (assets + nodejs_compat)
├── public/
│   ├── index.html     # Interface (Biblioteca Arcana)
│   ├── styles.css     # Estilos
│   ├── app.js         # Lógica do front-end
│   └── assets/        # Recursos estáticos
├── .github/workflows/deploy.yml  # Deploy automático (GitHub Actions → Cloudflare)
├── check.ps1          # Checagem de sintaxe (Windows/Codex)
├── start.ps1          # Inicialização (Windows/Codex)
└── package.json
```

## API

### `GET /api/search?q=<termo>&pdf=1&lang=pt`

Consulta agregada nos catálogos. Parâmetros:

- `q` — termo de busca (título, autor ou ISBN). Obrigatório.
- `pdf` — `1` para listar apenas resultados com PDF disponível.
- `lang` — `any`, `pt`, `en`, `es`, `fr`, `de`, `it`.

Resposta (JSON):

```json
{
  "query": "dom casmurro",
  "results": [
    {
      "id": "...",
      "site": "Internet Archive",
      "category": "livro",
      "title": "Dom Casmurro",
      "authors": ["Machado de Assis"],
      "pdfUrl": "https://...",
      "pdfSourceSite": "archive.org",
      "torrentUrl": "https://archive.org/download/.../..._archive.torrent",
      "availability": "PDF direto",
      "languages": ["pt"],
      "formats": ["PDF"],
      "mergedFrom": ["Internet Archive", "Project Gutenberg", "Open Library"]
    }
  ],
  "providerStatus": [],
  "catalogChecks": [],
  "sites": [],
  "notices": [],
  "searchTookMs": 0,
  "tookMs": 0,
  "cached": false
}
```

Os resultados consolidados incluem o campo `mergedFrom`, que lista as fontes que tinham o mesmo livro e foram unidas no cartão, e `category` (`livro`, `artigo`, `audiolivro` ou `texto`) usado pelos filtros de coleção.

### `GET /api/sources`

Lista as fontes disponíveis (nome, tipo de acesso) e os idiomas suportados.

### `POST /api/translate-pdf?source=pt&target=en`

Recebe o PDF bruto no corpo da requisição com `Content-Type: application/pdf` e devolve outro PDF como download. O processo usa `pdfminer` (motor do pdfplumber), `pypdf` e `reportlab`: extrai as linhas da camada de texto por caracteres, traduz em blocos com requisições **concorrentes** (padrão `TRANSLATION_CONCURRENCY=8`), cobre o texto original e pinta a tradução dentro das caixas originais, mantendo tamanho, imagens e número de páginas quando possível. Não existe limite artificial de páginas; o limite padrão é de 200 MB por arquivo e pode ser alterado por `PDF_TRANSLATION_MAX_BYTES`.

Para habilitar a função localmente, instale as dependências Python:

```bash
python -m pip install pdfplumber pypdf reportlab
```

O endpoint usa por padrão um LibreTranslate local, sem chave de API. Execute `setup-translation.ps1` uma vez para instalar os modelos e depois `start.ps1`, que inicializa o serviço local automaticamente. Para usar outro provedor compatível, configure `TRANSLATION_API_URL` e, quando exigido, `TRANSLATION_API_KEY`. PDFs escaneados sem camada de texto são recusados; aplique OCR antes de enviá-los. A preservação visual é mais fiel em PDFs com fundo branco e texto selecionável, pois traduções podem ser maiores que o original e exigir redução horizontal dentro da mesma linha.

### `POST /api/translate-pdf-url?source=pt&target=en`

Recebe `{ "pdfUrl": "https://..." }` em JSON, baixa um PDF público do resultado selecionado e devolve a versão traduzida. A interface exibe o botão **Traduzir PDF** dentro de cada cartão que possui PDF. O servidor aceita apenas URLs públicas `http(s)`, valida o cabeçalho `%PDF-`, limita o tamanho e bloqueia endereços locais/privados.

## Considerações sobre direitos autorais

A ferramenta consulta apenas acervos gratuitos, públicos e abertos e marca cada resultado com a política de acesso/uso da fonte. PDFs descobertos por busca `filetype:pdf` são filtrados para domínios confiáveis (`archive.org`, `gutenberg.org`, `gov.br`, `edu.br`, `scielo.org`, `arxiv.org`, `oapen.org`, `doabooks.org`, entre outros) ou para páginas que sinalizem domínio público / acesso aberto. Sempre verifique a licença e os termos de uso na fonte antes de baixar ou redistribuir qualquer obra.

## Licença

MIT — veja o campo `license` em `package.json`.
