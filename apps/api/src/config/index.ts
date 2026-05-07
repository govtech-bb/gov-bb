import appConfig from "./app.config";
import databaseConfig from "./database.config";
import emailConfig from "./email.config";
import spreadsheetConfig from "./spreadsheet.config";
import sqsConfig from "./sqs.config";

export { default as sqsConfig } from "./sqs.config";

export const configs = [
  appConfig,
  databaseConfig,
  emailConfig,
  spreadsheetConfig,
  sqsConfig,
];
