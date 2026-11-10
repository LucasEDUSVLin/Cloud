# STUCK

Painel para cruzar o relatório de mercadorias paradas da Shopee com um segundo CSV contendo os status atualizados.

## Utilização

1. Selecione o CSV **STUCK** com as colunas `Operação`, `Cidade`, `Entegador`, `TN`, `Status`, `Dias parados`, `Valor`, `Palavra Chave` e `Avaria`.
2. Selecione o CSV **status atualizado** com as colunas `Order ID`, `Status`, `Driver Name`, `Driver Phone`, `Current Station`, `Current Station Received Time` e `Delivered Time`.
3. Clique em **Analisar arquivos**. O sistema cruza `TN` com `Order ID`, usando somente o relatório STUCK como lista de mercadorias. A operação substitui a lista salva anteriormente.

Após a importação, o formulário fica oculto. Para carregar novos arquivos, clique em **Atualizar relatórios**; a lista anterior só é substituída após uma importação bem-sucedida.

Na seção **Mercadorias**, marque pedidos individualmente ou selecione todos os resultados dos filtros e da busca, incluindo outras páginas. A seleção é limpa ao trocar de filtro, status ou busca, então **Selecionar resultados filtrados** e a exportação sempre se referem apenas ao que está filtrado. Use **Limpar seleção** para removê-la; uma nova importação também a limpa.

O CSV exportado combina todas as colunas dos dois relatórios com prefixos `STUCK -` e `Status atualizado -`. Sem correspondência, as colunas de status atualizado ficam vazias. O arquivo usa UTF-8 com BOM e ponto e vírgula como separador. Para evitar execução de fórmulas no Excel ou Planilhas, valores que possam ser interpretados como fórmulas recebem um apóstrofo inicial. Ao importar no Excel ou Planilhas, escolha tipo texto para códigos, telefones e outros identificadores para evitar conversão automática. Para exportar dados de importações anteriores a esta função, reimporte os dois arquivos.

Os dois CSVs devem ter cabeçalhos, de 1 a 10.000 registros, até 10 MB cada, sem IDs vazios ou duplicados. O processamento verifica ambos antes de substituir os dados. Pedidos do STUCK sem status atualizado são destacados para verificação; pedidos adicionais no arquivo de status são contados, mas não entram na lista.

O painel exibe, pesquisa e agrupa pelo `Status` do CSV de status atualizado, sem substituí-lo pelo status do relatório STUCK. Pedidos sem correspondência ou sem status nesse CSV mostram "Sem status atualizado".

O tratamento é escolhido manualmente na tabela **Mercadorias** e pode ser alterado ou voltado para **Sem classificação**. A escolha não altera o status da Shopee e é salva por TN neste navegador, mesmo que a mercadoria deixe de aparecer em uma importação e retorne depois. As contagens de classificadas e sem classificação abrangem apenas o relatório atual e não indicam conclusão do tratamento. As antigas marcações de tratada são apagadas, pois não indicavam qual das novas opções aplicar. Os filtros de dias incluem todas as mercadorias do relatório, independentemente do tratamento ou do status atualizado. Selecionar para exportação é independente da classificação; o CSV exportado contém os dados originais dos relatórios, não a classificação manual.

O botão **Copiar TN (BR)**, ao lado do relatório STUCK, copia os códigos TN do arquivo selecionado (um por linha) para consultar o status atualizado na Shopee.

O indicador de dias usa exclusivamente `Dias parados` do relatório STUCK, sem incrementar os dias após a importação. O painel apenas compara esse número com 15 dias (abaixo, igual ou acima); não infere LOST nem débito. Nenhum dado é criado: tudo vem dos CSVs.

Os gráficos apresentam dados de todo o relatório atual, sem aplicar os filtros da tabela. A pizza compara os dias parados com 15 dias: cinza indica abaixo, amarelo exatamente 15 e vermelho acima; a mesma sinalização aparece na tabela. As barras verticais mostram as classificações manuais, incluindo mercadorias sem classificação. No mapa de calor, as células cruzam o status atualizado com a comparação de dias; a intensidade da cor é relativa à maior contagem do mapa, e os números mostram as quantidades exatas. Clique no nome de um status no mapa para filtrar as mercadorias, mantendo a busca atual. As cores de dias não indicam status LOST nem débito, e classificação manual não significa tratamento concluído.

Os indicadores financeiros somam o campo `Valor` do relatório STUCK em reais: o total inclui todos os registros da lista, e a distribuição por status usa o `Status` do CSV atualizado. O débito por LOST considera somente registros cujo status atualizado seja exatamente `LOST` (sem diferenciar maiúsculas de minúsculas); dias parados acima de 15 não são tratados como LOST. Valores fora do formato numérico com ponto decimal e até duas casas são rejeitados para evitar totais incorretos.

## Privacidade e armazenamento

O site funciona sem login. Todos os campos dos registros do relatório STUCK e das linhas correspondentes do arquivo de status são processados e salvos no IndexedDB do navegador para permitir a exportação; eles podem conter dados pessoais. As marcações de tratamento por TN também ficam nesse navegador. Os dados não são enviados ao GitHub, mas outra pessoa com acesso ao mesmo perfil de navegador pode vê-los. Os arquivos CSV baixados devem ser protegidos separadamente. Os dados não são sincronizados entre computadores, podem ser apagados ao limpar os dados do site e não substituem backups protegidos dos arquivos originais.

O banco da versão anterior não é removido nem migrado; o novo painel usa um banco separado. Sites em caminhos diferentes sob o mesmo domínio `github.io` compartilham a mesma origem e podem acessar o armazenamento uns dos outros. Para proteger dados pessoais, prefira um domínio dedicado e um dispositivo e perfil de navegador de acesso restrito.

## Desenvolvimento e publicação

Com Node.js 20 ou superior, execute `npm install` e `npm run dev`. Para verificar alterações, execute `npm test`, `npm run lint` e `npm run build`.

O fluxo `.github/workflows/pages.yml` gera e publica a aplicação estática no GitHub Pages. Em **Settings → Pages**, selecione **GitHub Actions** como fonte de publicação para evitar que uma publicação da branch sobrescreva a versão gerada.
