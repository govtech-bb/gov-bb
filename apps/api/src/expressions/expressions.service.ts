import { Injectable } from "@nestjs/common";
import jsonLogic from "json-logic-js";
import {
  resolveConfig,
  registerOperations,
  ResolutionContext,
} from "@govtech-bb/expressions";

let opsRegistered = false;

@Injectable()
export class ExpressionsService {
  constructor() {
    if (!opsRegistered) {
      registerOperations(jsonLogic);
      opsRegistered = true;
    }
  }

  resolveConfig(
    config: Record<string, unknown>,
    ctx: ResolutionContext,
  ): Record<string, unknown> {
    return resolveConfig(config, ctx);
  }
}
