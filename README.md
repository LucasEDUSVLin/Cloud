# Cloud

Painel inicial de indicadores logísticos para relatórios de devolução da Shopee.

## Funcionalidades

- Login por e-mail e senha com Firebase Authentication. Não há cadastro público; crie e gerencie as contas no Firebase Console.
- Importação de CSV diretamente no navegador.
- Validação do cabeçalho fixo do relatório e retenção apenas destas colunas: `Order ID`, `Buyer Name`, `Location Type`, `Postal Code`, `Driver ID`, `Driver Name`, `Driver Phone`, `Current Station Received Time`, `Delivered Time`, `OnHold Time`, `Status` e `Current Station`.
- Indicadores de pedidos, entregas, pedidos com tempo em espera e estações.
- Os dados importados existem somente na memória da página e são limpos ao atualizar ou sair. O arquivo não é enviado ou salvo pelo Cloud.

## Executar localmente

1. Instale Node.js 20 ou superior.
2. Crie um projeto no Firebase e habilite **Authentication → Sign-in method → Email/Password**.
3. Crie os usuários autorizados em **Authentication → Users → Add user**. A aplicação não oferece criação de conta nem recuperação de senha.
4. Copie `.env.example` para `.env.local` e preencha as credenciais de configuração Web do Firebase.
5. Execute `npm install` e `npm run dev`, então abra `http://localhost:3000`.

As variáveis `NEXT_PUBLIC_FIREBASE_*` são a configuração pública do cliente Firebase, não chaves privadas. Não coloque credenciais administrativas ou service accounts no frontend.

## Verificações

- `npm test` executa os testes do parser e da lista permitida de colunas.
- `npm run lint` verifica o código.
- `npm run build` gera a aplicação de produção.

## Próximas etapas de segurança

Esta versão é um protótipo local: autenticação e importação funcionam no cliente, mas os dados ainda não são armazenados nem sincronizados. Antes de adicionar persistência, relatórios compartilhados ou ingestão server-side, implemente validação de token e autorização no backend, regras de acesso restritivas e retenção compatível com a operação. O nome do comprador, telefone/identificação do entregador, CEP e identificador do pedido devem ser tratados como dados pessoais; limite sua exposição e prefira indicadores agregados.
