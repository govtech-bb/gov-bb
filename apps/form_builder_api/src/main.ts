import { app } from "./app";

const PORT = parseInt(process.env.PORT ?? "3003", 10);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Form Builder API listening on port ${PORT}`);
});
