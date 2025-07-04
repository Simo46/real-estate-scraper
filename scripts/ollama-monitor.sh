#!/bin/bash

# Ollama Error Handling & Auto-Restart Policies
# Task 5.1.10 - Error handling e auto-restart policies

set -e

# Configurazione
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
MAX_RETRIES=3
RETRY_DELAY=5
HEALTHCHECK_INTERVAL=30
LOG_FILE="./logs/ollama-monitor.log"

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funzione di logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Funzione per verificare se Ollama è healthy
check_ollama_health() {
    local retry_count=0
    
    while [ $retry_count -lt $MAX_RETRIES ]; do
        if curl -s -f "$OLLAMA_URL/" > /dev/null 2>&1; then
            return 0
        fi
        
        retry_count=$((retry_count + 1))
        if [ $retry_count -lt $MAX_RETRIES ]; then
            log "Health check failed (attempt $retry_count/$MAX_RETRIES), retrying in ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
        fi
    done
    
    return 1
}

# Funzione per restart del container Ollama
restart_ollama() {
    log "Attempting to restart Ollama container..."
    
    # Trova il container ID di Ollama
    local container_id=$(docker ps -q -f "name=ollama")
    
    if [ -z "$container_id" ]; then
        log "ERROR: Ollama container not found"
        return 1
    fi
    
    # Restart del container
    if docker restart "$container_id" > /dev/null 2>&1; then
        log "Ollama container restarted successfully"
        
        # Attendi che il container sia ready
        local wait_time=0
        local max_wait=60
        
        while [ $wait_time -lt $max_wait ]; do
            if check_ollama_health; then
                log "Ollama is healthy after restart"
                return 0
            fi
            
            sleep 5
            wait_time=$((wait_time + 5))
        done
        
        log "ERROR: Ollama failed to become healthy after restart"
        return 1
    else
        log "ERROR: Failed to restart Ollama container"
        return 1
    fi
}

# Funzione per verificare e scaricare il modello
ensure_model_available() {
    log "Checking if llama3.2:3b model is available..."
    
    # Verifica se il modello è disponibile
    if curl -s "$OLLAMA_URL/api/tags" | grep -q "llama3.2:3b"; then
        log "Model llama3.2:3b is available"
        return 0
    fi
    
    log "Model llama3.2:3b not found, attempting to download..."
    
    # Scarica il modello
    if curl -s -X POST "$OLLAMA_URL/api/pull" \
        -H "Content-Type: application/json" \
        -d '{"name": "llama3.2:3b"}' > /dev/null 2>&1; then
        
        log "Model download initiated successfully"
        return 0
    else
        log "ERROR: Failed to initiate model download"
        return 1
    fi
}

# Funzione per monitoraggio continuo
monitor_ollama() {
    log "Starting Ollama monitoring (interval: ${HEALTHCHECK_INTERVAL}s)"
    
    while true; do
        if check_ollama_health; then
            echo -e "${GREEN}✅ Ollama is healthy${NC}"
            
            # Verifica anche che il modello sia disponibile
            ensure_model_available
            
        else
            echo -e "${RED}❌ Ollama health check failed${NC}"
            log "Ollama health check failed, attempting restart..."
            
            if restart_ollama; then
                echo -e "${GREEN}✅ Ollama successfully restarted${NC}"
            else
                echo -e "${RED}❌ Failed to restart Ollama${NC}"
                log "CRITICAL: Unable to restart Ollama after failure"
                
                # Invia notifica (placeholder per future implementazioni)
                # send_alert "Ollama restart failed"
            fi
        fi
        
        sleep $HEALTHCHECK_INTERVAL
    done
}

# Funzione per cleanup
cleanup() {
    log "Monitoring stopped"
    exit 0
}

# Funzione per mostrare statistiche
show_stats() {
    echo -e "${BLUE}📊 Ollama Statistics${NC}"
    echo "─────────────────────────────────"
    
    # Docker stats
    if docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" | grep -q ollama; then
        echo -e "${GREEN}Container Stats:${NC}"
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" | grep ollama
    fi
    
    # Modelli disponibili
    echo -e "\n${GREEN}Available Models:${NC}"
    if curl -s "$OLLAMA_URL/api/tags" 2>/dev/null | grep -q "models"; then
        curl -s "$OLLAMA_URL/api/tags" | grep -o '"name":"[^"]*"' | sed 's/"name":"//g' | sed 's/"//g' | sed 's/^/- /'
    else
        echo "No models available or Ollama not reachable"
    fi
    
    echo ""
}

# Funzione per test di connessione
test_connection() {
    echo -e "${BLUE}🔍 Testing Ollama Connection${NC}"
    echo "─────────────────────────────────"
    
    if check_ollama_health; then
        echo -e "${GREEN}✅ Connection successful${NC}"
        
        # Test response time
        local start_time=$(date +%s%3N)
        curl -s "$OLLAMA_URL/" > /dev/null
        local end_time=$(date +%s%3N)
        local response_time=$((end_time - start_time))
        
        echo -e "${GREEN}Response time: ${response_time}ms${NC}"
        
        if [ $response_time -gt 1000 ]; then
            echo -e "${YELLOW}⚠️  High response time detected${NC}"
        fi
        
        return 0
    else
        echo -e "${RED}❌ Connection failed${NC}"
        return 1
    fi
}

# Crea directory logs se non esiste
mkdir -p ./logs

# Gestione segnali
trap cleanup SIGINT SIGTERM

# Parsing argomenti
case "${1:-}" in
    "monitor")
        monitor_ollama
        ;;
    "restart")
        restart_ollama
        ;;
    "stats")
        show_stats
        ;;
    "test")
        test_connection
        ;;
    "check")
        if check_ollama_health; then
            echo -e "${GREEN}✅ Ollama is healthy${NC}"
            exit 0
        else
            echo -e "${RED}❌ Ollama is not healthy${NC}"
            exit 1
        fi
        ;;
    *)
        echo "Usage: $0 {monitor|restart|stats|test|check}"
        echo ""
        echo "Commands:"
        echo "  monitor  - Start continuous monitoring"
        echo "  restart  - Restart Ollama container"
        echo "  stats    - Show current statistics"
        echo "  test     - Test connection"
        echo "  check    - Check if Ollama is healthy"
        exit 1
        ;;
esac
