# Elfsquad drawing-generation integration AWS SAM App

This Node.js and AWS SAM-based project triggers PDF drawing generation for Elfsquad quotations, based on Elfsquad
webhooks or by using buttons in the Elfsquad UI. Generated files are automatically stored in the corresponding
Elfsquad quotation.

The `QFSTaskTrigger` Lambda reads the Elfsquad configuration, looks up which **job service** is responsible for its
configurator model ID, deletes any stale drawing, and hands the configuration off to that service; `QFSCallback`
receives the finished PDF (or an error) from whichever service handled the job and uploads it to the quotation.

A job service is anything that speaks the DynaMaker "Quotation File Service" (QFS) job protocol: accept
`POST { configuration, callbackUrl, … }` and later `POST` the finished PDF — or `?success=false` with a JSON error —
to that `callbackUrl`. DynaMaker QFS itself (`https://qfs.dynamaker.com/jobs`) is the default/primary target this
project was built for, and is what most configurator models will keep using. `JobServicesByModelId` (see
`.env.example`) additionally lets you point **individual configurator models** at any other compatible job service,
without touching any code and independently of what the other models use. This makes it possible to route one
configurator to a different service while the rest keep using DynaMaker QFS.
`QFSCallback` doesn't care which service a job came from and needs no changes either way.

## Prerequisites
- AWS account with appropriate permissions
- Elfsquad project with access to the "Integrations > Scripts" section.
- At least one job service to route configurator models to (see `JobServicesByModelId` in `.env.example`) — typically
  a DynaMaker account with the "Quotation File Service (QFS)" plugin enabled (Pro Plan; see
  https://docs.dynamaker.com/integration-qfs), optionally alongside other compatible services for specific models.

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

`JobServicesByModelId` is a JSON array that routes each supported Elfsquad configurator model ID to the job service
that renders it. Only configurations whose model ID is listed are dispatched; all others are skipped. Fields per
entry:

| Field | Required | Meaning |
|---|---|---|
| `modelIds` | yes | Elfsquad configurator model IDs handled by this service. Each model ID must appear in only one entry. |
| `url` | yes | Job endpoint to POST to, e.g. `https://qfs.dynamaker.com/jobs`. |
| `apiKey` | yes | Shared secret sent in the auth header. |
| `apiKeyHeader` | no | Name of the auth header. Defaults to `qfs-api-key` (what DynaMaker QFS expects). |
| `applicationId` | DynaMaker only | DynaMaker application that renders these models. Presence of this field is what makes the job payload DynaMaker-shaped. |
| `task` | no | DynaMaker task name; defaults to `generate-pdf` when `applicationId` is set. |
| `environment` | no | DynaMaker environment, e.g. `test` or `production`. |

Entries without `applicationId` receive a minimal `{ configuration, callbackUrl }` job payload — enough for any
service implementing the protocol. A malformed value fails fast at Lambda init with an explicit error rather than
silently skipping configurations.

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
- **QFS Task Trigger**: Looks up the job service for the affected configuration(s) and triggers a job on it. The
  actual Lambda URL will be printed out in the terminal once you deploy the application to the cloud. This is the URL
  you will use as the Callback URL for Elfsquad webhooks, or as the `triggerRenderJobLambdaURL` variable in the second
  Elfsquad script `dialog.js` (see the `Elfsquad setup` section above).
    - Example: `https://abcde12345.execute-api.eu-central-1.amazonaws.com/Prod/qfs-task-trigger`
- **QFS Callback**: This endpoint receives the job result (the generated PDF, or a failure message) from whichever
  job service handled it and uploads the PDF to the Elfsquad quotation. The same for every job service — it only
  expects a POST with the PDF as the body plus `cid`/`qid` query parameters, or `?success=false` with a JSON
  `message` on failure.
    - Example: `https://abcde12345.execute-api.eu-central-1.amazonaws.com/Prod/qfs-callback`