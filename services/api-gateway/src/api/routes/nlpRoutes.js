const express = require('express');
const router = express.Router();

// Configurazione per il servizio NLP
const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL || 'http://nlp-service:8002';

// Middleware per il proxy verso l'NLP service
const proxyToNlpService = async (req, res, next) => {
    try {
        const targetUrl = `${NLP_SERVICE_URL}${req.path}`;
        
        const fetchOptions = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'API-Gateway-Proxy/1.0'
            },
            timeout: 30000
        };

        // Aggiungi body per POST/PUT requests
        if (req.body && (req.method === 'POST' || req.method === 'PUT')) {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetch(targetUrl, fetchOptions);
        
        // Leggi il corpo della risposta
        const responseData = await response.text();
        
        // Prova a parsare come JSON, altrimenti invia come testo
        let jsonData;
        try {
            jsonData = JSON.parse(responseData);
        } catch (e) {
            return res.status(response.status).send(responseData);
        }
        
        // Proxy della risposta
        res.status(response.status).json(jsonData);
    } catch (error) {
        console.error('Errore proxy NLP Service:', error.message);
        
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
            // Timeout
            res.status(504).json({
                error: 'Gateway Timeout',
                message: 'NLP Service request timeout',
                service: 'nlp-service'
            });
        } else if (error.cause && error.cause.code === 'ECONNREFUSED') {
            // Il servizio non è raggiungibile
            res.status(503).json({
                error: 'Service Unavailable',
                message: 'NLP Service is not reachable',
                service: 'nlp-service'
            });
        } else {
            // Errore generico
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Failed to proxy request to NLP Service',
                details: error.message
            });
        }
    }
};

// Routes per l'NLP service
router.get('/health', proxyToNlpService);
router.get('/models', proxyToNlpService);
router.get('/models/:model', proxyToNlpService);
router.post('/models/:model/load', proxyToNlpService);
router.post('/models/:model/test', proxyToNlpService);
router.post('/chat', proxyToNlpService);
router.get('/chat/history/:conversationId', proxyToNlpService);
router.get('/stats', proxyToNlpService);

module.exports = router;
