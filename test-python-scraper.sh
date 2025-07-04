#!/bin/bash

# Python Scraper Service - Simple Test Script
# Tests all public endpoints using curl

echo "🧪 Testing Python Scraper Service"
echo "=================================="

BASE_URL="http://localhost:8001"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_endpoint() {
    local endpoint="$1"
    local expected_status="$2"
    local description="$3"
    
    echo -n "Testing $description... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$endpoint")
    
    if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS${NC} ($response)"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (Expected $expected_status, got $response)"
        return 1
    fi
}

test_endpoint_with_output() {
    local endpoint="$1"
    local description="$2"
    
    echo "Testing $description:"
    echo "Endpoint: $BASE_URL$endpoint"
    
    response=$(curl -s "$BASE_URL$endpoint")
    status=$?
    
    if [ $status -eq 0 ]; then
        echo -e "${GREEN}✅ SUCCESS${NC}"
        echo "Response: $response" | jq '.' 2>/dev/null || echo "Response: $response"
    else
        echo -e "${RED}❌ FAILED${NC}"
    fi
    echo ""
}

# Test all endpoints
echo ""
echo "🔍 Testing Public Endpoints:"
test_endpoint "/" "200" "Root endpoint"
test_endpoint "/health" "200" "Docker health check"
test_endpoint "/api/health/status" "200" "Health status"
test_endpoint "/api/health/ready" "200" "Readiness check"
test_endpoint "/api/health/live" "200" "Liveness check"
test_endpoint "/api/health/metrics" "200" "Metrics endpoint"

echo ""
echo "📚 Testing Documentation:"
test_endpoint "/docs" "200" "Swagger documentation"
test_endpoint "/redoc" "200" "ReDoc documentation"
test_endpoint "/openapi.json" "200" "OpenAPI schema"

echo ""
echo "🔒 Testing Scraping Endpoints (currently without auth):"
test_endpoint "/api/scraping/jobs" "200" "Jobs list (currently accessible)"
test_endpoint "/api/scraping/stats" "200" "Stats (currently accessible)"

echo ""
echo "❌ Testing Error Handling:"
test_endpoint "/invalid/endpoint" "404" "Invalid endpoint"

echo ""
echo "📊 Detailed Responses:"
test_endpoint_with_output "/" "Root endpoint details"
test_endpoint_with_output "/health" "Health check details"
test_endpoint_with_output "/api/health/metrics" "Metrics details"

echo ""
echo "🌐 Testing CORS:"
echo -n "CORS preflight request... "
cors_response=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$BASE_URL/api/health/status" -H "Origin: http://localhost:3000")
if [ "$cors_response" = "200" ]; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${YELLOW}⚠️  UNKNOWN${NC} ($cors_response)"
fi

echo ""
echo "🎯 Service Information:"
curl -s "$BASE_URL/" | jq '.' 2>/dev/null || curl -s "$BASE_URL/"

echo ""
echo "=================================="
echo "✅ Test completed!"
echo ""
echo "💡 Next steps:"
echo "   - Check Docker container status: docker compose ps"
echo "   - View service logs: docker compose logs python-scraper"
echo "   - Access API docs: http://localhost:8001/docs"
