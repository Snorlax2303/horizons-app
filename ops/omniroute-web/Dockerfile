# Preserve the installed OmniRoute and host CLI integrations; add its web runtime.
FROM omniroute:base AS runner-base
USER root
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright
RUN mkdir -p /opt/horizons-browser \
 && npm install --prefix /opt/horizons-browser --ignore-scripts --no-audit --no-fund playwright@1.62.0 \
 && cp -a /opt/horizons-browser/node_modules/playwright-core/. /app/node_modules/playwright/node_modules/playwright-core/ \
 && node /opt/horizons-browser/node_modules/playwright/cli.js install chromium --with-deps \
 && chown -R node:node /home/node/.cache \
 && rm -rf /var/lib/apt/lists/* /root/.npm
USER node
