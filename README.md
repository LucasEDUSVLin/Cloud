# Cloud

Painel interno para importar relatórios da Shopee, analisar a operação logística e guardar os registros por mês.

## Funcionalidades

- Sem login ou cadastro dentro do Cloud.
- Importação diária do CSV: cada pedido é identificado pelo `Order ID` e atualizado pela última importação que o contém, inclusive quando aparecer novamente em outro mês. Importe os arquivos em ordem cronológica; um arquivo antigo pode sobrescrever dados mais recentes.
- Validação do cabeçalho e armazenamento apenas destas 12 colunas: `Order ID`, `Buyer Name`, `Location Type`, `Postal Code`, `Driver ID`, `Driver Name`, `Driver Phone`, `Current Station Received Time`, `Delivered Time`, `OnHold Time`, `Status` e `Current Station`.
- Banco SQLite persistente no servidor. O mês do pedido é o de `Current Station Received Time`, não o mês da importação. Uma mudança nessa data muda o mês associado ao pedido.
- Indicadores mensais e distribuição dos status atuais, filtro por status, busca e paginação. A taxa de entrega é a proporção de pedidos recebidos no mês cujo status atual é `Delivered`; os demais são contados como não entregues, inclusive status vazio ou desconhecido.
- Evolução semanal de segunda a domingo: recebimentos por `Current Station Received Time` e entregas por `Delivered Time` para pedidos cujo status atual é `Delivered`. Cada semana considera dados de todos os meses, incluindo as entregas em mês diferente do recebimento. Datas são consideradas como escritas no CSV, sem conversão de fuso. Esses indicadores usam o estado mais recentemente importado, não um histórico das mudanças de status.
- O arquivo original é lido em memória; somente os campos permitidos são enviados ao servidor e persistidos.

## Executar localmente

1. Instale Node.js 20 ou superior.
2. Copie `.env.example` para `.env.local` se quiser personalizar o caminho do banco (`DB_PATH`). O padrão é `./data/cloud.sqlite`.
3. Execute `npm install` e `npm run dev`, então abra `http://localhost:3000`.

Os registros são gravados no caminho configurado em `DB_PATH`. Novos arquivos de banco são criados com acesso restrito ao usuário do processo; verifique também as permissões do diretório, de bancos existentes e dos backups. Faça backup periódico consistente do SQLite (por exemplo, usando a API de backup do SQLite ou com a aplicação parada, incluindo qualquer arquivo `-wal` e `-shm` existente) e mantenha o backup em local protegido.

## Hospedagem e acesso

Como o aplicativo não tem login, qualquer pessoa que consiga acessar a aplicação também consegue consultar e importar dados. **Não publique o Cloud aberto na internet.** Hospede-o em uma máquina/rede privada ou proteja o acesso à aplicação com VPN, firewall ou controle de acesso na infraestrutura (fora do Cloud).

Use uma única instância Node.js com armazenamento persistente montado no caminho do SQLite. Não use hospedagem serverless ou múltiplas instâncias com disco efêmero/isolado: os arquivos SQLite precisam permanecer no mesmo volume persistente. Em proxy reverso, preserve o cabeçalho `Host` original e restrinja o acesso na infraestrutura. O nome do comprador, dados do entregador, CEP e identificador do pedido podem identificar pessoas; restrinja acesso, backups e retenção.

## Verificações

- `npm test` executa os testes do parser e do banco.
- `npm run lint` verifica o código.
- `npm run build` gera a aplicação de produção.
