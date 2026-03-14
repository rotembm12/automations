// =============================================================
// Run this script ONCE to auto-create the lead capture form.
// Go to: script.google.com → New Project → paste this → Run createLeadForm()
// The form URL will be logged in the execution log.
// =============================================================

var WEBHOOK_URL   = "https://your-server.com/webhook/lead"; // replace after deploying your server
var WEBHOOK_SECRET = "cool-secret-yeah";              // must match WEBHOOK_SECRET in .env

function createLeadForm() {
  var form = FormApp.create("Lead Intake Form");
  form.setDescription("Tell us a bit about yourself and we'll be in touch shortly.");
  form.setCollectEmail(false); // we ask for email manually so it maps cleanly to Notion

  // 1. Full Name
  form.addTextItem()
    .setTitle("Full Name")
    .setRequired(true);

  // 2. Company Name
  form.addTextItem()
    .setTitle("Company Name")
    .setRequired(true);

  // 3. Email
  var emailItem = form.addTextItem()
    .setTitle("Email")
    .setRequired(true);
  emailItem.setValidation(
    FormApp.createTextValidation()
      .requireTextIsEmail()
      .build()
  );

  // 4. Phone Number
  form.addTextItem()
    .setTitle("Phone Number")
    .setRequired(false);

  // 5. Job Title
  form.addTextItem()
    .setTitle("Job Title")
    .setRequired(false);

  // 6. Company Size
  form.addMultipleChoiceItem()
    .setTitle("Company Size")
    .setChoiceValues(["1–10", "11–50", "51–200", "201–500", "500+"])
    .setRequired(false);

  // 7. Source
  form.addMultipleChoiceItem()
    .setTitle("How did you find us?")
    .setChoiceValues(["Referral", "LinkedIn", "Google", "Event", "Other"])
    .setRequired(false);

  // 8. Interest
  form.addParagraphTextItem()
    .setTitle("What are you interested in?")
    .setRequired(false);

  // Link responses to a Google Sheet for backup
  var sheet = SpreadsheetApp.create("Lead Form Responses");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  // Auto-install the onFormSubmit webhook trigger
  ScriptApp.newTrigger("onFormSubmit")
    .forForm(form)
    .onFormSubmit()
    .create();

  Logger.log("=== Form created successfully ===");
  Logger.log("Form edit URL:    " + form.getEditUrl());
  Logger.log("Form publish URL: " + form.getPublishedUrl());
  Logger.log("Response Sheet:   " + sheet.getUrl());
  Logger.log("");
  Logger.log("Next step: open the form script editor and paste form-trigger.gs");
}


// =============================================================
// FIELD MAP — must match the form question titles above
// =============================================================
var FIELD_MAP = {
  "Full Name":                    "name",
  "Company Name":                 "company",
  "Email":                        "email",
  "Phone Number":                 "phone",
  "Job Title":                    "jobTitle",
  "Company Size":                 "companySize",
  "How did you find us?":         "source",
  "What are you interested in?":  "interest"
};

function onFormSubmit(e) {
  var response = e.response;
  var answers  = response.getItemResponses();
  var payload  = { submittedAt: response.getTimestamp().toISOString() };

  answers.forEach(function(answer) {
    var question = answer.getItem().getTitle();
    var key      = FIELD_MAP[question];
    if (key) payload[key] = answer.getResponse();
  });

  var options = {
    method: "post",
    contentType: "application/json",
    headers: { "x-webhook-secret": WEBHOOK_SECRET },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var result = UrlFetchApp.fetch(WEBHOOK_URL, options);
  Logger.log("Webhook response: " + result.getContentText());
}
