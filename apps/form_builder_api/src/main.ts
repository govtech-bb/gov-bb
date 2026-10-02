import { app } from "./app";

const PORT = parseInt(process.env.PORT ?? "3003", 10);

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Form Builder API listening on port ${PORT}`);
});

// PID 1 in the container: with no handler SIGTERM is ignored and ECS SIGKILLs
// after stopTimeout, dropping in-flight requests on every deploy.
process.on("SIGTERM", () => server.close(() => process.exit(0)));
