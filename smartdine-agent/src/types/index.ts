export type Channel = "web" | "whatsapp" | "email";
export type DraftLine = { menu_item_id: string; name: string; quantity: number; unit_price: number };
export type Draft = { items: DraftLine[]; status: "draft" | "on_hold" };
