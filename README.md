# Elfsquad drawing-generation integration AWS SAM App

This Node.js and AWS SAM-based project triggers PDF drawing generation for Elfsquad quotations, based on Elfsquad
webhooks or by using buttons in the Elfsquad UI. Generated files are automatically stored in the corresponding
Elfsquad quotation.

Originally this triggered the DynaMaker cloud "Quotation File Service" (QFS) to render the drawing. It now instead
calls a self-hosted render service (`configurators/w105-output/scripts/render-service/` in the `web-cad-test`
project), which renders the same PDF headlessly using the three.js-based W105 configurator — no DynaMaker QFS
subscription required. The `QFSTaskTrigger` Lambda in this project only reads the Elfsquad configuration, filters
by model ID, deletes any stale drawing, and hands the configuration off to the render service; `QFSCallback`
(unchanged) receives the finished PDF and uploads it to the quotation. See that project's plan/README for the
render-service side.

## Prerequisites
- AWS account with appropriate permissions
- Elfsquad project with access to the "Integrations > Scripts" section.
- A deployed render-service endpoint (`RenderServiceUrl` + `RenderApiKey`, see `.env.example`) — from the
  `web-cad-test` project's `configurators/w105-output/scripts/render-service/`.

## Setup

To enable this integration, deploy the Serverless Application Model (SAM) application to AWS.

1. Copy `.env.example` to `.env.production` and fill in your credentials.
2. Run `npm install --prefix ./src` to install project dependencies.
3. (optional) Copy the `samconfig.example.toml` file to `samconfig.toml` to set the AWS region and CloudFormation stack
   name. You can also specify an AWS profile to use for deployment.
4. Deploy to AWS with `npm run deploy` (see `package.json` for details).

## Elfsquad setup

You can trigger drawing generation from Elfsquad in two ways: using webhooks or custom triggers with scripts.

### Option 1: Using Elfsquad Webhooks

1. In Elfsquad, go to Integrations > Webhooks and create a new webhook.
2. Set the Callback URL to the QFS Task Trigger AWS Lambda endpoint URL (will be printed out in the terminal once you
   deploy the application to the cloud).
3. Select the Topics that should trigger the webhook (currently supported Topics are `quotation.configurationadded`,
   `quotation.revisionmade`, `quotation.copied`, and `quotation.requested`).

### Option 2: Using Elfsquad Custom Triggers with Scripts

1. Create a custom trigger in Elfsquad:
    - Go to Integrations > Custom triggers and create a new trigger for your workflow.
2. Create a script for the custom trigger:
    - Go to Integrations > Scripts and create a new script.
    - Use the contents of `elfsquad-ui-scripts/trigger.js` for this script.
    - This script gets executed when the custom trigger is called, and its sole purpose is to open a new UI dialog,
      where the actual AJAX calls to start the render job are made.
3. Create the UI dialog script:
    - In Integrations > Scripts, create another script.
    - Use the contents of `elfsquad-ui-scripts/dialog.js` for this script.
    - This script makes the actual AJAX calls to the exposed HTTP endpoint (Lambda function) to trigger the render job.
    - After you deploy the project, update the constant `triggerRenderJobLambdaURL` in this script to use your actual
      AWS Lambda endpoint URL (it will be printed out in the terminal after deployment).


## Environment Variables
Configure all required variables in your `.env.production` file. Refer to `.env.example` for details and example values.

## Deployment
Deploy the application using `npm run deploy`.

This command executes `sam deploy` with parameters from your `.env.production` file.

## Local Lambda Function Testing
To test locally, first copy `.env.example` to `.env.local` and fill in your credentials.

- For the `qfs-task-trigger` handler:
    1. Copy `events/trigger.sample.json` to `events/trigger.json`.
    2. Populate `events/trigger.json` with real data.
    3. Run `npm run invoke-local-trigger`.
- For the `qfs-callback` handler:
    1. Copy `events/callback.sample.json` to `events/callback.json`.
    2. Populate `events/callback.json` with real data.
    3. Run `npm run invoke-local-callback`.

## AWS Lambda Endpoints
- **QFS Task Trigger**: Triggers the render-service job for the affected configuration(s). The actual Lambda URL will be printed out in the terminal
  once you deploy the application to the cloud. This is the URL you will use as the Callback URL for Elfsquad webhooks,
  or as the `triggerRenderJobLambdaURL` variable in the second Elfsquad script `dialog.js` (see the `Elfsquad setup`
  section above).
    - Example: `https://abcde12345.execute-api.eu-central-1.amazonaws.com/Prod/qfs-task-trigger`
- **QFS Callback**: This endpoint receives the render-service result (the generated PDF, or a failure message) and
  uploads the PDF to the Elfsquad quotation. Unchanged by the render-service migration — it only expects a POST with
  the PDF as the body plus `cid`/`qid` query parameters, or `?success=false` with a JSON `message` on failure.
    - Example: `https://abcde12345.execute-api.eu-central-1.amazonaws.com/Prod/qfs-callback`