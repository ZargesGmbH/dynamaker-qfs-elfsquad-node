# DynaMaker QFS and Elfsquad integration AWS SAM App


This Node.js and AWS SAM-based project provides an integration between Elfsquad and DynaMaker QFS. It allows you to generate DynaMaker quotation files, such as drawings, based on Elfsquad events or by using buttons in the Elfsquad UI. Generated files are automatically stored in the corresponding Elfsquad quotation.

## Prerequisites
- AWS account with appropriate permissions
- Elfsquad project with access to the "Integrations > Scripts" section.
- DynaMaker project with the "Quotation File Service (QFS)" plugin enabled (available in the Pro Plan)
    - For setup instructions, refer to the official integration guide: https://docs.dynamaker.com/integration-qfs

## Setup

To enable this integration, deploy the Serverless Application Model (SAM) application to AWS. Note that the integration requires the deployed URLs of your Lambda functions to be set in the environment variables. As a result, an initial deployment is needed to obtain these URLs, followed by a second deployment after updating the environment variables with the correct endpoints.

1. Copy `.env.example` to `.env.production` and fill in your credentials.
2. Run `npm install --prefix ./src` to install project dependencies.
3. (optional) Copy the `samconfig.example.toml` file to `samconfig.toml` to set the AWS region and CloudFormation stack name. You can also specify an AWS profile to use for deployment.
3. Deploy to AWS with `npm run deploy` (see `package.json` for details).

## Elfsquad setup
1. Create a custom trigger in Elfsquad:
    - Go to Integrations > Custom triggers and create a new trigger for your workflow.
2. Create the first script (trigger script):
    - Go to Integrations > Scripts and create a new script.
    - Use the contents of `elfsquad-ui-scripts/trigger.js` for this script.
    - This script will be executed when the custom trigger is called and will open the second script with the UI and AJAX calls.
3. Create the second script (dialog script):
    - In Integrations > Scripts, create another script.
    - Use the contents of `elfsquad-ui-scripts/dialog.js` for this script.
    - This script makes the actual AJAX calls to the exposed HTTP endpoint (Lambda function) to trigger a DynaMaker job.
    - After deployment, update the  constant `triggerDynamakerJobLambdaURL` in this script to use your actual AWS Lambda endpoint URL.


## Environment Variables
Configure all required variables in your `.env.production` file. Refer to `.env.example` for details and example values.

## Deployment
Deploy the application using:
```bash
npm run deploy (will execute sam deploy --parameter-overrides $(grep -v '^#' .env | xargs)
```
This command executes `sam deploy` with parameters from your `.env.production` file.

## Local Lambda Function Testing
To test locally:
- For the `qfs-task-trigger` handler:
    1. Copy `events/trigger.sample.json` to `events/trigger.json`.
    2. Populate `events/trigger.json` with real data.
    3. Run `npm run invoke-local-trigger`.
- For the `qfs-callback` handler:
    1. Copy `events/callback.sample.json` to `events/callback.json`.
    2. Populate `events/callback.json` with real data.
    3. Run `npm run invoke-local-callback`.

## AWS Lambda Endpoints
- **QFS Task Trigger**: Receives Elfsquad events with quotation and configuration IDs to trigger a DynaMaker job.
    - Example: `https://abcde12345.execute-api.eu-central-1.amazonaws.com/Prod/qfs-task-trigger`
- **QFS Callback**: Receives QFS job results and uploads the generated PDF documents to the Elfsquad quotation.
    - Example: `https://abcde12345.execute-api.eu-central-1.amazonaws.com/Prod/qfs-callback`
