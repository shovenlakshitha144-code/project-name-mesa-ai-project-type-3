export type LanguageMode = 'auto' | 'en' | 'si' | 'mixed';

export type AvatarExpression =
  | 'neutral'
  | 'happy'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'alert';

export type AIProviderId =
  | 'gemini'
  | 'openai'
  | 'groq'
  | 'openrouter'
  | 'ollama'
  | 'custom';

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  organization: string;
  role: string;
  preferredLanguage: LanguageMode;
  currency: string;
  createdAt: string;
}

export interface AuthState {
  initialized: boolean;
  authenticated: boolean;
  user: UserProfile | null;
}

export interface AIProviderStatus {
  activeProvider: AIProviderId;
  activeModel: string;
  customBaseUrl: string;
  ollamaBaseUrl: string;
  configuredProviders: Record<AIProviderId, boolean>;
  temperature: number;
  systemNotes: string;
}

export interface MemoryItem {
  id: string;
  category: 'conversation' | 'business' | 'project' | 'preference' | 'task' | 'decision';
  title: string;
  content: string;
  importance: number; // 1-5
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatThread {
  id: string;
  title: string;
  language: LanguageMode;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  expression?: AvatarExpression;
  actionsTaken?: Array<{ tool: string; status: 'executed' | 'failed' | 'unavailable'; summary: string }>;
  createdAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'completed';
  dueDate: string | null;
  category: string;
  completedAt: string | null;
  createdAt: string;
}

export interface ReminderItem {
  id: string;
  title: string;
  notes: string;
  remindAt: string;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  status: 'pending' | 'triggered' | 'dismissed';
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  type: 'meeting' | 'deadline' | 'personal' | 'schedule';
  location: string;
  createdAt: string;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoalItem {
  id: string;
  title: string;
  description: string;
  targetDate: string | null;
  progress: number; // 0-100
  status: 'active' | 'completed' | 'paused';
  milestones: string[];
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  status: 'lead' | 'active' | 'vip' | 'inactive';
  notes: string;
  createdAt: string;
}

export interface BusinessProject {
  id: string;
  title: string;
  customerId: string | null;
  customerName?: string;
  description: string;
  status: 'planning' | 'in_progress' | 'review' | 'pending' | 'completed' | 'on_hold';
  priority: 'low' | 'medium' | 'high';
  budget: number;
  startDate: string | null;
  deadline: string | null;
  deliverables: Array<{ id: string; text: string; done: boolean }>;
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  currency: string;
  description: string;
  date: string;
  paymentMethod: string;
  projectId: string | null;
  invoiceId: string | null;
  createdAt: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  category: string;
  description: string;
  basePrice: number;
  deliveryDays: number;
  active: boolean;
  createdAt: string;
}

export interface PricingTier {
  id: string;
  name: string;
  serviceId: string | null;
  billingCycle: 'one_time' | 'monthly' | 'yearly' | 'hourly';
  price: number;
  currency: string;
  features: string[];
  popular: boolean;
  createdAt: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  docType: 'invoice' | 'quotation';
  customerId: string | null;
  customerName: string;
  customerEmail: string;
  customerAddress: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  items: InvoiceLineItem[];
  taxRate: number;
  discount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  notes: string;
  createdAt: string;
}

export interface CustomerDocument {
  id: string;
  customerId: string | null;
  customerName?: string;
  projectId: string | null;
  title: string;
  docType: 'contract' | 'proposal' | 'brief' | 'receipt' | 'other';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  notes: string;
  createdAt: string;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  channel: 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'google_ads' | 'email' | 'other';
  status: 'planned' | 'active' | 'paused' | 'completed';
  budget: number;
  spent: number;
  targetAudience: string;
  startDate: string | null;
  endDate: string | null;
  notes: string;
  createdAt: string;
}

export interface ContentDraft {
  id: string;
  platform:
    | 'facebook_post'
    | 'instagram_caption'
    | 'tiktok_caption'
    | 'youtube_description'
    | 'ad_script'
    | 'business_promotion'
    | 'ai_video_prompt'
    | 'content_ideas';
  language: LanguageMode;
  topic: string;
  tone: string;
  generatedText: string;
  createdAt: string;
}
