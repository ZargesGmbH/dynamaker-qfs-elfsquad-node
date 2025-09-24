# Elfsquad & DynaMaker QFS AWS SAM App

This project replicates the Power Automate flow for Elfsquad and DynaMaker QFS integration using AWS SAM and Node.js.

## Features
- Receives Elfsquad webhook events (`/webhook`)
- Fetches configuration details from Elfsquad
- Checks configuration model ID
- Starts a QFS job to generate a PDF
- Receives QFS job callback (`/callback`)
- Attaches the generated PDF to the Elfsquad quotation

## Setup
1. Copy `.env.example` to `.env` and fill in your credentials.
2. Run `npm install` to install dependencies.
3. Deploy with AWS SAM (`sam build` & `sam deploy`).

## Environment Variables
See `.env.example` for required variables.

## Endpoints
- `POST /webhook`: Receives Elfsquad events
- `POST /callback`: Receives QFS job results

## Notes
- Make sure your Lambda functions have network access to Elfsquad and DynaMaker QFS APIs.
- API keys and IDs must be set in environment variables.
