export interface CreatePaymentParams {
  paymentCode: string;
  amount: number;
  description: string;
  reference: string;
  customerEmail: string;
  customerName: string;
  allowCredit?: boolean;
  allowDebit?: boolean;
  allowPayce?: boolean;
}

export interface CreatePaymentResult {
  token: string;
  url: string;
}

export interface VerifyPaymentResult {
  status: "Success" | "Failed" | "Initiated";
  transactionNumber: string;
  amount: number;
  processor: string;
  dateSettled: string | null;
  account: string;
}

export interface QueryTransactionItem {
  reference: string;
  transactionNumber: string;
  status: VerifyPaymentResult["status"];
  amount: number;
}
