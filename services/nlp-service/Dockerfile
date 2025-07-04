# NLP Service Dockerfile - Versione ottimizzata
# Task 5.2.2 - Dockerfile ottimizzato per Python 3.11 + AI dependencies

FROM python:3.13-slim

# Metadata
LABEL maintainer="Real Estate Scraper Team"
LABEL description="NLP Service con FastAPI per elaborazione linguaggio naturale"
LABEL version="1.0.0"

# Variabili d'ambiente
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Installa dipendenze di sistema necessarie per compilazione
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        wget \
        git \
        build-essential \
        gcc \
        g++ \
        libssl-dev \
        libffi-dev \
        pkg-config \
        && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Crea utente non-root per sicurezza
RUN useradd --create-home --shell /bin/bash nlp_user

# Crea directory applicazione
WORKDIR /app

# Copia requirements e installa dipendenze Python in modo ottimizzato
COPY requirements.txt /tmp/requirements.txt

# Installa dipendenze con versioni specifiche per evitare conflitti
RUN pip install --upgrade pip setuptools wheel && \
    pip install -r /tmp/requirements.txt 

# Scarica modelli spaCy necessari
RUN python -m spacy download it_core_news_sm || echo "Modello it_core_news_sm non disponibile, verrà scaricato al runtime"
RUN python -m spacy download en_core_web_sm || echo "Modello en_core_web_sm non disponibile, verrà scaricato al runtime"

# Copia codice applicazione
COPY --chown=nlp_user:nlp_user . /app/

# Cambia all'utente non-root
USER nlp_user

# Porta esposta
EXPOSE 8002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8002/health || exit 1

# Comando di avvio
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002", "--reload"]