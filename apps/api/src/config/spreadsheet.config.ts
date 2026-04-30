import { registerAs } from "@nestjs/config";
import { join } from "node:path";

export default registerAs("spreadsheet", () => ({
  // Directory where per-form .xlsx export files are written.
  // Override with SPREADSHEET_EXPORT_DIR in production (e.g. a mounted volume).
  exportDir:
    process.env.SPREADSHEET_EXPORT_DIR ?? join(process.cwd(), "exports"),
}));
