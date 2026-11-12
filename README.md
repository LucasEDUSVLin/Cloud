# STUCK

Painel para cruzar o relatório de mercadorias paradas da Shopee com um segundo CSV contendo os status atualizados.

## Utilização

1. Selecione o CSV **STUCK** com as colunas `Operação`, `Cidade`, `Entegador`, `TN`, `Status`, `Dias parados`, `Valor`, `Palavra Chave` e `Avaria`.
2. Selecione o CSV **status atualizado** com as colunas `Order ID`, `Status`, `Driver Name`, `Driver Phone`, `Current Station`, `Current Station Received Time` e `Delivered Time`.
3. Clique em **Analisar arquivos**. O sistema cruza `TN` com `Order ID`. Cada importação substitui a lista anterior: o painel mostra somente as mercadorias do dia, sem histórico. Classificações e cores já salvas continuam valendo para TNs que reaparecem.

Após a importação, o formulário fica oculto. Para importar a base do dia, clique em **Atualizar relatórios**.

O painel guarda os dois arquivos importados neste navegador. Ao recarregar a página, os arquivos salvos podem ser reutilizados e seus nomes aparecem em **Atualizar relatórios**. O navegador não permite preencher automaticamente os campos de seleção de arquivos, mas é possível selecionar apenas o arquivo que deseja substituir. Importações anteriores a esta função precisam ser feitas novamente para guardar os arquivos. O botão no topo alterna entre os temas claro e escuro, e a preferência fica salva no navegador.

Na seção **Mercadorias**, marque pedidos individualmente ou selecione todos os resultados dos filtros e da busca, incluindo outras páginas. A seleção é limpa ao trocar de filtro, status ou busca, então **Selecionar resultados filtrados** e a exportação sempre se referem apenas ao que está filtrado. Use **Limpar seleção** para removê-la; uma nova importação também a limpa.

O CSV exportado contém apenas as colunas e linhas do arquivo de status atualizado correspondentes aos BRs selecionados, com os cabeçalhos originais e sem prefixos. Se algum BR selecionado não possuir linha correspondente, a exportação é bloqueada e os BRs são informados. O arquivo usa UTF-8 com BOM e ponto e vírgula como separador. Para evitar execução de fórmulas no Excel ou Planilhas, células ou cabeçalhos que possam ser interpretados como fórmulas recebem um apóstrofo inicial. Ao importar no Excel ou Planilhas, escolha tipo texto para códigos, telefones e outros identificadores para evitar conversão automática. Em relatórios importados antes desta alteração, eventuais espaços nos extremos dos cabeçalhos já foram removidos; reimporte os arquivos para preservá-los.

O nome do arquivo segue o formato `Stuck-DD-MM-AAAA-HH-MM.csv`, com a data e o horário locais do dispositivo no momento da exportação.

Os dois CSVs devem ter cabeçalhos, de 1 a 10.000 registros, até 10 MB cada, sem IDs vazios ou duplicados. O processamento verifica ambos antes de mesclar os dados. Pedidos sem correspondência atualizada não recebem status inventado: nos registros novos, o status fica ausente; para registros antigos, o último status conhecido é preservado. Pedidos adicionais no arquivo de status são contados, mas não entram na lista.

O painel exibe, pesquisa e agrupa pelo `Status` do CSV de status atualizado, sem substituí-lo pelo status do relatório STUCK. Pedidos sem correspondência ou sem status nesse CSV mostram "Sem status atualizado".

O tratamento é escolhido manualmente na tabela **Mercadorias** e pode ser alterado ou voltado para **Sem classificação**. A escolha não altera o status da Shopee e é salva por TN neste navegador. As contagens abrangem o relatório do dia e não indicam conclusão do tratamento. Os filtros de dias incluem todo o relatório, independentemente do tratamento ou do status atualizado. Selecionar para exportação é independente da classificação; o CSV exportado contém os dados do arquivo de status atualizado, não a classificação manual.

O botão **Copiar TN (BR)**, ao lado do relatório STUCK, copia os códigos TN do arquivo selecionado (um por linha) para consultar o status atualizado na Shopee.

O indicador de dias usa exclusivamente `Dias parados` do relatório STUCK, sem incrementar os dias após a importação. O painel apenas compara esse número com 15 dias (abaixo, igual ou acima); não infere LOST nem débito. Nenhum dado é criado: tudo vem dos CSVs.

Os gráficos apresentam dados do relatório do dia, sem aplicar os filtros da tabela. A pizza compara os dias parados com 15 dias em verde, amarelo e coral; as barras verticais usam cores diferentes para cada classificação manual. As cores de dias não indicam status LOST nem débito, e classificação manual não significa tratamento concluído.

Na coluna **Marcação**, escolha uma cor na paleta para pintar a linha inteira do BR. A marcação é salva por TN neste navegador, permanece enquanto o TN reaparecer nas importações e pode ser removida selecionando **Sem cor**. Ela é apenas visual e não altera tratamento, status nem exportação.

Os indicadores financeiros somam o campo `Valor` do relatório STUCK em reais: o total inclui todos os registros da lista, e a distribuição por status usa o `Status` do CSV atualizado. O débito por LOST considera somente registros cujo status atualizado seja exatamente `LOST` (sem diferenciar maiúsculas de minúsculas); dias parados acima de 15 não são tratados como LOST. Valores fora do formato numérico com ponto decimal e até duas casas são rejeitados para evitar totais incorretos.

## Privacidade e armazenamento

O site funciona sem login. Os dois arquivos completos da importação mais recente (incluindo linhas adicionais que não entram no painel) e as marcações de tratamento por TN ficam no IndexedDB deste navegador; esses dados podem conter informações pessoais. Os dados não são enviados ao GitHub, mas outra pessoa com acesso ao mesmo perfil de navegador pode vê-los. Os arquivos CSV baixados devem ser protegidos separadamente. Os dados não são sincronizados entre computadores, podem ser apagados ao limpar os dados do site e não substituem backups protegidos dos arquivos originais.

O banco da versão anterior não é removido nem migrado; o novo painel usa um banco separado. Sites em caminhos diferentes sob o mesmo domínio `github.io` compartilham a mesma origem e podem acessar o armazenamento uns dos outros. Para proteger dados pessoais, prefira um domínio dedicado e um dispositivo e perfil de navegador de acesso restrito.

## Desenvolvimento e publicação

Com Node.js 20 ou superior, execute `npm install` e `npm run dev`. Para verificar alterações, execute `npm test`, `npm run lint` e `npm run build`.

O fluxo `.github/workflows/pages.yml` gera e publica a aplicação estática no GitHub Pages. Em **Settings → Pages**, selecione **GitHub Actions** como fonte de publicação para evitar que uma publicação da branch sobrescreva a versão gerada.
