export type Channel = "web" | "whatsapp" | "email";

export type DraftLine = {
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
};

export type Draft = {
  items: DraftLine[];
  status: "draft" | "on_hold";
};

export type PaymentMethod = "online_transfer" | "cod";

export type PaymentStatus =
  | "pending_transfer"
  | "verification_pending"
  | "verified"
  | "cod_pending"
  | "paid";

export type OrderStatus =
  | "received"
  | "preparing"
  | "dispatched"
  | "delivered"
  | "cancelled";

export type AgentOrder = {
  id: string;
  order_number: number;
  restaurant_id: string;
  conversation_id: string;
  customer_ref: string;
  customer_name?: string | null;
  customer_phone: string;
  delivery_address: string;
  items: DraftLine[];
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  receipt_image_url?: string | null;
  created_at: string;
  updated_at: string;
};

export type RestaurantPaymentInfo = {
  bank_title: string;
  bank_account: string;
  bank_name: string;
  delivery_fee: number;
  manager_phone?: string | null;
};
