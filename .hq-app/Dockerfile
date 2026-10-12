FROM python:3.12-slim
WORKDIR /app
COPY server.py import_data.py security.py configure_password.py ./
COPY static/ ./static/
ENV PYTHONUNBUFFERED=1 HQ_BIND=0.0.0.0 HQ_DATABASE=/var/data/hq.sqlite3 HQ_REFERENCE_DIR=/var/data/references
EXPOSE 10000
CMD ["python3", "server.py"]
