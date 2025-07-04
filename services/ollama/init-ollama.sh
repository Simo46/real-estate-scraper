#!/bin/bash

# Script di inizializzazione per Ollama
# Scarica il modello predefinito se non esiste

set -e

echo "🚀 Avvio Ollama initialization..."

# Avvia ollama in background
ollama serve &
OLLAMA_PID=$!

echo "⏳ Attendo che Ollama sia pronto..."
# Attende che Ollama sia pronto
while ! curl -s http://localhost:11434/ > /dev/null 2>&1; do
  sleep 1
done

echo "✅ Ollama è pronto!"

# Controlla se il modello esiste
MODEL_NAME=${OLLAMA_DEFAULT_MODEL:-llama3.2:latest}
echo "🔍 Controllo modello: $MODEL_NAME"

if ! ollama list | grep -q "$MODEL_NAME"; then
  echo "📥 Scaricamento modello $MODEL_NAME..."
  ollama pull "$MODEL_NAME"
  echo "✅ Modello $MODEL_NAME scaricato con successo!"
else
  echo "✅ Modello $MODEL_NAME già presente"
fi

# Mantieni ollama in esecuzione
echo "🎯 Ollama pronto con modello $MODEL_NAME"
wait $OLLAMA_PID
