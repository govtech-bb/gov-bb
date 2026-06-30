import { createDataSourceFromEnv } from "@govtech-bb/database";
import * as dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(__dirname, "../../.env") });

// Env→TypeORM mapping (incl. strict prod SSL) and the package's entities and
// migrations live in @govtech-bb/database (#1408).
export const AppDataSource = createDataSourceFromEnv();
