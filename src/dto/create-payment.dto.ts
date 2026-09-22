export interface CreatePaymentDTO {
  idempotencyKey: string;
  userId: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed";
}
