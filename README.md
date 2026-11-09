# Cloud

Painel interno para importar relatórios da Shopee, analisar a operação logística e guardar os registros por mês.

## Funcionalidades

- Sem login ou cadastro dentro do Cloud.
- Importação diária do CSV: cada pedido é identificado pelo `Order ID` e atualizado pela última importação que o contém, inclusive quando aparecer novamente em outro mês. Importe os arquivos em ordem cronológica; um arquivo antigo pode sobrescrever dados mais recentes.
- Validação do cabeçalho e armazenamento apenas destas 12 colunas: `Order ID`, `Buyer Name`, `Location Type`, `Postal Code`, `Driver ID`, `Driver Name`, `Driver Phone`, `Current Station Received Time`, `Delivered Time`, `OnHold Time`, `Status` e `Current Station`.
- Banco IndexedDB local ao navegador, sem sincronização. O mês do pedido é o de `Current Station Received Time`, não o mês da importação. Uma mudança nessa data muda o mês associado ao pedido.
- Indicadores mensais e distribuição dos status atuais, filtro por status, busca e paginação. A taxa de entrega é a proporção de pedidos recebidos no mês cujo status atual é `Delivered`; os demais são contados como não entregues, inclusive status vazio ou desconhecido.
- Evolução semanal de segunda a domingo: recebimentos por `Current Station Received Time` e entregas por `Delivered Time` para pedidos cujo status atual é `Delivered`. Cada semana considera dados de todos os meses, incluindo as entregas em mês diferente do recebimento. Datas são consideradas como escritas no CSV, sem conversão de fuso. Esses indicadores usam o estado mais recentemente importado, não um histórico das mudanças de status.
- O arquivo original é lido em memória; somente os campos permitidos são persistidos no navegador. Nenhum CSV ou registro é enviado ao GitHub.

## Executar localmente

1. Instale Node.js 20 ou superior.
2. Execute `npm install` e `npm run dev`, então abra `http://localhost:3000`.

## Hospedagem e acesso

O GitHub Pages publica o código do site, mas os dados importados permanecem no dispositivo e perfil de navegador usados para a importação; não são sincronizados. Em outro navegador ou computador será necessário importar novamente os CSVs. Limpar os dados do site, usar navegação privada ou perder o dispositivo pode apagar o banco local. Guarde os CSVs de origem em local protegido para recuperação.

Como não há login nem criptografia própria, qualquer pessoa com acesso ao perfil do navegador pode consultar os dados locais. O armazenamento de páginas sob o mesmo domínio `github.io` também compartilha a mesma origem: outros sites no mesmo domínio, se controlados por terceiros ou comprometidos, podem acessar esses dados. Use dispositivo e perfil restritos; para dados pessoais, prefira uma hospedagem com domínio dedicado e controles de acesso apropriados. O banco SQLite de uma versão anterior não é migrado automaticamente.

Para publicar, habilite **Settings → Pages → Build and deployment → Source: GitHub Actions**. O fluxo `.github/workflows/pages.yml` gera e publica o site ao atualizar `main`. A disponibilidade do Pages em repositórios privados depende do plano; não torne o repositório público sem aprovação.

## Verificações

- `npm test` executa os testes do parser e do banco.
- `npm run lint` verifica o código.
- `npm run build` gera a aplicação de produção.
