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
}

/** Result row from the app launcher (Start-Menu apps + Windows settings + classic tools). */
export interface AppResult {
  id:     string;
  name:   string;
  /** What gets passed to `bridge.appLaunch()`. */
  target: string;
  kind:   "app" | "setting" | "tool";
  icon:   string | null;
}

export interface AppSearchResponse {
  results: AppResult[];
}

/** A user-curated reusable text blob, stored independently from clipboard history. */
export interface SavedSnippet {
  id:         number;
  label:      string;
  content:    string;
  created_at: number;
  updated_at: number;
}

export type TabKey = "all" | "text" | "image" | "link" | "saved";

