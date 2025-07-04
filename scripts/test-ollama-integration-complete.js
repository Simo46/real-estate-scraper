#!/usr/bin/env node

/**
 * Test Ollama Integration Complete
 * Task 5.2 Day 4 - Test di integrazione completa per Ollama
 * 
 * Verifica tutte le funzionalità implementate:
 * - Ollama client setup e connection management
 * - Model loading e caching mechanisms
 * - Basic /chat endpoint per testing
 * - Error handling e fallback strategies
 * - Logging e monitoring setup
 */

const http = require('http');
const https = require('https');
const { promisify } = require('util');

// Configurazione
const config = {
    services: {
        ollama: {
            url: 'http://localhost:11434',
            name: 'Ollama'
        },
        nlp: {
            url: 'http://localhost:8002',
            name: 'NLP Service'
        },
        apiGateway: {
            url: 'http://localhost:3000',
            name: 'API Gateway'
        }
    },
    timeout: 30000,
    testModel: 'llama3.2:latest'
};

// Utility per HTTP requests
async function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Ollama-Integration-Test/1.0',
                ...options.headers
            },
            timeout: config.timeout
        };
        
        const req = client.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = {
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data
                    };
                    
                    if (res.headers['content-type']?.includes('application/json')) {
                        response.json = JSON.parse(data);
                    }
                    
                    resolve(response);
                } catch (error) {
                    reject(new Error(`Parse error: ${error.message}`));
                }
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        if (options.data) {
            req.write(JSON.stringify(options.data));
        }
        
        req.end();
    });
}

// Funzioni di test specifiche
async function testOllamaConnection() {
    console.log('\n🔍 Test 1: Connessione Ollama');
    
    try {
        const response = await makeRequest(config.services.ollama.url);
        
        if (response.statusCode === 200) {
            console.log('✅ Ollama raggiungibile');
            return true;
        } else {
            console.log(`❌ Ollama non raggiungibile (${response.statusCode})`);
            return false;
        }
    } catch (error) {
        console.log(`❌ Errore connessione Ollama: ${error.message}`);
        return false;
    }
}

async function testOllamaModels() {
    console.log('\n🔍 Test 2: Modelli Ollama');
    
    try {
        const response = await makeRequest(`${config.services.ollama.url}/api/tags`);
        
        if (response.statusCode === 200 && response.json) {
            const models = response.json.models || [];
            console.log(`✅ Trovati ${models.length} modelli`);
            
            models.forEach(model => {
                console.log(`   - ${model.name} (${(model.size / 1024 / 1024 / 1024).toFixed(2)}GB)`);
            });
            
            return models.length > 0;
        } else {
            console.log('❌ Impossibile recuperare modelli');
            return false;
        }
    } catch (error) {
        console.log(`❌ Errore recupero modelli: ${error.message}`);
        return false;
    }
}

async function testNlpServiceHealth() {
    console.log('\n🔍 Test 3: NLP Service Health');
    
    try {
        const response = await makeRequest(`${config.services.nlp.url}/health`);
        
        if (response.statusCode === 200 && response.json) {
            const health = response.json;
            console.log(`✅ NLP Service: ${health.status}`);
            console.log(`   - Ollama connection: ${health.ollama_connection}`);
            console.log(`   - Models loaded: ${health.models_loaded}`);
            console.log(`   - Active requests: ${health.active_requests}`);
            console.log(`   - Version: ${health.version}`);
            
            return health.status === 'healthy' || health.status === 'degraded';
        } else {
            console.log('❌ NLP Service non disponibile');
            return false;
        }
    } catch (error) {
        console.log(`❌ Errore NLP Service health: ${error.message}`);
        return false;
    }
}

async function testNlpServiceModels() {
    console.log('\n🔍 Test 4: NLP Service Models');
    
    try {
        const response = await makeRequest(`${config.services.nlp.url}/models`);
        
        if (response.statusCode === 200 && response.json) {
            const data = response.json;
            console.log(`✅ Modelli disponibili: ${data.total}`);
            console.log(`   - Modelli caricati: ${data.loaded.length}`);
            
            data.models.forEach(model => {
                const status = model.loaded ? '🟢' : '⚪';
                console.log(`   ${status} ${model.name}`);
            });
            
            return data.total > 0;
        } else {
            console.log('❌ Impossibile recuperare modelli NLP');
            return false;
        }
    } catch (error) {
        console.log(`❌ Errore recupero modelli NLP: ${error.message}`);
        return false;
    }
}

async function testModelLoad() {
    console.log('\n🔍 Test 5: Caricamento Modello');
    
    try {
        const response = await makeRequest(
            `${config.services.nlp.url}/models/${config.testModel}/load`,
            { method: 'POST' }
        );
        
        if (response.statusCode === 200 && response.json) {
            const result = response.json;
            console.log(`✅ Modello ${config.testModel} caricato`);
            console.log(`   - Status: ${result.status}`);
            console.log(`   - Timestamp: ${result.timestamp}`);
            
            return result.status === 'loaded';
        } else {
            console.log(`❌ Impossibile caricare modello ${config.testModel}`);
            return false;
        }
    } catch (error) {
        console.log(`❌ Errore caricamento modello: ${error.message}`);
        return false;
    }
}

async function testModelTest() {
    console.log('\n🔍 Test 6: Test Modello');
    
    try {
        const response = await makeRequest(
            `${config.services.nlp.url}/models/${config.testModel}/test`,
            { method: 'POST' }
        );
        
        if (response.statusCode === 200 && response.json) {
            const result = response.json;
            console.log(`✅ Test modello ${config.testModel} completato`);
            console.log(`   - Status: ${result.status}`);
            console.log(`   - Test time: ${result.test_time?.toFixed(2)}s`);
            console.log(`   - Tokens used: ${result.tokens_used}`);
            
            return result.status === 'success';
        } else {
            console.log(`❌ Test modello ${config.testModel} fallito`);
            return false;
        }
    } catch (error) {
        console.log(`❌ Errore test modello: ${error.message}`);
        return false;
    }
}

async function testChatEndpoint() {
    console.log('\n🔍 Test 7: Chat Endpoint');
    
    try {
        const chatRequest = {
            message: "Ciao! Come stai?",
            model: config.testModel,
            temperature: 0.7,
            max_tokens: 50
        };
        
        const response = await makeRequest(
            `${config.services.nlp.url}/chat`,
            {
                method: 'POST',
                data: chatRequest
            }
        );
        
        if (response.statusCode === 200 && response.json) {
            const result = response.json;
            console.log(`✅ Chat completata`);
            console.log(`   - Model: ${result.model}`);
            console.log(`   - Processing time: ${result.processing_time?.toFixed(2)}s`);
            console.log(`   - Tokens: ${result.total_tokens}`);
            console.log(`   - Response preview: ${result.message.substring(0, 100)}...`);
            
            return result.message && result.message.length > 0;
        } else {
            console.log(`❌ Chat fallita (${response.statusCode})`);
            return false;
        }
    } catch (error) {
        console.log(`❌ Errore chat: ${error.message}`);
        return false;
    }
}

async function testConversationHistory() {
    console.log('\n🔍 Test 8: Conversazione con Storico');
    
    try {
        const conversationId = 'test-conversation-' + Date.now();
        
        // Prima messaggio
        const firstMessage = {
            message: "Il mio nome è Mario. Ricordatelo.",
            model: config.testModel,
            conversation_id: conversationId,
            temperature: 0.1,
            max_tokens: 30
        };
        
        const firstResponse = await makeRequest(
            `${config.services.nlp.url}/chat`,
            {
                method: 'POST',
                data: firstMessage
            }
        );
        
        if (firstResponse.statusCode !== 200) {
            console.log('❌ Prima messaggio fallito');
            return false;
        }
        
        // Secondo messaggio
        const secondMessage = {
            message: "Qual è il mio nome?",
            model: config.testModel,
            conversation_id: conversationId,
            temperature: 0.1,
            max_tokens: 30
        };
        
        const secondResponse = await makeRequest(
            `${config.services.nlp.url}/chat`,
            {
                method: 'POST',
                data: secondMessage
            }
        );
        
        if (secondResponse.statusCode !== 200) {
            console.log('❌ Secondo messaggio fallito');
            return false;
        }
        
        // Verifica storico
        const historyResponse = await makeRequest(
            `${config.services.nlp.url}/chat/history/${conversationId}`
        );
        
        if (historyResponse.statusCode === 200 && historyResponse.json) {
            const history = historyResponse.json;
            console.log(`✅ Conversazione salvata`);
            console.log(`   - Conversation ID: ${conversationId}`);
            console.log(`   - Messages: ${history.total_messages}`);
            
            return history.total_messages >= 4; // 2 user + 2 assistant
        } else {
            console.log('❌ Impossibile recuperare storico');
            return false;
        }
    } catch (error) {
        console.log(`❌ Errore conversazione: ${error.message}`);
        return false;
    }
}

async function testServiceStats() {
    console.log('\n🔍 Test 9: Statistiche Servizio');
    
    try {
        const response = await makeRequest(`${config.services.nlp.url}/stats`);
        
        if (response.statusCode === 200 && response.json) {
            const stats = response.json;
            console.log(`✅ Statistiche recuperate`);
            console.log(`   - Service: ${stats.service}`);
            console.log(`   - Uptime: ${stats.uptime?.toFixed(2)}s`);
            console.log(`   - Total requests: ${stats.requests?.total}`);
            console.log(`   - Success rate: ${((stats.requests?.successful / stats.requests?.total) * 100).toFixed(1)}%`);
            console.log(`   - Avg response time: ${stats.performance?.avg_response_time?.toFixed(3)}s`);
            
            return true;
        } else {
            console.log('❌ Impossibile recuperare statistiche');
            return false;
        }
    } catch (error) {
        console.log(`❌ Errore statistiche: ${error.message}`);
        return false;
    }
}

async function testApiGatewayIntegration() {
    console.log('\n🔍 Test 10: Integrazione API Gateway');
    
    try {
        const response = await makeRequest(`${config.services.apiGateway.url}/api/nlp/health`);
        
        if (response.statusCode === 200 && response.json) {
            const health = response.json;
            console.log(`✅ NLP Service accessibile via API Gateway`);
            console.log(`   - Status: ${health.status}`);
            console.log(`   - Ollama connection: ${health.ollama_connection}`);
            
            return health.status === 'healthy' || health.status === 'degraded';
        } else {
            console.log('❌ NLP Service non accessibile via API Gateway');
            return false;
        }
    } catch (error) {
        console.log(`❌ Errore API Gateway: ${error.message}`);
        return false;
    }
}

async function testErrorHandling() {
    console.log('\n🔍 Test 11: Gestione Errori');
    
    try {
        // Test con modello inesistente
        const errorRequest = {
            message: "Test errore",
            model: "nonexistent-model",
            temperature: 0.1,
            max_tokens: 10
        };
        
        const response = await makeRequest(
            `${config.services.nlp.url}/chat`,
            {
                method: 'POST',
                data: errorRequest
            }
        );
        
        // Dovrebbe fallire ma gestire l'errore gracefully
        if (response.statusCode >= 400 && response.statusCode < 500) {
            console.log(`✅ Errore gestito correttamente (${response.statusCode})`);
            return true;
        } else {
            console.log(`❌ Errore non gestito correttamente (${response.statusCode})`);
            return false;
        }
    } catch (error) {
        console.log(`✅ Errore gestito correttamente: ${error.message}`);
        return true;
    }
}

// Funzione principale
async function runAllTests() {
    console.log('🚀 Test Ollama Integration Complete');
    console.log('=======================================');
    
    const tests = [
        { name: 'Connessione Ollama', fn: testOllamaConnection },
        { name: 'Modelli Ollama', fn: testOllamaModels },
        { name: 'NLP Service Health', fn: testNlpServiceHealth },
        { name: 'NLP Service Models', fn: testNlpServiceModels },
        { name: 'Caricamento Modello', fn: testModelLoad },
        { name: 'Test Modello', fn: testModelTest },
        { name: 'Chat Endpoint', fn: testChatEndpoint },
        { name: 'Conversazione Storico', fn: testConversationHistory },
        { name: 'Statistiche Servizio', fn: testServiceStats },
        { name: 'API Gateway Integration', fn: testApiGatewayIntegration },
        { name: 'Gestione Errori', fn: testErrorHandling }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            const result = await test.fn();
            if (result) {
                passed++;
            } else {
                failed++;
            }
        } catch (error) {
            console.log(`❌ Test ${test.name} fallito: ${error.message}`);
            failed++;
        }
    }
    
    console.log('\n📊 Risultati Test');
    console.log('==================');
    console.log(`✅ Passati: ${passed}`);
    console.log(`❌ Falliti: ${failed}`);
    console.log(`📈 Tasso successo: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
    
    if (failed === 0) {
        console.log('\n🎉 Tutti i test sono passati! Ollama Integration è completa.');
    } else {
        console.log('\n⚠️  Alcuni test sono falliti. Verifica la configurazione.');
    }
    
    return failed === 0;
}

// Esecuzione
if (require.main === module) {
    runAllTests().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Errore durante esecuzione test:', error);
        process.exit(1);
    });
}

module.exports = { runAllTests };
