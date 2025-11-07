# DynaMaker QFS and Elfsquad integration AWS SAM App

This Node.js and AWS SAM-based project provides an integration between Elfsquad and DynaMaker QFS. It allows you to
generate DynaMaker quotation files, such as drawings, based on Elfsquad webhooks or by using buttons in the Elfsquad UI.
Generated files are automatically stored in the corresponding Elfsquad quotation.

## Prerequisites
- AWS account with appropriate permissions
- Elfsquad project with access to the "Integrations > Scripts" section.
- DynaMaker project with the "Quotation File Service (QFS)" plugin enabled (available in the Pro Plan)
    - For setup instructions, refer to the official integration guide: https://docs.dynamaker.com/integration-qfs

## Setup

To enable this integration, deploy the Serverless Application Model (SAM) application to AWS.

1. Copy `.env.example` to `.env.production` and fill in your credentials.
2. Run `npm install --prefix ./src` to install project dependencies.
3. (optional) Copy the `samconfig.example.toml` file to `samconfig.toml` to set the AWS region and CloudFormation stack
   name. You can also specify an AWS profile to use for deployment.
4. Deploy to AWS with `npm run deploy` (see `package.json` for details).

## Elfsquad setup

You can trigger the DynaMaker job from Elfsquad in two ways: using webhooks or custom triggers with scripts.

### Option 1: Using Elfsquad Webhooks

1. In Elfsquad, go to Integrations > Webhooks and create a new webhook.
2. Set the Callback URL to the QFS Task Trigger AWS Lambda endpoint URL (will be printed out in the terminal once you
   deploy the application to the cloud).
3. Select the Topics that should trigger the webhook (currently supported Topics are `quotation.configurationadded` and
   `quotation.revisionmade`).

### Option 2: Using Elfsquad Custom Triggers with Scripts

1. Create a custom trigger in Elfsquad:
    - Go to Integrations > Custom triggers and create a new trigger for your workflow.
2. Create a script for the custom trigger:
    - Go to Integrations > Scripts and create a new script.
    - Use the contents of `elfsquad-ui-scripts/trigger.js` for this script.
    - This script gets executed when the custom trigger is called, and its sole purpose is to open a new UI dialog,
      where the actual AJAX calls to start the DynaMaker job are made.
3. Create the UI dialog script:
    - In Integrations > Scripts, create another script.
    - Use the contents of `elfsquad-ui-scripts/dialog.js` for this script.
    - This script makes the actual AJAX calls to the exposed HTTP endpoint (Lambda function) to trigger a DynaMaker job.
    - After you deploy the project, update the constant `triggerDynamakerJobLambdaURL` in this script to use your actual
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
- **QFS Task Trigger**: Triggers the specified DynaMaker job. The actual Lambda URL will be printed out in the terminal
  once you deploy the application to the cloud. This is the URL you will use as the Callback URL for Elfsquad webhooks,
  or as the `triggerDynamakerJobLambdaURL` variable in the second Elfsquad script `dialog.js` (see the `Elfsquad setup`
  section above).
    - Example: `https://abcde12345.execute-api.eu-central-1.amazonaws.com/Prod/qfs-task-trigger`
- **QFS Callback**: This endpoint receives QFS job results and uploads the generated PDF documents to the Elfsquad
  quotation.
    - Example: `https://abcde12345.execute-api.eu-central-1.amazonaws.com/Prod/qfs-callback`