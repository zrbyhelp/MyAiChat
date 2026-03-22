FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY start-agent.sh ./start-agent.sh
RUN chmod +x ./start-agent.sh

CMD ["./start-agent.sh"]
