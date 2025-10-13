const triggerDynamakerJobLambdaURL = "___ENTER_AWS_LAMBDA_URL_OF_QFSTaskTrigger_FUNCTION___"; //  example: "https://abcde12345.execute-api.eu-central-1.amazonaws.com/Prod/qfs-task-trigger"

const closeDialogAfter = 10; // seconds
let closeDialogCountdownCounter = 0;

await runApp();

async function runApp() {
  createUI();

  updateProgress("Triggering the generation of configuration drawings...");

  await loadScriptAsync("https://unpkg.com/axios@1.12.2/dist/axios.min.js");
  try {
    const response = await axios.patch(
      triggerDynamakerJobLambdaURL,
      {
        quotationId: parameters.quotationId,
      },
      {
        headers: {
          'Content-Type': 'text/plain',
        },
      },
    );

    updateProgress("PDF generation triggered successfully. Once the files are ready (can take a few minutes), they" +
      " will be automatically attached to the quotation.");
    updateCountdown(getCountdownMessage(closeDialogAfter));
    document.getElementById("button_wrapper").style.display = "flex";
    setTimeout(countDownToCloseDialog, 1000);
  } catch (error) {
    let errorToDisplay = error.message;
    if (error.response?.data?.message) {
      errorToDisplay += ' (' + error.response.data.message
      if (error.response?.data?.errors) {
        errorToDisplay += ": " + error.response?.data?.errors.join(" | ");
      }
      errorToDisplay += ')';
    }
    if (error.response?.data?.ref) {
      errorToDisplay += " (ref: " + error.response.data.ref + ")";
    }
    errorToDisplay += ".";

    updateProgress(errorToDisplay);
  }

  hideLoader();
  ui.reload();
}

function countDownToCloseDialog() {
  if (++closeDialogCountdownCounter >= closeDialogAfter) {
    ui.reload();
    dialog.close();
  } else {
    updateCountdown(getCountdownMessage(closeDialogAfter - closeDialogCountdownCounter));
    setTimeout(countDownToCloseDialog, 1000);
  }
}

function getCountdownMessage(secondsLeft) {
  return `This dialog will close in ${secondsLeft} seconds...`
}

async function loadScriptAsync(url) {
  let promise = new Promise((resolve) => {
    const scriptTag = document.createElement('script');
    scriptTag.setAttribute('src', url);
    scriptTag.setAttribute('type', 'module');
    scriptTag.addEventListener('load', () => {
      resolve();
    });
    document.head.appendChild(scriptTag);
  });
  return promise;
}

function createUI() {
  const mainUI = document.createElement("main");
  mainUI.innerHTML = `
      <div style="font-family: Arial, sans-serif; text-align: center; padding: 20 20 20 0;">
          <div id="loader"></div>
          <p id="status_messages" style="font-size: 14px; font-weight: 500; color: #1f2937;">Preparing...</p>
          <p id="status_countdown" style="font-size: 14px; font-weight: 500; color: #1f2937;"></p>
      </div>
      <div id="button_wrapper"
          style="display: none; justify-content: center; margin-top: 10px;">
          <button id="button_close"
              style="border-radius: 4px; background: #00aeef; padding: 8px 16px; font-size: 14px; font-weight: 600; color: white;
              box-shadow: 0px 2px 4px rgba(0,0,0,0.1); border: none; cursor: pointer; transition: background 0.3s ease-in-out;"
              onmouseover="this.style.background='#0098d1'"
              onmouseout="this.style.background='#00aeef'"
              onfocus="outline: 2px solid #0098d1; outline-offset: 2px;"
              onClick="ui.reload(); dialog.close();">
              Refresh Quotation & Close
          </button>
      </div>
      <style>
      body {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          background-color: #f0f0f0;
      }

      #loader {
          margin: 0 auto;
          width: 50px;
          height: 50px;
          border: 5px solid #ccc;
          border-top: 5px solid #3498db;
          border-radius: 50%;
          animation: spin 1s linear infinite;
      }

      @keyframes spin {
          to {
              transform: rotate(360deg);
          }
      }
      </style>
  `;
  document.body.appendChild(mainUI);
}

function hideLoader() {
  document.getElementById("loader").style.display = "none";
}

function updateProgress(text) {
  document.getElementById("status_messages").textContent = text;
}

function updateCountdown(text) {
  document.getElementById("status_countdown").textContent = text;
}
