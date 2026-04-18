# ProConnect API

Backend service for the ProConnect resume screening pipeline. This repo contains:

- The Express API gateway
- The BullMQ background worker
- MongoDB models and scoring services

## Local Development

1. Install dependencies with `npm install`
2. Copy `.env.example` to `.env`
3. Fill in `REDIS_URL`, `MONGO_URI`, `JWT_SECRET`, and optionally `GEMINI_API_KEY`
4. Start the API with `npm start`
5. Start the worker in a second terminal with `npm run worker`

## Railway Deployment

Deploy this repo as two Railway services that point at the same codebase:

1. `proconnect-api`
   Start command: `npm start`
2. `proconnect-worker`
   Start command: `npm run worker`

Add a Redis database and point both services at the same `REDIS_URL`.
Add the same `MONGO_URI`, `JWT_SECRET`, and `GEMINI_API_KEY` values to both services.

Recommended environment variables:

- `PORT=3000`
- `WORKER_HEALTH_PORT=3001`

Health checks:

- API: `GET /health`
- Worker: `GET /health` on `WORKER_HEALTH_PORT`
