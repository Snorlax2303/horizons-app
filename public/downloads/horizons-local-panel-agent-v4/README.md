# Horizons Local Panel Agent

Este agente roda no computador que já possui acesso autorizado ao painel. Ele só abre conexões de saída HTTPS para o Horizons; não abre porta alguma no computador e não envia senhas ou cookies à VPS.

1. Instale Node.js 20 ou superior.
2. Copie `config.example.json` para `config.json` e preencha os dados exibidos em **Conexões de Painéis → Conectar computador**.
3. Em `allowedHosts`, informe somente os domínios dos painéis que este computador pode abrir.
4. Execute `npm start` dentro desta pasta e mantenha a janela aberta.

Ao clicar em **Abrir login seguro**, o Chrome abre no computador local com um perfil isolado por painel. Faça o login e resolva os desafios manualmente. Não coloque usuário, senha ou token do painel no `config.json`.

## Capturar fluxo de um painel

No Horizons, abra **Conexões de Painéis** e clique em **Capturar fluxo** no painel desejado. O navegador abre e registra navegação, cliques, estrutura visível e imagens reduzidas da tela para documentar o adaptador daquele painel. Use somente um cliente de teste e conclua com **Concluir e salvar captura**. Valores de campos de senha não são registrados.

Para encerrar o agente, pressione `Ctrl+C`. O token de cadastro deve ser tratado como senha: se houver perda do computador ou suspeita de vazamento, revogue o agente no painel e crie outro.

## Inicialização automática no Windows

Depois de testar o agente manualmente, abra o PowerShell **na pasta do agente** e execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1
```

Ele será iniciado ao entrar no Windows e será reiniciado pelo Agendador de Tarefas se o processo parar. O Chrome precisa de uma sessão de usuário aberta; portanto, após uma reinicialização do computador, entre normalmente no Windows uma vez.
