import express from "express";
import http from "http";
import { port } from "./constants/const.js";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Apis route
import apis from "./apis/apis.js";
app.use("/api", apis);

// Server creation and listening
const httpserver = http.createServer(app);
httpserver.listen(port, async () => {
  console.log(`The crypto honeypot detector server is running on port ${port}`);
  console.log(`Open your browser and try it: http://localhost:${port}/api/<dex>/<token_address>/default`);
});
