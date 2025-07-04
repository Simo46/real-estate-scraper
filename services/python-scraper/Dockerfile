# Dockerfile - Python 3.13 optimized for Real Estate Scraper Service
# TODO: Optimize for Python 3.13
# TODO: Configure for development hot reload
# TODO: Setup proper user permissions
# TODO: Configure environment variables

FROM python:3.13-slim

# Set working directory
WORKDIR /app

# Install system dependencies for scraping
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better Docker layer caching
COPY requirements/ requirements/

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements/base.txt

# Copy application code
COPY . .

# Expose port for FastAPI
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run FastAPI with uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
