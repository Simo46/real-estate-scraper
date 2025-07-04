# Dockerfile per Ollama con curl per healthcheck e inizializzazione automatica
FROM ollama/ollama:latest

# Installa curl per l'healthcheck
RUN apt-get update && \
    apt-get install -y curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copia lo script di inizializzazione
COPY init-ollama.sh /usr/local/bin/init-ollama.sh
RUN chmod +x /usr/local/bin/init-ollama.sh

# Variabile per il modello predefinito
ENV OLLAMA_DEFAULT_MODEL=llama3.2:latest

# Usa lo script di inizializzazione
ENTRYPOINT ["/usr/local/bin/init-ollama.sh"]
