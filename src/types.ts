export type ItemType = "text" | "image" | "link";

export interface Item {
  id: number;
  type: ItemType;
  content_text: string | null;
  content_url: string | null;
  image_path: string | null;
  title: string | null;
  hostname: string | null;
  preview: string;
  hash: string;
  byte_size: number;
  created_at: number;
  updated_at: number;
  pinned_at: number | null;
}

export interface AppSettings {
  monitoring: boolean;
  maxItems: number;
  launchOnStartup: boolean;
  autoPaste: boolean;
  /** Use the light colour theme instead of the default dark one. */
  lightTheme: boolean;
  /** Last used window mode. */
  windowMode: "compact" | "expanded";
}

export type TabKey = "all" | "text" | "image" | "link";
