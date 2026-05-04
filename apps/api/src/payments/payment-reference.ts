import { randomUUID } from "node:crypto";

export const generatePaymentReference = (): string => randomUUID();
