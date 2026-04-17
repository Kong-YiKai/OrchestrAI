export type MessageType = 'text' | 'workflow_generated' | 'node_update' | 'system';

export interface AISender {
  id: string;
  name: string;
  avatar: string;
  model: string;
  color: string;
}

export interface ChatMessage {
  message_id: string;
  sender: AISender;
  content: string;
  content_en?: string;
  message_type: MessageType;
  timestamp: string;
  is_streaming?: boolean;
  workflow_ref?: string | null;
}
