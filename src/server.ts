import "dotenv/config";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 8010);
const app = createApp();

app.listen(port, () => {
  console.log(`Funeralface API listening on port ${port}`);
});
