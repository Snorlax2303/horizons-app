# Runtime web para o OmniRoute existente

O serviço `omniroute-host` instalado na VPS usa `omniroute:base`, sem Chromium.
O pacote Playwright 1.62.0 dentro da imagem também tinha playwright-core parcial.
Esta imagem derivada completa a versão correspondente e instala Chromium e suas
dependências, mantendo a aplicação e as integrações CLI da imagem original.
Nenhum dado/segredo de runtime é copiado para o build.

Build:

```sh
docker build -t omniroute:horizons-web /root/horizons-app/ops/omniroute-web
```

Publicação (breve interrupção da IA; mantém env/volumes/portas existentes):

```sh
docker compose -f /opt/OmniRoute/docker-compose.yml -f /root/horizons-app/ops/omniroute-web/compose.override.yml --profile host up -d --no-deps --no-build omniroute-host
```

Use o mesmo overlay em futuras recriações. Publicar só o compose original volta
à imagem sem navegador. Quando `omniroute:base` atualizar a versão do Playwright,
ajuste a versão fixada neste Dockerfile e refaça a validação de inicialização.
A imagem base original é preservada para rollback pelo compose original.
