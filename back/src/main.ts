import { createStandaloneNestApp } from "./bootstrap";

async function bootstrap() {
  const app = await createStandaloneNestApp();
  const port = Number(process.env.PORT || 3001);
  await app.listen(port);
}

void bootstrap();
