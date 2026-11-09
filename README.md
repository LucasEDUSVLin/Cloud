# Cloud — Gestão de STUCK

Painel para cruzar o relatório de mercadorias paradas da Shopee com um segundo CSV contendo os status atualizados.

## Utilização

1. Selecione o CSV **STUCK** com as colunas `Operação`, `Cidade`, `Entegador`, `TN`, `Status`, `Dias parados`, `Valor`, `Palavra Chave` e `Avaria`.
2. Selecione o CSV **status atualizado** com as colunas `Order ID`, `Status`, `Driver Name`, `Driver Phone`, `Current Station`, `Current Station Received Time` e `Delivered Time`.
3. Clique em **Analisar arquivos**. O sistema cruza `TN` com `Order ID`, usando somente o relatório STUCK como lista de mercadorias. A operação substitui a lista salva anteriormente.

Os dois CSVs devem ter cabeçalhos, de 1 a 10.000 registros, até 10 MB cada, sem IDs vazios ou duplicados. O processamento verifica ambos antes de substituir os dados. Pedidos do STUCK sem status atualizado são destacados para verificação; pedidos adicionais no arquivo de status são contados, mas não entram na lista.

O painel separa pedidos cujo status atualizado seja `Delivered` como entregues. Todos os demais, inclusive os sem correspondência ou status, aparecem como **a tratar ou verificar**; um status diferente de `Delivered` não significa necessariamente que a mercadoria ainda está fisicamente parada.

O indicador de dias usa exclusivamente `Dias parados` do relatório STUCK, sem incrementar os dias após a importação. Aos 15 dias, o painel indica **prazo limite**; acima de 15 dias, indica **possível LOST**, não confirmação de ocorrência ou débito. As contagens de limite e possível LOST excluem pedidos entregues.

## Privacidade e armazenamento

O site funciona sem login. Os dois CSVs são processados localmente e os campos necessários são salvos no IndexedDB do navegador; não são enviados ao GitHub. Outra pessoa com acesso ao mesmo perfil de navegador pode ver os dados. Eles não são sincronizados entre computadores, podem ser apagados ao limpar os dados do site e não substituem backups protegidos dos arquivos originais.

O banco da versão anterior não é removido nem migrado; o novo painel usa um banco separado. Sites em caminhos diferentes sob o mesmo domínio `github.io` compartilham a mesma origem e podem acessar o armazenamento uns dos outros. Para proteger dados pessoais, prefira um domínio dedicado e um dispositivo e perfil de navegador de acesso restrito.

## Desenvolvimento e publicação

Com Node.js 20 ou superior, execute `npm install` e `npm run dev`. Para verificar alterações, execute `npm test`, `npm run lint` e `npm run build`.

O fluxo `.github/workflows/pages.yml` gera e publica a aplicação estática no GitHub Pages. Em **Settings → Pages**, selecione **GitHub Actions** como fonte de publicação para evitar que uma publicação da branch sobrescreva a versão gerada.
