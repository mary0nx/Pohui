/** DTOs mirroring backend Pydantic schemas. Money and quantities arrive as decimal strings. */

export type UUID = string;
export type Money = string;
export type Visibility = "family" | "private";
export type Role = "owner" | "admin" | "member";

export interface UserOut {
  id: UUID;
  telegram_id: number;
  first_name: string;
  last_name: string | null;
  username: string | null;
  language_code: string | null;
  photo_url: string | null;
  bot_started: boolean;
}

export interface Membership {
  family_id: UUID;
  name: string;
  role: Role;
  currency: string;
  timezone: string;
}

export interface Me {
  user: UserOut;
  families: Membership[];
  active_family_id: UUID | null;
  auth_method: "telegram" | "dev" | "device";
  /** An invitation opened in the bot that the user has not answered yet (newer servers). */
  pending_invitation?: PendingInvitation | null;
}

export interface TokenOut {
  token: string;
  expires_at: string;
  start_param: string | null;
  me: Me;
}

export interface Meta {
  env: string;
  dev_auth: boolean;
  ai_available: boolean;
  bot_username: string | null;
  storage: string;
  max_upload_mb: number;
  /** False while files would land on a disk wiped by deploys; documents can be saved without a file. */
  uploads_enabled: boolean;
}

export interface Member {
  id: UUID;
  user_id: UUID;
  first_name: string;
  last_name: string | null;
  username: string | null;
  photo_url: string | null;
  role: Role;
  joined_at: string;
}

export interface Family {
  id: UUID;
  name: string;
  currency: string;
  timezone: string;
  ai_enabled: boolean;
  ai_auto_execute: boolean;
  created_at: string;
  members: Member[];
  my_role: Role | null;
}

export interface Invitation {
  id: UUID;
  role: Role;
  max_uses: number;
  use_count: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface InvitationCreated extends Invitation {
  token: string;
  link: string | null;
  start_param: string;
}

export interface InvitationPreview {
  family_name: string;
  inviter_name: string | null;
  expires_at: string;
  already_member: boolean;
}

export interface PendingInvitation extends InvitationPreview {
  id: UUID;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// --- Finance ---

export type AccountKind = "cash" | "bank" | "card" | "savings" | "other";
export type TxKind = "income" | "expense" | "refund" | "transfer";
export type PaymentMethod = "cash" | "card" | "bank_transfer" | "other";

export interface Account {
  id: UUID;
  name: string;
  kind: AccountKind;
  currency: string;
  initial_balance: Money;
  balance: Money;
  visibility: Visibility;
  created_by: UUID | null;
  archived_at: string | null;
}

export interface Category {
  id: UUID;
  name: string;
  kind: "expense" | "income";
  parent_id: UUID | null;
  icon: string | null;
  color: string | null;
  archived_at: string | null;
}

export interface Transaction {
  id: UUID;
  kind: TxKind;
  amount: Money;
  currency: string;
  account_id: UUID;
  to_account_id: UUID | null;
  category_id: UUID | null;
  occurred_at: string;
  description: string | null;
  merchant: string | null;
  payment_method: PaymentMethod | null;
  visibility: Visibility;
  created_by: UUID | null;
  receipt_document_id: UUID | null;
  scheduled_payment_id: UUID | null;
  created_at: string;
}

export interface Totals {
  income: Money;
  expense: Money;
  net: Money;
}

export interface CategoryTotal {
  category_id: UUID | null;
  name: string;
  icon: string | null;
  color: string | null;
  amount: Money;
  budget: Money | null;
}

export interface BudgetStatus {
  limit: Money;
  spent: Money;
  remaining: Money;
  percent: number;
  level: "ok" | "warning" | "exceeded";
}

export interface FinanceSummary {
  month: string;
  currency: string;
  family: Totals;
  personal: Totals;
  by_category: CategoryTotal[];
  by_member: { user_id: UUID | null; name: string; expense: Money; income: Money }[];
  daily: { day: string; expense: Money; income: Money }[];
  history: { month: string; expense: Money; income: Money }[];
  budget: BudgetStatus | null;
  category_alerts: CategoryTotal[];
  other_currency_count: number;
}

export interface Budget {
  id: UUID;
  month: string;
  category_id: UUID | null;
  limit_amount: Money;
  spent: Money;
  /** limit − spent, computed by the server; negative when exceeded (older servers omit it). */
  remaining?: Money;
  percent: number;
  level: "ok" | "warning" | "exceeded";
}

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurringRule {
  id: UUID;
  name: string;
  kind: TxKind;
  amount: Money;
  currency: string;
  account_id: UUID | null;
  category_id: UUID | null;
  frequency: Frequency;
  interval: number;
  start_date: string;
  end_date: string | null;
  remind_days_before: number;
  auto_create: boolean;
  active: boolean;
  visibility: Visibility;
  next_due_date: string | null;
}

export interface ScheduledPayment {
  id: UUID;
  rule_id: UUID;
  rule_name: string;
  kind: TxKind;
  due_date: string;
  amount: Money;
  currency: string;
  status: "pending" | "paid" | "skipped";
  transaction_id: UUID | null;
  overdue: boolean;
}

export interface SavingsGoal {
  id: UUID;
  name: string;
  target_amount: Money;
  currency: string;
  target_date: string | null;
  emoji: string | null;
  status: "active" | "achieved" | "archived";
  achieved_at: string | null;
  visibility: Visibility;
  created_by: UUID | null;
  saved: Money;
  percent: number;
  monthly_rate: Money;
  forecast_date: string | null;
  on_track: boolean | null;
}

export interface Contribution {
  id: UUID;
  amount: Money;
  contributed_on: string;
  note: string | null;
  created_by: UUID | null;
  created_at: string;
}

export interface ImportResult {
  created: number;
  skipped_duplicates: number;
  errors: string[];
  dry_run: boolean;
}

// --- Calendar ---

export interface Occurrence {
  event_id: UUID;
  title: string;
  location: string | null;
  category: string | null;
  start: string;
  end: string;
  all_day: boolean;
  recurring: boolean;
  status: "confirmed" | "cancelled";
  visibility: Visibility;
  created_by: UUID | null;
}

export interface CalendarEvent {
  id: UUID;
  title: string;
  description: string | null;
  location: string | null;
  category: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  timezone: string;
  recurrence_freq: Frequency | null;
  recurrence_interval: number;
  recurrence_until: string | null;
  status: "confirmed" | "cancelled";
  visibility: Visibility;
  created_by: UUID | null;
  attendees: { user_id: UUID; name: string; rsvp: "pending" | "accepted" | "declined" }[];
  my_reminders: number[];
}

export interface CustomReminder {
  id: UUID;
  title: string | null;
  remind_at: string | null;
  created_at: string;
}

// --- Shopping ---

export interface ShoppingList {
  id: UUID;
  name: string;
  archived_at: string | null;
  created_by: UUID | null;
  created_at: string;
  updated_at: string;
  items_needed: number;
  items_total: number;
}

export interface ShoppingItem {
  id: UUID;
  list_id: UUID;
  name: string;
  quantity: string | null;
  unit: string | null;
  category: string | null;
  note: string | null;
  estimated_price: Money | null;
  store: string | null;
  status: "needed" | "bought";
  added_by: UUID | null;
  bought_by: UUID | null;
  bought_at: string | null;
  position: number;
  /** YYYY-MM-DD: day to buy it (week planner); a reminder goes out that morning. */
  planned_for: string | null;
  /** Catalogue product the item comes from, and its thumbnail ("local:<code>" or https URL). */
  catalog_id?: string | null;
  image?: string | null;
  updated_at: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  name_pl: string;
  category: string;
  category_label: string;
  unit: string | null;
  image: string;
}

export interface CatalogCategory {
  key: string;
  label: string;
  image: string;
  count: number;
}

export interface CatalogSearch {
  items: CatalogItem[];
  external: { url: string; title: string }[];
  external_enabled: boolean;
}

export interface ShoppingEntry {
  id: UUID;
  name: string;
  quantity: string | null;
  unit: string | null;
  image: string | null;
  category: string | null;
  status: "needed" | "bought";
}

export interface ShoppingListDetail extends ShoppingList {
  items: ShoppingItem[];
  estimated_total: Money;
}

export interface HistoryEntry {
  action: string;
  summary: string | null;
  actor_name: string | null;
  created_at: string;
}

// --- Tasks ---

export type Priority = "low" | "normal" | "high";
export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";

export interface Task {
  id: UUID;
  title: string;
  description: string | null;
  assignee_id: UUID | null;
  due_at: string | null;
  priority: Priority;
  category: string | null;
  status: TaskStatus;
  points: number | null;
  recurrence_freq: Frequency | null;
  recurrence_interval: number;
  completed_at: string | null;
  completed_by: UUID | null;
  visibility: Visibility;
  created_by: UUID | null;
  created_at: string;
  updated_at: string;
  overdue: boolean;
  comments_count: number;
}

export interface TaskComment {
  id: UUID;
  body: string;
  created_by: UUID | null;
  created_at: string;
  author_name: string | null;
}

export interface TaskStats {
  done_this_week: number;
  points_this_week: number;
  done_this_month: number;
  points_this_month: number;
  open_total: number;
  overdue_total: number;
}

// --- Kitchen ---

export interface PantryItem {
  id: UUID;
  name: string;
  quantity: string | null;
  unit: string | null;
  category: string | null;
  expires_on: string | null;
  note: string | null;
  updated_at: string;
  expiring_soon: boolean;
  expired: boolean;
}

export interface Ingredient {
  id?: UUID;
  name: string;
  quantity: string | null;
  unit: string | null;
}

export interface Recipe {
  id: UUID;
  title: string;
  description: string | null;
  instructions: string | null;
  servings: number;
  prep_minutes: number | null;
  tags: string[];
  source: string;
  visibility: Visibility;
  created_by: UUID | null;
  ingredients: Ingredient[];
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface MealEntry {
  id: UUID;
  day: string;
  meal_type: MealType;
  title: string;
  recipe_id: UUID | null;
  servings: number;
}

// --- Life ---

export type LifeKind = "goal" | "wish" | "idea" | "journal" | "note";
export type LifeStatus = "open" | "planned" | "done" | "archived";

export interface LifeItem {
  id: UUID;
  kind: LifeKind;
  title: string;
  body: string | null;
  status: LifeStatus;
  happened_on: string | null;
  planned_for: string | null;
  price: Money | null;
  url: string | null;
  done_at: string | null;
  visibility: Visibility;
  created_by: UUID | null;
  created_at: string;
}

export interface Habit {
  id: UUID;
  title: string;
  target_per_week: number;
  visibility: Visibility;
  created_by: UUID | null;
  week_count: number;
  week_days: string[];
  checked_today_by_me: boolean;
}

// --- Documents ---

export interface DocumentItem {
  id: UUID;
  title: string;
  category: string | null;
  notes: string | null;
  document_date: string | null;
  expires_on: string | null;
  remind_days_before: number | null;
  original_filename: string | null;
  content_type: string | null;
  size_bytes: number;
  has_file: boolean;
  archived_at: string | null;
  visibility: Visibility;
  created_by: UUID | null;
  created_at: string;
}

// --- Notifications ---

export type NotificationCategory =
  | "event_reminder"
  | "payment_due"
  | "task_overdue"
  | "task_assigned"
  | "task_reminder"
  | "shopping_update"
  | "shopping_reminder"
  | "goal_update"
  | "document_expiry"
  | "custom_reminder"
  | "morning_care"
  | "system";

export interface NotificationItem {
  id: UUID;
  family_id: UUID | null;
  category: NotificationCategory;
  title: string;
  body: string | null;
  link: string | null;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationSettings {
  quiet_start: string | null;
  quiet_end: string | null;
  timezone: string | null;
  telegram_enabled: boolean;
  /** "app": the installed Family OS app, Telegram only as a fallback; "both": app and Telegram. */
  channel: "app" | "both";
  categories: Record<NotificationCategory, boolean>;
  bot_started: boolean;
  bot_blocked: boolean;
  push_devices: number;
}

// --- AI ---

export interface Proposal {
  id: UUID;
  tool: string;
  summary: string;
  details: string[];
  status: "pending" | "executing" | "executed" | "cancelled" | "expired" | "failed";
  expires_at: string;
  result: Record<string, unknown> | null;
  error: string | null;
}

export interface ChatResponse {
  conversation_id: UUID;
  reply: string;
  actions: { tool: string; status: string; summary: string }[];
  proposals: Proposal[];
}

export interface AiStatus {
  available: boolean;
  enabled_for_family: boolean;
  reason: string | null;
  requests_today: number;
  requests_limit: number;
  tokens_today: number;
  tokens_limit: number;
  auto_execute: boolean;
}

export interface Conversation {
  id: UUID;
  title: string | null;
  channel: "app" | "bot";
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiMessage {
  id: UUID;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface Memory {
  id: UUID;
  content: string;
  visibility: Visibility;
  created_by: UUID | null;
  created_at: string;
}

// --- Dashboard ---

export interface Activity {
  action: string;
  entity_type: string;
  entity_id: UUID | null;
  summary: string | null;
  actor_name: string | null;
  is_me: boolean;
  created_at: string;
}

export interface Dashboard {
  user_name: string;
  family_name: string;
  currency: string;
  month_family: Totals;
  month_personal: Totals;
  budget: BudgetStatus | null;
  events: Occurrence[];
  payments: ScheduledPayment[];
  shopping: { list_id: UUID | null; list_name: string | null; needed_total: number; items: string[]; entries?: ShoppingEntry[] };
  my_tasks: Task[];
  task_stats: TaskStats;
  goals: SavingsGoal[];
  life_goals_open: number;
  activity: Activity[];
  unread_notifications: number;
  is_empty: boolean;
}
