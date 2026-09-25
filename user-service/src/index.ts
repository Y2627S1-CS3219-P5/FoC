import express, { Request, Response } from "express";
import { initSchema } from "./schema";

const app = express();
app.use(express.json());

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

const PORT = Number(process.env.PORT) || 3001;

async function main(): Promise<void> {
  await initSchema(); // fail fast if the DB is unreachable or the schema is invalid
  app.listen(PORT, () => console.log(`user-service listening on ${PORT}`));
}

main().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
