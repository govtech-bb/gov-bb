import { createApp } from "./app.js";
import { openDb } from "./db.js";

const PORT = Number(process.env.PORT ?? 3040);
const DB_PATH = process.env.DB_PATH ?? "data/content.db";

const db = openDb(DB_PATH);
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`simple_mock_api listening on port ${PORT}`);
});
