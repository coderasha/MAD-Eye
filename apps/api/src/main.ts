import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { ApiExceptionFilter } from "./common/http.js";
import { ENV, type Env } from "./env.js";
import { JsonLogger } from "./logging.js";

const app = await NestFactory.create(AppModule, { logger: new JsonLogger() });
const env = app.get<Env>(ENV);
app.setGlobalPrefix("api", { exclude: ["metrics"] });
app.use(helmet());
app.use(cookieParser());
app.enableCors({ origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()), credentials: true });
app.useGlobalFilters(new ApiExceptionFilter());
if (env.NODE_ENV !== "production" || env.ENABLE_API_DOCS === "true") {
  const config = new DocumentBuilder()
    .setTitle("MAD-EYE Platform API")
    .setDescription("Platform API. Recognition routes are not part of this service.")
    .setVersion("1.0.0")
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, config));
}
await app.listen(env.PORT);
