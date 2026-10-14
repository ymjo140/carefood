FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 기본 실행: 식약처 데이터 수집
CMD ["python", "ingest_mfds.py"]
