# DynaMaker QFS and Elfsquad integration AWS SAM App

This project replicates the Power Automate flow for DynaMaker QFS and Elfsquad integration using AWS SAM and Node.js.

## Features
- Exposes an HTTP endpoint for Elfsquad to trigger a DynaMaker QFS job:
  - Fetches configuration details from Elfsquad
  - Checks configuration model ID
  - Removes existing file from Elfsquad quotation
  - Starts a QFS job to generate a new PDF document
- Exposes an HTTP callback function to which DynaMaker sends the generated PDF file:
  - Attaches the generated PDF to the Elfsquad quotation
- Ready-to-use Elfsquad UI scripts:
  - Trigger script to show a modal dialog
  - Modal dialog that makes the actual AJAX call to the HTTP endpoint (which in turn triggers the DynaMaker job)

## Setup
1. Copy `.env.example` to `.env` and fill in your credentials.
2. Run `npm install --prefix ./src` to install project dependencies.
3. (optional) Copy the `samconfig.example.toml` file to `samconfig.toml` to set the AWS region and CloudFormation stack
name. You can also specify an AWS profile to use for deployment.
3. Deploy to AWS with `npm run deploy` (see `package.json` for details).

## Elfsquad setup
1. Create a custom trigger (Integrations > Custom triggers)
2. Create two integration scripts (Integrations > Scripts) - you might have to ask Elfsquad to enable this section for
you:
    - The first script (a "trigger") gets executed when the custom trigger from above (step 1) gets called. This script (`elfsquad-ui-scripts/trigger.js`) will open the second script with the UI and actual AJAX calls.
    - The second script (`elfsquad-ui-scripts/dialog.js`) makes the actual AJAX calls to the exposed HTTP endpoint (lambda function) to trigger a DynaMaker job.

## Environment Variables
See `.env.example` for required variables.

## Deployment
`npm run deploy` (will execute `sam deploy --parameter-overrides $(grep -v '^#' .env | xargs)`)

## Local lambda function execution for development
- To test the `qfs-task-trigger` handler: copy `events/trigger.sample.json` to `events/trigger.json` and populate with real data, then run `npm run invoke-local-trigger`.

- To test the `qfs-callback` handler: copy `events/callback.sample.json` to `events/callback.json`, populate with data and run `npm run invoke-local-callback`.

## AWS Lambda Endpoints
- `QFS Task Trigger` - waits for Elfsquad events with quotation and configuration IDs to trigger a DynaMaker job.
- `QFS Callback` - receives QFS job results and uploads the generated PDF documents to the Elfsquad quotation.
