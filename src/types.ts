export type Product = {
  id: number;
  name: string;
  createdAt: string;
};

export type ProductUrl = {
  id: number;
  productId: number;
  url: string;
  basePrice: number;
  thresholdPercent: number;
  lastPrice: number | null;
  lastNotifiedPrice: number | null;
  enabled: boolean;
  createdAt: string;
};

export type ProductUrlWithProduct = ProductUrl & {
  productName: string;
};

export type ProductSummary = {
  id: number;
  name: string;
  urlCount: number;
  minBasePrice: number | null;
  maxBasePrice: number | null;
  firstBasePrice: number | null;
};

export type PriceFetchResult = {
  price: number;
  currency: "JPY";
  source: string;
};

export type RegisterProductInput = {
  name: string;
  url: string;
  thresholdPercent?: number;
};

export type NotificationPayload = {
  productName: string;
  url: string;
  currentPrice: number;
  basePrice: number;
  discountPercent: number;
};
