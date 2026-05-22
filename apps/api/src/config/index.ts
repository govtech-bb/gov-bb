import appConfig from "./app.config";
import databaseConfig from "./database.config";
import emailConfig from "./email.config";
import spreadsheetConfig from "./spreadsheet.config";
import sqsConfig from "./sqs.config";
import uploadConfig from "./upload.config";
export { default as sqsConfig } from "./sqs.config";
export { default as uploadConfig } from "./upload.config";

export const configs = [
  appConfig,
  databaseConfig,
  emailConfig,
  spreadsheetConfig,
  sqsConfig,
  uploadConfig,
];
