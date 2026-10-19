FROM node:22-bookworm-slim

# Native engine installation stays inside this image; nothing is installed on the host.
RUN apt-get update && apt-get install -y --no-install-recommends \
    qpdf ocrmypdf tesseract-ocr tesseract-ocr-ara tesseract-ocr-eng \
    libreoffice-writer libreoffice-calc libreoffice-impress \
    fonts-noto-core fonts-noto-extra fonts-liberation ghostscript \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --chown=node:node dist/ ./dist/
COPY --chown=node:node backend/ ./backend/
COPY --chown=node:node server.cjs ./server.cjs
USER node
ENV PORT=4173 WARAQ_BIND=0.0.0.0 HOME=/tmp
EXPOSE 4173
CMD ["node", "server.cjs"]
