import { Controller, Get, Header } from "@nestjs/common";
import { collectDefaultMetrics, register } from "prom-client";

collectDefaultMetrics({ prefix: "madeye_api_" });

@Controller()
export class MetricsController {
  @Get("metrics")
  @Header("Content-Type", register.contentType)
  metrics(): Promise<string> {
    return register.metrics();
  }
}
