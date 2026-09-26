export interface Receipt {
  id?: string;
  recipient_user_id?: string | null;
  child_app_connection_id?: string | null;
  delivered_at?: string | null;
  seen_at?: string | null;
  read_at?: string | null;
  heard_at?: string | null;
}
export interface Media {
  id: string;
  media_kind?: string;
  mime_type?: string;
  size_bytes?: number;
  file_name?: string | null;
  duration_ms?: number | null;
  width?: number | null;
  height?: number | null;
  waveform?: number[] | null;
  upload_state?: string;
  server_expires_at?: string | null;
  deleted_from_storage_at?: string | null;
  signed_url?: string;
  signed_url_expires_at?: string;
}
export interface Message {
  id: string;
  conversation_id: string;
  sender_kind: string;
  sender_user_id?: string | null;
  child_app_connection_id?: string | null;
  client_message_id?: string | null;
  message_kind: "text" | "voice" | "image" | "video" | "document";
  text_body?: string | null;
  media_object_id?: string | null;
  created_at: string;
  active_in_walkie_talkie?: boolean;
  reply_to_message_id?: string | null;
  local_only?: boolean;
  local_send_state?: string;
  media_objects: Media | null;
  message_receipts: Receipt[];
  message_reactions: Array<
    {
      id: string;
      user_id: string;
      emoji: string;
      created_at: string;
      updated_at: string;
    }
  >;
  message_speech_artifacts: Array<
    {
      id: string;
      artifact_kind: string;
      language_code?: string;
      text_body?: string | null;
      media_objects: Media | null;
    }
  >;
}
export interface Conversation {
  id: string;
  mode: "history" | "walkie_talkie";
  title?: string | null;
  updated_at?: string;
  unread_count?: number;
  blocked_by_you: boolean;
  user_preferences: {
    muted_at?: string | null;
    blurred_at?: string | null;
    history_cleared_at?: string | null;
  };
  conversation_members: Array<{
    id: string;
    member_kind: string;
    user_id?: string | null;
    child_app_connection_id?: string | null;
    left_at?: string | null;
    app_users: {
      display_name?: string | null;
      phone_e164?: string;
      avatar_url?: string | null;
      deleted_at?: string | null;
    };
    child_app_connections: {
      child_original_name?: string;
      status?: string;
      disconnected_at?: string | null;
      external_account_deleted_at?: string | null;
      external_avatar_url?: string | null;
      capabilities?: Record<string, unknown>;
      monitoring_disclosure?: unknown;
      child_apps: { name?: string };
    } | null;
  }>;
}
export interface ConversationPage {
  conversations: Conversation[];
  messages: Message[];
  deletedConversations: Array<
    { conversationId: string; historyClearedAt: string | null }
  >;
}
export interface MessagePage {
  messages: Message[];
  has_more: boolean;
  next_before: string | null;
  next_before_id: string | null;
}
export interface UploadTicket {
  media: Media;
  signedUrl: string;
  token: string;
  path: string;
  thumbnailUpload: { signedUrl: string; token: string; path: string } | null;
}
