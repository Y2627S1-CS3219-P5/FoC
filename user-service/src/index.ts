import express, { Request, Response, NextFunction } from "express";
import { initSchema } from "./schema";
import { authRouter } from "./auth";

const app = express();
app.use(express.json());

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled error:", err instanceof Error ? err.message : err);
  res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong" });
});

const PORT = Number(process.env.PORT) || 3001;

async function main(): Promise<void> {
  await initSchema();
  app.listen(PORT, () => console.log(`user-service listening on ${PORT}`));
}

main().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
