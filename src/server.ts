import "dotenv/config";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 8010);
const app = createApp();

app.listen(port, () => {
  console.log(`Funeralface API listening on port ${port}`);
  if (process.env.ENABLE_SWAGGER_UI?.trim().toLowerCase() !== "false") {
    console.log(`API docs (Swagger UI): http://localhost:${port}/docs`);
  }
});
